import { z } from "zod";

export const benchmarkCostReportSchema = z.looseObject({
  runId: z.string().regex(/^b06-[a-f0-9-]{36}$/u),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  summary: z.looseObject({
    attempted: z.int().min(1).max(30),
    validObservations: z.int().min(0).max(30),
  }),
});

const microAmountSchema = z
  .union([
    z.number().nonnegative().finite(),
    z.string().regex(/^\d+(?:\.\d+)?$/u),
  ])
  .transform(String);

export const benchmarkStatsSchema = z.object({
  total_result_count: z.int().nonnegative(),
  results: z.array(
    z.object({
      request_count: z.int().nonnegative(),
      cost_microusd_total: microAmountSchema,
    })
  ),
});

export const reconcileBenchmarkCost = (
  input: unknown,
  expectedRequests: number,
  validObservations: number
) => {
  const stats = benchmarkStatsSchema.parse(input);
  const requests = stats.results.reduce(
    (sum, row) => sum + row.request_count,
    0
  );
  if (
    stats.total_result_count !== stats.results.length ||
    requests !== expectedRequests ||
    requests === 0
  ) {
    throw new Error(
      "Stats are incomplete or request counts differ; do not attribute a cost yet."
    );
  }
  // Stats uses micro-USD; retain all decimal digits while summing.
  const scale = Math.max(
    ...stats.results.map(
      (row) => row.cost_microusd_total.split(".")[1]?.length ?? 0
    )
  );
  let total = 0n;
  for (const row of stats.results) {
    const [whole = "0", fraction = ""] = row.cost_microusd_total.split(".");
    total += BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  }
  const usdScale = scale + 6;
  const digits = total.toString().padStart(usdScale + 1, "0");
  const totalUsd = `${digits.slice(0, -usdScale)}.${digits.slice(-usdScale)}`;
  return {
    status: "measured" as const,
    currency: "USD",
    requests,
    total: totalUsd,
    // Ratios remain exact, rather than rounding monetary values through Number.
    perRequest: { numeratorUsd: totalUsd, denominator: requests },
    perValidObservation:
      validObservations === 0
        ? null
        : { numeratorUsd: totalUsd, denominator: validObservations },
  };
};
