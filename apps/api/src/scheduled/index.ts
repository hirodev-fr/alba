import { createDb } from "@alba/db";
import {
  acknowledgeDispatch,
  reserveDueChecks,
  reserveReconciliation,
  reconcileTerminalCheck,
} from "@alba/tracking";

import { dispatchDueChecks } from "./dispatch";
import type { WorkflowBinding } from "./dispatch";
import { reconcileChecks } from "./reconcile";

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
  const reconciliation = await reconcileChecks(
    {
      reserve: () => reserveReconciliation(db),
      finalize: (checkId, status) =>
        reconcileTerminalCheck(db, checkId, status),
    },
    env.PRICE_CHECK
  ).catch(() => null);
  const result = await dispatchDueChecks(
    {
      reserve: () => reserveDueChecks(db),
      acknowledge: (item) => acknowledgeDispatch(db, item),
    },
    env.PRICE_CHECK
  );
  if (result.deferred > 0 || !reconciliation || reconciliation.deferred > 0) {
    throw new Error(
      `Scheduler deferred dispatch=${result.deferred}; reconciliation=${reconciliation?.deferred ?? "unavailable"}`
    );
  }
};
