import type {
  ReconcileCandidate,
  TerminalWorkflowStatus,
} from "@alba/tracking";

import type { WorkflowBinding } from "./dispatch";

export interface ReconcileOperations {
  reserve: () => Promise<ReconcileCandidate[]>;
  finalize: (
    checkId: string,
    status: TerminalWorkflowStatus
  ) => Promise<unknown>;
}

const readStatus = async (workflow: WorkflowBinding, id: string) => {
  const instance = await workflow.get(id);
  const value = await instance.status();
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    value.status === "unknown"
  ) {
    throw new Error("Workflow status unavailable");
  }
  return value.status;
};

const reconcileOne = async (
  operations: ReconcileOperations,
  workflow: WorkflowBinding,
  item: ReconcileCandidate
) => {
  // B07 guarantees this identity. Never start a replacement for legacy data.
  if (item.workflowId !== item.checkId) {
    throw new Error("Workflow identity mismatch");
  }
  let status: string;
  try {
    status = await readStatus(workflow, item.workflowId);
  } catch {
    if (item.status !== "pending") {
      throw new Error("Running workflow status unavailable");
    }
    // An uncertain start can only be retried with its original unique ID.
    try {
      await workflow.create({
        id: item.checkId,
        params: { version: 1, checkId: item.checkId },
      });
      return "started" as const;
    } catch {
      status = await readStatus(workflow, item.workflowId);
    }
  }
  if (
    status === "complete" ||
    status === "errored" ||
    status === "terminated"
  ) {
    await operations.finalize(item.checkId, status);
    return "finalized" as const;
  }
  if (
    ["queued", "running", "waiting", "paused", "waitingForPause"].includes(
      status
    )
  ) {
    return "active" as const;
  }
  throw new Error("Unrecognized workflow status");
};

export const reconcileChecks = async (
  operations: ReconcileOperations,
  workflow: WorkflowBinding
) => {
  const candidates = await operations.reserve();
  const results = await Promise.allSettled(
    candidates.map((item) => reconcileOne(operations, workflow, item))
  );
  return {
    inspected: candidates.length,
    finalized: results.filter(
      (r) => r.status === "fulfilled" && r.value === "finalized"
    ).length,
    started: results.filter(
      (r) => r.status === "fulfilled" && r.value === "started"
    ).length,
    active: results.filter(
      (r) => r.status === "fulfilled" && r.value === "active"
    ).length,
    deferred: results.filter((r) => r.status === "rejected").length,
  };
};
