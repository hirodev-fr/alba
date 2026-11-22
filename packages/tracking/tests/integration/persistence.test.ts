import { expect, test } from "bun:test";

import type { ExtractedPrice, ExtractionResultV1 } from "@alba/contracts";
import {
  extractionAttempts,
  priceChecks,
  priceObservations,
  productSchedules,
  trackings,
  user,
} from "@alba/db";
import { eq, sql } from "drizzle-orm";

import { finalizeCheck, getCurrentObservation } from "../../src";
import { createProduct, db, testUserIds } from "./setup";

const price: ExtractedPrice = {
  amount: "9007199254740993.123456789",
  currency: "EUR",
  availability: "in_stock",
  title: "Blue product",
  observedAt: "2026-11-22T12:00:00.123Z",
  sourceUrl: "https://shop.example/product",
  provenance: { provider: "zyte", mode: "http" },
};
const success: ExtractionResultV1 = { version: 1, status: "success", price };
const errorResult: ExtractionResultV1 = {
  version: 1,
  status: "error",
  error: {
    category: "business",
    code: "missing_price",
    message: "No price found",
  },
};
const newCheck = async (productId: string, scheduledAt = new Date()) => {
  const [row] = await db
    .insert(priceChecks)
    .values({ id: crypto.randomUUID(), productId, scheduledAt })
    .returning();
  if (!row) {
    throw new Error("Test check was not inserted");
  }
  return row;
};

test("concurrent finalization creates one observation and preserves decimal and UTC precision", async () => {
  const product = await createProduct();
  const check = await newCheck(product.id);
  const states = await Promise.all(
    Array.from({ length: 8 }, () =>
      finalizeCheck(db, { checkId: check.id, result: success })
    )
  );
  expect(states.every((state) => state.status === "succeeded")).toBe(true);
  expect(new Set(states.map((state) => state.observationId)).size).toBe(1);
  const observations = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, check.id));
  expect(observations).toHaveLength(1);
  const current = await getCurrentObservation(db, product.id);
  expect(current?.price).toEqual(price);
  const replay = await finalizeCheck(db, {
    checkId: check.id,
    result: errorResult,
  });
  expect(replay).toEqual(states[0]);
});

test("failed and cancelled checks remain terminal without observations", async () => {
  const product = await createProduct();
  const check = await newCheck(product.id);
  const failed = await finalizeCheck(db, {
    checkId: check.id,
    result: errorResult,
  });
  expect(failed.status).toBe("failed");
  expect(failed.error).toEqual(errorResult.error);
  expect(
    await finalizeCheck(db, {
      checkId: check.id,
      result: success,
    })
  ).toEqual(failed);
  const cancelled = await newCheck(
    product.id,
    new Date(check.scheduledAt.getTime() + 1)
  );
  await db
    .update(priceChecks)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(priceChecks.id, cancelled.id));
  const cancelledReplay = await finalizeCheck(db, {
    checkId: cancelled.id,
    result: success,
  });
  expect(cancelledReplay.status).toBe("cancelled");
  expect(await getCurrentObservation(db, product.id)).toBeNull();
  await expect(
    finalizeCheck(db, { checkId: "missing-check", result: errorResult })
  ).rejects.toThrow("not found");
});

test("competing success and error finalizations keep a coherent terminal state", async () => {
  const product = await createProduct();
  const check = await newCheck(product.id);
  const [first, second] = await Promise.all([
    finalizeCheck(db, {
      checkId: check.id,
      result: success,
    }),
    finalizeCheck(db, { checkId: check.id, result: errorResult }),
  ]);
  expect(first).toEqual(second);
  const rows = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, check.id));
  expect(rows).toHaveLength(first.status === "succeeded" ? 1 : 0);
});

test("a failed final status update rolls back the observation and allows a later retry", async () => {
  const product = await createProduct();
  const check = await newCheck(product.id);
  const triggerName = `b04_fail_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.execute(
    sql.raw(
      `create function "${triggerName}"() returns trigger language plpgsql as $body$ begin if new.id = '${check.id}' then raise exception 'injected SQL failure'; end if; return new; end $body$`
    )
  );
  await db.execute(
    sql`create trigger ${sql.identifier(triggerName)} before update on price_checks for each row execute function ${sql.identifier(triggerName)}()`
  );
  try {
    await expect(
      finalizeCheck(db, {
        checkId: check.id,
        result: success,
      })
    ).rejects.toThrow();
    expect(await getCurrentObservation(db, product.id)).toBeNull();
    const [unchanged] = await db
      .select()
      .from(priceChecks)
      .where(eq(priceChecks.id, check.id));
    expect(unchanged?.status).toBe("pending");
  } finally {
    await db.execute(
      sql`drop trigger ${sql.identifier(triggerName)} on price_checks`
    );
    await db.execute(sql`drop function ${sql.identifier(triggerName)}()`);
  }
  const retried = await finalizeCheck(db, {
    checkId: check.id,
    result: success,
  });
  expect(retried.status).toBe("succeeded");
});

test("late observations never replace a more recent price", async () => {
  const product = await createProduct();
  const newer = await newCheck(product.id, new Date("2026-11-22T12:00:00Z"));
  const older = await newCheck(product.id, new Date("2026-11-22T11:00:00Z"));
  await finalizeCheck(db, {
    checkId: newer.id,
    result: success,
  });
  await finalizeCheck(db, {
    checkId: older.id,
    result: {
      version: 1,
      status: "success",
      price: {
        ...price,
        amount: "0.00",
        observedAt: "2026-11-22T11:00:00.000Z",
      },
    },
  });
  const current = await getCurrentObservation(db, product.id);
  expect(current?.checkId).toBe(newer.id);
  const [oldObservation] = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, older.id));
  expect(oldObservation?.amount).toBe("0.00");
});

test("SQL rejects duplicate due checks, workflow IDs, attempts and observations", async () => {
  const product = await createProduct();
  const check = await newCheck(product.id);
  await expect(newCheck(product.id, check.scheduledAt)).rejects.toThrow();
  const workflowId = crypto.randomUUID();
  await db
    .update(priceChecks)
    .set({ workflowId })
    .where(eq(priceChecks.id, check.id));
  const other = await newCheck(
    product.id,
    new Date(check.scheduledAt.getTime() + 1)
  );
  await expect(
    db
      .update(priceChecks)
      .set({ workflowId })
      .where(eq(priceChecks.id, other.id))
      .execute()
  ).rejects.toThrow();
  const attempt = {
    id: crypto.randomUUID(),
    checkId: check.id,
    attemptNumber: 1,
    mode: "http" as const,
    startedAt: new Date(),
  };
  await db.insert(extractionAttempts).values(attempt);
  await expect(
    db
      .insert(extractionAttempts)
      .values({ ...attempt, id: crypto.randomUUID() })
      .execute()
  ).rejects.toThrow();
  await finalizeCheck(db, {
    checkId: check.id,
    result: success,
  });
  const [observation] = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, check.id));
  if (!observation) {
    throw new Error("Missing observation");
  }
  await expect(
    db
      .insert(priceObservations)
      .values({ ...observation, id: crypto.randomUUID() })
      .execute()
  ).rejects.toThrow();
  await expect(
    db
      .update(priceChecks)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        observationId: observation.id,
      })
      .where(eq(priceChecks.id, other.id))
      .execute()
  ).rejects.toThrow();
});

test("SQL enforces ownership references, tracking periods, frequencies and paired leases", async () => {
  const product = await createProduct();
  const userId = crypto.randomUUID();
  testUserIds.add(userId);
  const tracking = {
    id: crypto.randomUUID(),
    productId: product.id,
    userId,
    intervalSeconds: 60,
    startsAt: new Date("2026-11-22"),
    endsAt: new Date("2026-11-23"),
  };
  await expect(
    db.insert(trackings).values(tracking).execute()
  ).rejects.toThrow();
  await db
    .insert(user)
    .values({ id: userId, name: "B04 test", email: `${userId}@example.test` });
  await expect(
    db
      .insert(trackings)
      .values({ ...tracking, endsAt: tracking.startsAt })
      .execute()
  ).rejects.toThrow();
  await expect(
    db
      .insert(trackings)
      .values({ ...tracking, intervalSeconds: 59 })
      .execute()
  ).rejects.toThrow();
  await db.insert(trackings).values(tracking);
  await expect(
    db
      .insert(productSchedules)
      .values({
        productId: product.id,
        intervalSeconds: 60,
        nextCheckAt: new Date(),
        leaseToken: "unpaired",
      })
      .execute()
  ).rejects.toThrow();
  await db.insert(productSchedules).values({
    productId: product.id,
    intervalSeconds: 60,
    nextCheckAt: new Date(),
  });
  await expect(
    db
      .insert(productSchedules)
      .values({
        productId: product.id,
        intervalSeconds: 60,
        nextCheckAt: new Date(),
      })
      .execute()
  ).rejects.toThrow();
});

test("SQL rejects invalid amounts, currency, lifecycle fields and cross-product observations", async () => {
  const product = await createProduct();
  const otherProduct = await createProduct();
  const check = await newCheck(product.id);
  await expect(
    db
      .update(priceChecks)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(priceChecks.id, check.id))
      .execute()
  ).rejects.toThrow();
  await finalizeCheck(db, {
    checkId: check.id,
    result: success,
  });
  const [observation] = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, check.id));
  if (!observation) {
    throw new Error("Missing observation");
  }
  await Promise.all(
    ["-1", "NaN", "Infinity", "-Infinity"].map(async (amount) => {
      await expect(
        db
          .update(priceObservations)
          .set({ amount })
          .where(eq(priceObservations.id, observation.id))
          .execute()
      ).rejects.toThrow();
    })
  );
  await expect(
    db
      .update(priceObservations)
      .set({ currency: "eur" })
      .where(eq(priceObservations.id, observation.id))
      .execute()
  ).rejects.toThrow();
  await expect(
    db
      .update(priceObservations)
      .set({ productId: otherProduct.id })
      .where(eq(priceObservations.id, observation.id))
      .execute()
  ).rejects.toThrow();
  await expect(
    db
      .insert(extractionAttempts)
      .values({
        id: crypto.randomUUID(),
        checkId: check.id,
        attemptNumber: 1,
        mode: "http",
        status: "succeeded",
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 1,
        result: sql`'{}'::jsonb`,
      })
      .execute()
  ).rejects.toThrow();
  const current = await getCurrentObservation(db, product.id);
  expect(current?.price.amount).toBe(price.amount);
});
