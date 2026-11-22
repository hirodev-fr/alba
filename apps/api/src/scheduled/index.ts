import { createDb } from "@alba/db";
import { acknowledgeDispatch, reserveDueChecks } from "@alba/tracking";

import { dispatchDueChecks } from "./dispatch";
import type { WorkflowBinding } from "./dispatch";

export interface SchedulerEnv {
  DATABASE_URL?: string;
  DISPATCH_ENABLED?: string;
  PRICE_CHECK?: WorkflowBinding;
}

export const scheduled = async (_controller: unknown, env: SchedulerEnv) => {
  if (env.DISPATCH_ENABLED !== "true") {
    return;
  }
  if (!env.DATABASE_URL || !env.PRICE_CHECK) {
    throw new Error("Dispatcher bindings unavailable");
  }
  const db = createDb(env.DATABASE_URL);
  const result = await dispatchDueChecks(
    {
      reserve: () => reserveDueChecks(db),
      acknowledge: (item) => acknowledgeDispatch(db, item),
    },
    env.PRICE_CHECK
  );
  if (result.deferred > 0) {
    throw new Error(
      `Dispatcher deferred ${result.deferred} of ${result.reserved} reservations`
    );
  }
};
