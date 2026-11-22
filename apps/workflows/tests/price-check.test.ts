import { expect, test } from "bun:test";

import type { ExtractionResultV1, ExtractionRequestV1 } from "@alba/contracts";

import {
  runPriceCheck,
  sqlStepConfig,
  extractionStepConfig,
} from "../src/price-check";
import type { DurableSteps, CheckOperations } from "../src/price-check";

const request: ExtractionRequestV1 = {
  version: 1,
  mode: "http",
  offer: {
    url: "https://books.toscrape.com/product",
    context: {
      variant: {},
      country: null,
      seller: null,
      expectedCurrency: "GBP",
    },
  },
};
const success: ExtractionResultV1 = {
  version: 1,
  status: "success",
  price: {
    amount: "51.77",
    currency: "GBP",
    availability: "in_stock",
    title: null,
    observedAt: "2026-11-22T12:00:00.000Z",
    sourceUrl: request.offer.url,
    provenance: { provider: "zyte", mode: "http" },
  },
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

// Models persisted successful steps across a fresh execution; not a cloud runtime test.
const harness = (results: ExtractionResultV1[]) => {
  const journal = new Map<string, string>();
  const calls: string[] = [];
  const sleeps: string[] = [];
  const configs = new Map<string, unknown>();
  let finalized: ExtractionResultV1 | undefined;
  let extractCalls = 0;
  const step: DurableSteps = {
    do: async <T>(
      name: string,
      config: unknown,
      execute: () => Promise<T>
    ): Promise<T> => {
      configs.set(name, config);
      const stored = journal.get(name);
      if (stored !== undefined) {
        return JSON.parse(stored) as T;
      }
      calls.push(name);
      const result = await execute();
      journal.set(name, JSON.stringify(result ?? null));
      return result;
    },
    sleep: (_name, duration) => {
      sleeps.push(duration);
      return Promise.resolve();
    },
  };
  const operations: CheckOperations = {
    prepare: () => Promise.resolve({ status: "ready", request }),
    extract: () => {
      const result = results[extractCalls] ?? temporary;
      extractCalls += 1;
      return Promise.resolve(result);
    },
    record: () => Promise.resolve(),
    finalize: (_checkId, result) => {
      finalized = result;
      return Promise.resolve({
        status: result.status === "success" ? "succeeded" : "failed",
      });
    },
  };
  const run = () =>
    runPriceCheck(
      { version: 1, checkId: "check-1" },
      "check-1",
      step,
      operations
    );
  return {
    run,
    operations,
    calls,
    sleeps,
    configs,
    getExtractCalls: () => extractCalls,
    getFinalized: () => finalized,
  };
};

test.each(["record", "finalize"] as const)(
  "SQL failure in %s replays durable extraction without another provider call",
  async (phase) => {
    const h = harness([success]);
    const original = h.operations[phase];
    h.operations[phase] = (): Promise<never> =>
      Promise.reject(new Error("SQL unavailable"));
    await expect(h.run()).rejects.toThrow("SQL unavailable");
    if (phase === "record") {
      h.operations.record = original as CheckOperations["record"];
    } else {
      h.operations.finalize = original as CheckOperations["finalize"];
    }
    expect(await h.run()).toEqual({ checkId: "check-1", status: "succeeded" });
    expect(h.getExtractCalls()).toBe(1);
    expect(h.configs.get("finalize")).toEqual(sqlStepConfig);
    expect(h.configs.get("extract-http-1")).toEqual(extractionStepConfig);
    expect(h.getFinalized()).toEqual(success);
  }
);

test("temporary errors retry at 10 and 20 seconds and stop after three calls", async () => {
  const h = harness([temporary, temporary, temporary]);
  const outcome = await h.run();
  expect(outcome.status).toBe("failed");
  expect(h.getExtractCalls()).toBe(3);
  expect(h.sleeps).toEqual(["10 seconds", "20 seconds"]);
  expect(h.getFinalized()).toEqual(temporary);
  expect(
    h.calls.filter((name) => name.startsWith("record-attempt"))
  ).toHaveLength(3);
});

test("temporary failure can recover to a valid observation", async () => {
  const h = harness([temporary, success]);
  const outcome = await h.run();
  expect(outcome.status).toBe("succeeded");
  expect(h.getExtractCalls()).toBe(2);
  expect(h.sleeps).toEqual(["10 seconds"]);
});

test.each([
  {
    category: "permanent",
    code: "authentication",
    message: "Invalid credentials",
  },
  {
    category: "permanent",
    code: "budget_exceeded",
    message: "Spending disabled",
  },
  { category: "business", code: "missing_price", message: "No price" },
  { category: "business", code: "ambiguous_price", message: "Ambiguous price" },
] as const)("finalizes %j without retries or success", async (failure) => {
  const result: ExtractionResultV1 = {
    version: 1,
    status: "error",
    error: failure,
  };
  const h = harness([result]);
  const outcome = await h.run();
  expect(outcome.status).toBe("failed");
  expect(h.getExtractCalls()).toBe(1);
  expect(h.sleeps).toEqual([]);
  expect(h.getFinalized()).toEqual(result);
});

test("terminal checks never spend", async () => {
  const h = harness([success]);
  h.operations.prepare = () =>
    Promise.resolve({ status: "terminal", checkStatus: "cancelled" });
  const outcome = await h.run();
  expect(outcome.status).toBe("cancelled");
  expect(h.getExtractCalls()).toBe(0);
  expect(h.getFinalized()).toBeUndefined();
});
