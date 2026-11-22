import type { ExtractionResultV1 } from "@alba/contracts";
import { extractionResultV1Schema, idSchema } from "@alba/contracts";
import type { Database } from "@alba/db";
import { priceChecks, priceObservations } from "@alba/db";
import { and, eq, inArray, sql } from "drizzle-orm";

export const finalizeCheck = async (
  db: Database,
  input: {
    checkId: string;
    result: ExtractionResultV1;
  }
) => {
  const checkId = idSchema.parse(input.checkId);
  const result = extractionResultV1Schema.parse(input.result);
  const mutableCheck = and(
    eq(priceChecks.id, checkId),
    inArray(priceChecks.status, ["pending", "running"])
  );
  const lock = db
    .select({ id: priceChecks.id })
    .from(priceChecks)
    .where(eq(priceChecks.id, checkId))
    .for("update");
  const read = db.select().from(priceChecks).where(eq(priceChecks.id, checkId));

  if (result.status === "error") {
    const batch = await db.batch([
      lock,
      db
        .update(priceChecks)
        .set({ status: "failed", finishedAt: new Date(), error: result.error })
        .where(mutableCheck),
      read,
    ]);
    const { 2: rows } = batch;
    if (!rows[0]) {
      throw new Error("Price check not found");
    }
    return rows[0];
  }

  const { price } = result;
  const batch = await db.batch([
    lock,
    db.execute(sql`
      insert into ${priceObservations} (id, product_id, check_id, amount, currency, availability, title, observed_at, source_url, provider, mode)
      select ${crypto.randomUUID()}, ${priceChecks.productId}, ${priceChecks.id}, ${price.amount}::numeric,
        ${price.currency}, ${price.availability}::availability, ${price.title}, ${price.observedAt}::timestamptz,
        ${price.sourceUrl}, ${price.provenance.provider}, ${price.provenance.mode}::extraction_mode
      from ${priceChecks} where ${mutableCheck}
      on conflict (check_id) do nothing
    `),
    db
      .update(priceChecks)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        error: null,
        observationId: sql`(select id from ${priceObservations} where check_id = ${checkId})`,
      })
      .where(mutableCheck),
    read,
  ]);
  const { 3: rows } = batch;
  if (!rows[0]) {
    throw new Error("Price check not found");
  }
  return rows[0];
};
