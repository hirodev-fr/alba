import { afterEach, expect, test } from "bun:test";

import { priceChecks, productSchedules, trackings, user } from "@alba/db";
import { eq, inArray, sql } from "drizzle-orm";

import { acknowledgeDispatch, reserveDueChecks } from "../../src";
import { createProduct, db, testUserIds } from "./setup";

const scheduledProducts: string[] = [];
afterEach(async () => {
  if (scheduledProducts.length > 0) {
    await db
      .delete(productSchedules)
      .where(inArray(productSchedules.productId, scheduledProducts));
    scheduledProducts.length = 0;
  }
});
const fixture = async (
  status: "active" | "paused" | "cancelled" | "expired" = "active"
) => {
  const product = await createProduct();
  const userId = crypto.randomUUID();
  testUserIds.add(userId);
  const now = Date.now();
  await db.batch([
    db
      .insert(user)
      .values({ id: userId, name: "B08", email: `${userId}@example.test` }),
    db.insert(trackings).values({
      id: crypto.randomUUID(),
      userId,
      productId: product.id,
      status,
      intervalSeconds: 60,
      startsAt: new Date(now - 3_600_000),
      endsAt: new Date(now + 3_600_000),
    }),
    db.insert(productSchedules).values({
      productId: product.id,
      nextCheckAt: new Date(now - 600_000),
      intervalSeconds: 3600,
    }),
  ]);
  scheduledProducts.push(product.id);
  return product.id;
};
const expireLease = (id: string) =>
  db
    .update(productSchedules)
    .set({ leaseExpiresAt: new Date(0) })
    .where(eq(productSchedules.productId, id));
const readSchedule = async (id: string) => {
  const [row] = await db
    .select()
    .from(productSchedules)
    .where(eq(productSchedules.productId, id));
  if (!row) {
    throw new Error("Missing schedule");
  }
  return row;
};
const reserve = async (id: string) => {
  const rows = await reserveDueChecks(db, 100);
  const row = rows.find((item) => item.productId === id);
  if (!row) {
    throw new Error("Missing reservation");
  }
  return row;
};

test("concurrent dispatchers reserve each due product once with durable deterministic workflow IDs", async () => {
  const ids = await Promise.all([fixture(), fixture(), fixture()]);
  const batches = await Promise.all(
    Array.from({ length: 6 }, () => reserveDueChecks(db, 2))
  );
  expect(batches.every((batch) => batch.length <= 2)).toBe(true);
  const ours = batches.flat().filter((row) => ids.includes(row.productId));
  expect(ours).toHaveLength(3);
  expect(new Set(ours.map((row) => row.checkId)).size).toBe(3);
  const checks = await db
    .select()
    .from(priceChecks)
    .where(inArray(priceChecks.productId, ids));
  expect(checks).toHaveLength(3);
  expect(
    checks.every((row) => row.workflowId === row.id && row.status === "pending")
  ).toBe(true);
});

test("crash after SQL reservation reuses the same check, fences old lease and advances only after ack", async () => {
  const id = await fixture();
  const before = await readSchedule(id);
  const first = await reserve(id);
  const leased = await readSchedule(id);
  expect(leased.nextCheckAt).toEqual(before.nextCheckAt);
  const blocked = await reserveDueChecks(db, 100);
  expect(blocked.some((row) => row.productId === id)).toBe(false);
  await expireLease(id);
  expect(await acknowledgeDispatch(db, first)).toBe(false);
  const second = await reserve(id);
  expect(second.checkId).toBe(first.checkId);
  expect(second.recovered).toBe(true);
  expect(second.leaseToken).not.toBe(first.leaseToken);
  expect(await acknowledgeDispatch(db, first)).toBe(false);
  expect(await acknowledgeDispatch(db, second)).toBe(true);
  expect(await acknowledgeDispatch(db, second)).toBe(false);
  const after = await readSchedule(id);
  expect(after.intervalSeconds).toBe(60);
  expect(after.leaseToken).toBeNull();
  expect(after.nextCheckAt.getTime()).toBeGreaterThan(Date.now());
  expect(after.nextCheckAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  expect(
    await db.select().from(priceChecks).where(eq(priceChecks.productId, id))
  ).toHaveLength(1);
});

test("inactive, expired, not-yet-started and future schedules create no checks", async () => {
  const ids = await Promise.all([
    fixture("paused"),
    fixture("cancelled"),
    fixture("expired"),
    fixture(),
    fixture(),
    fixture(),
  ]);
  const [ended, futureTracking, futureSchedule] = ids.slice(3);
  if (!ended || !futureTracking || !futureSchedule) {
    throw new Error("Missing fixture");
  }
  await db
    .update(trackings)
    .set({ endsAt: new Date(Date.now() - 1000) })
    .where(eq(trackings.productId, ended));
  await db
    .update(trackings)
    .set({ startsAt: new Date(Date.now() + 60_000) })
    .where(eq(trackings.productId, futureTracking));
  await db
    .update(productSchedules)
    .set({ nextCheckAt: new Date(Date.now() + 60_000) })
    .where(eq(productSchedules.productId, futureSchedule));
  const rows = await reserveDueChecks(db, 100);
  expect(rows.filter((row) => ids.includes(row.productId))).toHaveLength(0);
  expect(
    await db
      .select()
      .from(priceChecks)
      .where(inArray(priceChecks.productId, ids))
  ).toHaveLength(0);
});

test("existing obligations survive tracking expiry and pending checks prevent overlap", async () => {
  const id = await fixture();
  const first = await reserve(id);
  await db
    .update(trackings)
    .set({ status: "paused" })
    .where(eq(trackings.productId, id));
  await expireLease(id);
  const recovered = await reserve(id);
  expect(recovered.checkId).toBe(first.checkId);
  expect(await acknowledgeDispatch(db, recovered)).toBe(true);
  await db
    .update(trackings)
    .set({ status: "active" })
    .where(eq(trackings.productId, id));
  await db
    .update(productSchedules)
    .set({ nextCheckAt: new Date(Date.now() - 1000) })
    .where(eq(productSchedules.productId, id));
  const blocked = await reserveDueChecks(db, 100);
  expect(blocked.some((row) => row.productId === id)).toBe(false);
  await db
    .update(priceChecks)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(priceChecks.id, first.checkId));
  const next = await reserve(id);
  expect(next.checkId).not.toBe(first.checkId);
});

test("a failed check insertion rolls back its schedule lease", async () => {
  const id = await fixture();
  const name = `b08_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.execute(
    sql.raw(
      `create function "${name}"() returns trigger language plpgsql as $body$ begin if new.product_id = '${id}' then raise exception 'B08 insertion failure'; end if; return new; end $body$`
    )
  );
  await db.execute(
    sql`create trigger ${sql.identifier(name)} before insert on price_checks for each row execute function ${sql.identifier(name)}()`
  );
  try {
    await expect(reserveDueChecks(db, 100)).rejects.toThrow();
    const unchanged = await readSchedule(id);
    expect(unchanged.leaseToken).toBeNull();
    expect(
      await db.select().from(priceChecks).where(eq(priceChecks.productId, id))
    ).toHaveLength(0);
  } finally {
    await db.execute(sql`drop trigger ${sql.identifier(name)} on price_checks`);
    await db.execute(sql`drop function ${sql.identifier(name)}()`);
  }
  const recovered = await reserve(id);
  expect(recovered.productId).toBe(id);
});

test("shared schedules use the fastest active interval and wake for a future tracking", async () => {
  const id = await fixture();
  const [tracking] = await db
    .select()
    .from(trackings)
    .where(eq(trackings.productId, id));
  if (!tracking) {
    throw new Error("Missing tracking");
  }
  const startsAt = new Date(Date.now() + 30_000);
  await db.insert(trackings).values([
    { ...tracking, id: crypto.randomUUID(), intervalSeconds: 300 },
    { ...tracking, id: crypto.randomUUID(), startsAt, intervalSeconds: 120 },
  ]);
  const item = await reserve(id);
  expect(await acknowledgeDispatch(db, item)).toBe(true);
  const schedule = await readSchedule(id);
  expect(schedule.intervalSeconds).toBe(60);
  expect(schedule.nextCheckAt).toEqual(startsAt);
  const checks = await db
    .select()
    .from(priceChecks)
    .where(eq(priceChecks.productId, id));
  expect(checks).toHaveLength(1);
});
