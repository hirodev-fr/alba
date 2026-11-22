import { extractionResultV1Schema, idSchema } from "@alba/contracts";
import type { Database } from "@alba/db";
import { extractionAttempts } from "@alba/db";
import { desc, eq, sql } from "drizzle-orm";

import { finalizeCheck } from "./checks";

export interface ReconcileCandidate {
  checkId: string;
  workflowId: string;
  status: "pending" | "running";
}
export type TerminalWorkflowStatus = "complete" | "errored" | "terminated";

// The next inspection is committed before remote I/O. Crashes and inaccessible
// instances rotate behind uninspected work, including across overlapping crons.
export const reserveReconciliation = async (
  db: Database,
  limit = 20
): Promise<ReconcileCandidate[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Reconciliation batch size must be between 1 and 100");
  }
  const result = await db.execute(sql`
    with candidates as materialized (
      select id from price_checks
      where status in ('pending', 'running') and next_reconcile_at <= now()
      order by next_reconcile_at, id
      limit ${limit} for update skip locked
    )
    update price_checks c set next_reconcile_at = now() + interval '2 minutes'
    from candidates d where c.id = d.id
    returning c.id, c.workflow_id, c.status
  `);
  return result.rows.map((row) => {
    if (row.status !== "pending" && row.status !== "running") {
      throw new Error("Invalid reconciliation candidate");
    }
    return {
      checkId: idSchema.parse(row.id),
      workflowId: idSchema.parse(row.workflow_id ?? row.id),
      status: row.status,
    };
  });
};

// Only call after a terminal runtime status has been observed. No provider I/O.
export const reconcileTerminalCheck = async (
  db: Database,
  checkId: string,
  status: TerminalWorkflowStatus
) => {
  const [attempt] = await db
    .select()
    .from(extractionAttempts)
    .where(eq(extractionAttempts.checkId, idSchema.parse(checkId)))
    .orderBy(desc(extractionAttempts.attemptNumber))
    .limit(1);
  const saved = extractionResultV1Schema.safeParse(attempt?.result);
  // An early temporary failure is not the final extraction outcome: a later
  // call could have succeeded without its SQL journal being committed.
  if (
    saved.success &&
    (saved.data.status === "success" ||
      saved.data.error.category !== "temporary" ||
      (attempt?.attemptNumber ?? 0) >= 3)
  ) {
    return finalizeCheck(db, { checkId, result: saved.data });
  }
  return finalizeCheck(db, {
    checkId,
    result: {
      version: 1,
      status: "error",
      error: {
        category: "permanent",
        code: "workflow_failed",
        message: `Workflow ${status} without a recoverable extraction result.`,
      },
    },
  });
};
