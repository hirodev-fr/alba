import path from "node:path";

import {
  benchmarkCostReportSchema,
  benchmarkStatsSchema,
  reconcileBenchmarkCost,
} from "../packages/extraction/src/benchmark-cost";

const [directory] = process.argv.slice(2);
const apiKey = process.env.ZYTE_STATS_API_KEY;
const organization =
  process.env.ZYTE_ORGANIZATION_ID ?? process.env.ZYTE_ORGANISATION_ID;
if (!directory || !apiKey || !organization) {
  throw new Error(
    "Usage: extraction:cost <run-directory>; set ZYTE_STATS_API_KEY and ZYTE_ORGANIZATION_ID locally."
  );
}
const original: unknown = await Bun.file(
  path.join(directory, "report.json")
).json();
const report = benchmarkCostReportSchema.parse(original);
const url = new URL("https://zyte-api-stats.zyte.com/api/stats");
url.searchParams.set("organization_id", organization);
url.searchParams.set("tags", `alba_benchmark:${report.runId}`);
url.searchParams.set("page_size", "500");
url.searchParams.set("start_time", report.startedAt);
url.searchParams.set("end_time", report.finishedAt);
const response = await fetch(url, {
  headers: { authorization: `Basic ${btoa(`${apiKey}:`)}` },
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
}).catch(() => {
  throw new Error("Stats connection failed; request details omitted.");
});
if (!response.ok) {
  throw new Error(`Stats HTTP ${response.status}; no provider body logged.`);
}
const stats = benchmarkStatsSchema.parse(await response.json());
await Bun.write(
  path.join(directory, "stats.json"),
  `${JSON.stringify(
    {
      runId: report.runId,
      retrievedAt: new Date().toISOString(),
      startTime: report.startedAt,
      endTime: report.finishedAt,
      ...stats,
    },
    null,
    2
  )}\n`
);
process.stdout.write(
  `Stats: ${stats.results.reduce((sum, row) => sum + row.request_count, 0)} / ${report.summary.attempted} requests available.\n`
);
const cost = reconcileBenchmarkCost(
  stats,
  report.summary.attempted,
  report.summary.validObservations
);
const evidence = {
  ...cost,
  runId: report.runId,
  retrievedAt: new Date().toISOString(),
  source:
    "Zyte Stats /api/stats filtered by unique alba_benchmark tag; HTTP + product extraction combined. Browser and retries: zero.",
};
await Bun.write(
  path.join(directory, "cost.json"),
  `${JSON.stringify(evidence, null, 2)}\n`
);
await Bun.write(
  path.join(directory, "report.json"),
  `${JSON.stringify({ ...report, cost: evidence }, null, 2)}\n`
);
process.stdout.write(`${cost.requests} requests; ${cost.total} USD\n`);
