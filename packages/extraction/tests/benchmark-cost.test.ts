import { expect, test } from "bun:test";

import { reconcileBenchmarkCost } from "../src/benchmark-cost";

test("sums micro-USD exactly including fractional micro-units", () => {
  const result = reconcileBenchmarkCost(
    {
      total_result_count: 2,
      results: [
        { request_count: 2, cost_microusd_total: "6733.10" },
        { request_count: 1, cost_microusd_total: "0.02" },
      ],
    },
    3,
    2
  );
  expect(result.total).toBe("0.00673312");
  expect(result.perValidObservation).toEqual({
    numeratorUsd: "0.00673312",
    denominator: 2,
  });
});

test("missing, incomplete or mismatched statistics never become zero cost", () => {
  for (const stats of [
    { total_result_count: 0, results: [] },
    {
      total_result_count: 2,
      results: [{ request_count: 12, cost_microusd_total: "1" }],
    },
    {
      total_result_count: 1,
      results: [{ request_count: 11, cost_microusd_total: "1" }],
    },
    { total_result_count: 1, results: [{ request_count: 12 }] },
    {
      total_result_count: 1,
      results: [{ request_count: 12, cost_microusd_total: "-1" }],
    },
  ]) {
    expect(() => reconcileBenchmarkCost(stats, 12, 6)).toThrow();
  }
});

test("a measured zero is valid but no valid observation means no cost-per-observation", () => {
  const result = reconcileBenchmarkCost(
    {
      total_result_count: 1,
      results: [{ request_count: 1, cost_microusd_total: 0 }],
    },
    1,
    0
  );
  expect(result.total).toBe("0.000000");
  expect(result.perValidObservation).toBeNull();
});
