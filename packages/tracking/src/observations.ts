import type { PriceObservationV1 } from "@alba/contracts";
import { priceObservationV1Schema } from "@alba/contracts";
import type { Database } from "@alba/db";
import { priceObservations } from "@alba/db";
import { desc, eq } from "drizzle-orm";

const toObservation = (
  row: typeof priceObservations.$inferSelect
): PriceObservationV1 =>
  priceObservationV1Schema.parse({
    version: 1,
    id: row.id,
    productId: row.productId,
    checkId: row.checkId,
    price: {
      amount: row.amount,
      currency: row.currency,
      availability: row.availability,
      title: row.title,
      observedAt: row.observedAt.toISOString(),
      sourceUrl: row.sourceUrl,
      provenance: { provider: row.provider, mode: row.mode },
    },
  });

// Derive the current value from history: late finalization cannot overwrite newer data.
export const getCurrentObservation = async (
  db: Database,
  productId: string
) => {
  const [row] = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.productId, productId))
    .orderBy(desc(priceObservations.observedAt), desc(priceObservations.id))
    .limit(1);
  return row ? toObservation(row) : null;
};
