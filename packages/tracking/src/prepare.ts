import { extractionRequestV1Schema, idSchema } from "@alba/contracts";
import type { Database } from "@alba/db";
import { priceChecks, products } from "@alba/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";

export class InvalidCheckError extends Error {
  override name = "InvalidCheckError";
}

// The check is the durable obligation. B08 creates it from active schedules.
export const prepareCheck = async (
  db: Database,
  checkId: string,
  workflowId: string
) => {
  idSchema.parse(checkId);
  if (workflowId !== checkId) {
    throw new InvalidCheckError("Workflow ID must equal check ID");
  }
  const { 2: rows } = await db.batch([
    db
      .select({ id: priceChecks.id })
      .from(priceChecks)
      .where(eq(priceChecks.id, checkId))
      .for("update"),
    db
      .update(priceChecks)
      .set({
        status: "running",
        workflowId,
        startedAt: sql`coalesce(${priceChecks.startedAt}, now())`,
        request: sql`coalesce(${priceChecks.request}, (select jsonb_build_object('version', 1, 'mode', 'http', 'offer', jsonb_build_object('url', ${products.url}, 'context', ${products.context})) from ${products} where ${products.id} = ${priceChecks.productId}))`,
      })
      .where(
        and(
          eq(priceChecks.id, checkId),
          eq(priceChecks.status, "pending"),
          or(
            isNull(priceChecks.workflowId),
            eq(priceChecks.workflowId, workflowId)
          )
        )
      ),
    db.select().from(priceChecks).where(eq(priceChecks.id, checkId)),
  ]);
  const [row] = rows;
  if (!row) {
    throw new InvalidCheckError("Price check not found");
  }
  if (["succeeded", "failed", "cancelled"].includes(row.status)) {
    return { status: "terminal" as const, checkStatus: row.status };
  }
  if (row.workflowId !== workflowId || row.status !== "running") {
    throw new InvalidCheckError("Price check belongs to another workflow");
  }
  const request = extractionRequestV1Schema.safeParse(row.request);
  if (!request.success || request.data.mode !== "http") {
    throw new InvalidCheckError("Invalid frozen HTTP extraction request");
  }
  return { status: "ready" as const, request: request.data };
};
