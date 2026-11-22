import { expect, test } from "bun:test";

import type { ExtractionResultV1 } from "@alba/contracts";
import {
  priceChecks,
  priceObservations,
  productSchedules,
  trackings,
  user,
} from "@alba/db";
import { eq, sql } from "drizzle-orm";

import {
  finalizeCheck,
  prepareCheck,
  recordAttempt,
  reconcileTerminalCheck,
  reserveReconciliation,
  reserveDueChecks,
} from "../../src";
import { createProduct, db, testUserIds } from "./setup";

const fixture = async () => {
  const product = await createProduct();
  const id: string = crypto.randomUUID();
  await db.insert(priceChecks).values({
    id,
    productId: product.id,
    scheduledAt: new Date(),
    workflowId: id,
    nextReconcileAt: new Date(0),
  });
  const result: ExtractionResultV1 = {
    version: 1,
    status: "success",
    price: {
      amount: "51.770",
      currency: "EUR",
      availability: "in_stock",
      title: null,
      observedAt: new Date().toISOString(),
      sourceUrl: product.url,
      provenance: { provider: "zyte", mode: "http" },
    },
  };
  return { id, result };
};
const record = (id: string, result: ExtractionResultV1, attemptNumber = 1) =>
  recordAttempt(db, {
    checkId: id,
    result,
    attemptNumber,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

test("concurrent terminal reconciliation recovers saved success once", async () => {
  const { id, result } = await fixture();
  await prepareCheck(db, id, id);
  await record(id, result);
  const [a, b] = await Promise.all([
    reconcileTerminalCheck(db, id, "errored"),
    reconcileTerminalCheck(db, id, "errored"),
  ]);
  expect(a).toEqual(b);
  expect(a.status).toBe("succeeded");
  const observations = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, id));
  expect(observations).toHaveLength(1);
  expect(observations[0]?.amount).toBe("51.770");
});

test("terminal instance without a saved result fails and cannot overwrite a concurrent finalization", async () => {
  const { id, result } = await fixture();
  const [a, b] = await Promise.all([
    reconcileTerminalCheck(db, id, "terminated"),
    finalizeCheck(db, { checkId: id, result }),
  ]);
  expect(a).toEqual(b);
  expect(["failed", "succeeded"]).toContain(a.status);
  const observations = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, id));
  expect(observations).toHaveLength(a.status === "succeeded" ? 1 : 0);
  const other = await fixture();
  const failed = await reconcileTerminalCheck(db, other.id, "complete");
  expect(failed.status).toBe("failed");
  expect(failed.error?.code).toBe("workflow_failed");
  expect(await reconcileTerminalCheck(db, other.id, "errored")).toEqual(failed);
});

test("recovers final business errors and exhausted retries but not intermediate temporary failures", async () => {
  const business: ExtractionResultV1 = {
    version: 1,
    status: "error",
    error: { category: "business", code: "missing_price", message: "No price" },
  };
  const temporary: ExtractionResultV1 = {
    version: 1,
    status: "error",
    error: {
      category: "temporary",
      code: "network",
      message: "Connection failed",
    },
  };
  const [a, b, c] = await Promise.all([fixture(), fixture(), fixture()]);
  await Promise.all([
    record(a.id, business),
    record(b.id, temporary, 3),
    record(c.id, temporary),
  ]);
  const recovered = await Promise.all([
    reconcileTerminalCheck(db, a.id, "errored"),
    reconcileTerminalCheck(db, b.id, "errored"),
    reconcileTerminalCheck(db, c.id, "errored"),
  ]);
  expect(recovered[0]?.error).toEqual(business.error);
  expect(recovered[1]?.error).toEqual(temporary.error);
  expect(recovered[2]?.error?.code).toBe("workflow_failed");
});

test("bounded concurrent reservations rotate and become eligible again after a crash", async () => {
  const [a, b, c] = await Promise.all([fixture(), fixture(), fixture()]);
  // Epoch makes these synthetic candidates precede ordinary outstanding checks.
  const batches = await Promise.all([
    reserveReconciliation(db, 1),
    reserveReconciliation(db, 1),
  ]);
  const ids = batches.flat().map((item) => item.checkId);
  expect(new Set(ids).size).toBe(2);
  expect(ids.every((id) => [a.id, b.id, c.id].includes(id))).toBe(true);
  const next = await reserveReconciliation(db, 1);
  expect(next).toHaveLength(1);
  expect(ids).not.toContain(next[0]?.checkId);
  expect([a.id, b.id, c.id]).toContain(next[0]?.checkId);
  await db
    .update(priceChecks)
    .set({ nextReconcileAt: new Date(0) })
    .where(eq(priceChecks.id, a.id));
  const reclaimed = await reserveReconciliation(db, 1);
  expect(reclaimed[0]?.checkId).toBe(a.id);
  await expect(reserveReconciliation(db, 0)).rejects.toThrow("batch size");
  await expect(reserveReconciliation(db, 101)).rejects.toThrow("batch size");
});

test("failed reconciliation SQL rolls back then recovers without another extraction", async () => {
  const { id, result } = await fixture();
  await prepareCheck(db, id, id);
  await record(id, result);
  const trigger = `b09_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.execute(
    sql.raw(
      `create function "${trigger}"() returns trigger language plpgsql as $body$ begin if new.id = '${id}' and new.status = 'succeeded' then raise exception 'B09 injected failure'; end if; return new; end $body$`
    )
  );
  await db.execute(
    sql`create trigger ${sql.identifier(trigger)} before update on price_checks for each row execute function ${sql.identifier(trigger)}()`
  );
  try {
    await expect(reconcileTerminalCheck(db, id, "errored")).rejects.toThrow();
    expect(
      await db
        .select()
        .from(priceObservations)
        .where(eq(priceObservations.checkId, id))
    ).toHaveLength(0);
  } finally {
    await db.execute(
      sql`drop trigger ${sql.identifier(trigger)} on price_checks`
    );
    await db.execute(sql`drop function ${sql.identifier(trigger)}()`);
  }
  const recovered = await reconcileTerminalCheck(db, id, "errored");
  expect(recovered.status).toBe("succeeded");
});

test("reconciled failure releases the next due schedule without overlapping open work", async () => {
  const { id } = await fixture();
  const [check] = await db
    .select()
    .from(priceChecks)
    .where(eq(priceChecks.id, id));
  if (!check) {
    throw new Error("Missing check");
  }
  const userId = crypto.randomUUID();
  testUserIds.add(userId);
  await db.batch([
    db
      .insert(user)
      .values({ id: userId, name: "B09", email: `${userId}@example.test` }),
    db.insert(trackings).values({
      id: crypto.randomUUID(),
      userId,
      productId: check.productId,
      intervalSeconds: 60,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() + 3_600_000),
    }),
    db.insert(productSchedules).values({
      productId: check.productId,
      intervalSeconds: 60,
      nextCheckAt: new Date(check.scheduledAt.getTime() - 1000),
    }),
  ]);
  await prepareCheck(db, id, id);
  const blocked = await reserveDueChecks(db, 100);
  expect(blocked.some((item) => item.productId === check.productId)).toBe(
    false
  );
  await reconcileTerminalCheck(db, id, "errored");
  const unblocked = await reserveDueChecks(db, 100);
  const next = unblocked.find((item) => item.productId === check.productId);
  expect(next).toBeDefined();
  expect(next?.checkId).not.toBe(id);
  await db
    .delete(productSchedules)
    .where(eq(productSchedules.productId, check.productId));
});
