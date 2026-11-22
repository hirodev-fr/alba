import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

// Skeleton only: no extraction or public trigger.
export class PriceCheckWorkflow extends WorkflowEntrypoint<
  Env,
  { checkId: string }
> {
  // Cloudflare requires an instance method for the workflow entrypoint.
  // oxlint-disable-next-line eslint/class-methods-use-this
  run(event: WorkflowEvent<{ checkId: string }>, _step: WorkflowStep) {
    return Promise.resolve({
      checkId: event.payload.checkId,
      status: "not-implemented" as const,
    });
  }
}
type Env = Record<string, never>;
export default { fetch: () => new Response("Not found", { status: 404 }) };
