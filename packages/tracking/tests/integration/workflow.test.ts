import { expect, test } from "bun:test";

import type { ExtractionResultV1 } from "@alba/contracts";
import {
  extractionAttempts,
  priceChecks,
  priceObservations,
  products,
} from "@alba/db";
import { eq, sql } from "drizzle-orm";

import { runPriceCheck } from "../../../../apps/workflows/src/price-check";
import type { DurableSteps } from "../../../../apps/workflows/src/price-check";
import { finalizeCheck, prepareCheck, recordAttempt } from "../../src";
import { createProduct, db } from "./setup";

const createCheck = async () => {
  const product = await createProduct();
  const checkId = crypto.randomUUID();
  await db
    .insert(priceChecks)
    .values({ id: checkId, productId: product.id, scheduledAt: new Date() });
  return { product, checkId };
};

test("prepare freezes context, is concurrent-safe and rejects a different instance", async () => {
  const { product, checkId } = await createCheck();
  const prepared = await Promise.all([
    prepareCheck(db, checkId, checkId),
    prepareCheck(db, checkId, checkId),
  ]);
  expect(prepared[0]).toEqual(prepared[1]);
  expect(prepared[0]).toEqual({
    status: "ready",
    request: {
      version: 1,
      mode: "http",
      offer: { url: product.url, context: product.context },
    },
  });
  await db
    .update(products)
    .set({ url: "https://changed.example/product" })
    .where(eq(products.id, product.id));
  expect(await prepareCheck(db, checkId, checkId)).toEqual(prepared[0]);
  await expect(prepareCheck(db, checkId, "other-instance")).rejects.toThrow(
    "Workflow ID"
  );
  await expect(prepareCheck(db, "missing", "missing")).rejects.toThrow(
    "not found"
  );
});

test("durable replay after a real Neon finalization failure does not call extraction again", async () => {
  const { product, checkId } = await createCheck();
  const journal = new Map<string, string>();
  const step: DurableSteps = {
    do: async <T>(
      _name: string,
      _config: unknown,
      execute: () => Promise<T>
    ): Promise<T> => {
      const cached = journal.get(_name);
      if (cached !== undefined) {
        return JSON.parse(cached) as T;
      }
      const value = await execute();
      journal.set(_name, JSON.stringify(value ?? null));
      return value;
    },
    sleep: () => Promise.resolve(),
  };
  let providerCalls = 0;
  const result: ExtractionResultV1 = {
    version: 1,
    status: "success",
    price: {
      amount: "51.77",
      currency: "EUR",
      availability: "in_stock",
      title: null,
      observedAt: new Date().toISOString(),
      sourceUrl: product.url,
      provenance: { provider: "zyte", mode: "http" },
    },
  };
  const run = () =>
    runPriceCheck({ version: 1, checkId }, checkId, step, {
      prepare: (id, workflowId) => prepareCheck(db, id, workflowId),
      extract: () => {
        providerCalls += 1;
        return Promise.resolve(result);
      },
      record: (input) => recordAttempt(db, input),
      finalize: (id, value) =>
        finalizeCheck(db, { checkId: id, result: value }),
    });
  const trigger = `b07_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.execute(
    sql.raw(
      `create function "${trigger}"() returns trigger language plpgsql as $body$ begin if new.id = '${checkId}' and new.status = 'succeeded' then raise exception 'B07 injected finalization failure'; end if; return new; end $body$`
    )
  );
  await db.execute(
    sql`create trigger ${sql.identifier(trigger)} before update on price_checks for each row execute function ${sql.identifier(trigger)}()`
  );
  try {
    await expect(run()).rejects.toThrow();
    expect(journal.has("extract-http-1")).toBe(true);
    expect(journal.has("finalize")).toBe(false);
    expect(
      await db
        .select()
        .from(priceObservations)
        .where(eq(priceObservations.checkId, checkId))
    ).toHaveLength(0);
  } finally {
    await db.execute(
      sql`drop trigger ${sql.identifier(trigger)} on price_checks`
    );
    await db.execute(sql`drop function ${sql.identifier(trigger)}()`);
  }
  const completed = await run();
  expect(completed.status).toBe("succeeded");
  expect(providerCalls).toBe(1);
  const repeated = await finalizeCheck(db, { checkId, result });
  expect(repeated.status).toBe("succeeded");
  expect(
    await db
      .select()
      .from(priceObservations)
      .where(eq(priceObservations.checkId, checkId))
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(extractionAttempts)
      .where(eq(extractionAttempts.checkId, checkId))
  ).toHaveLength(1);
  expect(await prepareCheck(db, checkId, checkId)).toEqual({
    status: "terminal",
    checkStatus: "succeeded",
  });
});
