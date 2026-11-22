import { afterAll } from "bun:test";

import {
  createDb,
  extractionAttempts,
  priceChecks,
  priceObservations,
  products,
  productSchedules,
  trackings,
  user,
} from "@alba/db";
import { inArray } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "db:test requires DATABASE_URL for the Neon development project provisioned by alchemy dev"
  );
}

export const db = createDb(databaseUrl);
const testProductIds = new Set<string>();
export const testUserIds = new Set<string>();

export const createProduct = async () => {
  const id = crypto.randomUUID();
  const [product] = await db
    .insert(products)
    .values({
      id,
      identityKey: id.replaceAll("-", "").repeat(2),
      url: `https://shop.example/${id}`,
      context: {
        variant: {},
        country: "FR",
        expectedCurrency: "EUR",
        seller: null,
      },
    })
    .returning();
  if (!product) {
    throw new Error("Test product was not inserted");
  }
  testProductIds.add(product.id);
  return product;
};

afterAll(async () => {
  const ids = [...testProductIds];
  if (ids.length === 0) {
    return;
  }
  // Break the observation/check cycle, then delete only this run's synthetic rows.
  const checks = await db
    .select({ id: priceChecks.id })
    .from(priceChecks)
    .where(inArray(priceChecks.productId, ids));
  const checkIds = checks.map((check) => check.id);
  await db.batch([
    db
      .update(priceChecks)
      .set({
        status: "cancelled",
        finishedAt: new Date(),
        observationId: null,
        error: null,
      })
      .where(inArray(priceChecks.productId, ids)),
    db
      .delete(extractionAttempts)
      .where(inArray(extractionAttempts.checkId, checkIds)),
    db
      .delete(priceObservations)
      .where(inArray(priceObservations.productId, ids)),
    db.delete(priceChecks).where(inArray(priceChecks.productId, ids)),
    db.delete(productSchedules).where(inArray(productSchedules.productId, ids)),
    db.delete(trackings).where(inArray(trackings.productId, ids)),
    db.delete(products).where(inArray(products.id, ids)),
    db.delete(user).where(inArray(user.id, [...testUserIds])),
  ]);
});
