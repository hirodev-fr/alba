/* oxlint-disable eslint/no-await-in-loop -- Paid calls are deliberately sequential, with durable evidence before the next call. */
import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";

import { createZyteExtractor } from "../packages/extraction/src";
import {
  benchmarkCorpusSchema,
  evaluateExtraction,
  summarizeBenchmark,
} from "../packages/extraction/src/benchmark";
import type { BenchmarkRow } from "../packages/extraction/src/benchmark";

const [mode, corpusPath, outputDirectory] = process.argv.slice(2);
if (
  (mode !== "--validate" && mode !== "--live") ||
  !corpusPath ||
  (mode === "--live" && !outputDirectory)
) {
  throw new Error(
    "Usage: extraction:benchmark --validate <corpus.json> | --live <corpus.json> <new-output-directory>"
  );
}
const corpusText = await Bun.file(corpusPath).text();
const corpus = benchmarkCorpusSchema.parse(JSON.parse(corpusText));
const corpusSnapshot = `${JSON.stringify(corpus, null, 2)}\n`;
if (mode === "--validate") {
  process.stdout.write(
    `Validated ${corpus.cases.length} cases; no provider calls.\n`
  );
} else {
  const apiKey = process.env.ZYTE_API_KEY;
  if (!apiKey || !outputDirectory) {
    throw new Error("Set ZYTE_API_KEY in the ignored local .env file.");
  }
  // A new directory prevents accidental replacement of evidence from a paid run.
  await mkdir(outputDirectory);
  const journal = await open(path.join(outputDirectory, "results.jsonl"), "wx");
  const startedAt = new Date().toISOString();
  const runId = `b06-${crypto.randomUUID()}`;
  const rows: BenchmarkRow[] = [];
  const extract = createZyteExtractor({
    apiKey,
    tags: { alba_benchmark: runId },
    allowedHosts: corpus.cases.map(
      (entry) => new URL(entry.request.offer.url).hostname
    ),
  });
  await Bun.write(path.join(outputDirectory, "corpus.json"), corpusSnapshot);
  await Bun.write(
    path.join(outputDirectory, "run.json"),
    `${JSON.stringify({ runId, startedAt, planned: corpus.cases.length, mode: "http", retries: 0 }, null, 2)}\n`
  );
  try {
    for (const entry of corpus.cases) {
      const caseStartedAt = new Date().toISOString();
      const start = performance.now();
      const result = await extract(entry.request);
      const row: BenchmarkRow = {
        id: entry.id,
        segment: entry.segment,
        startedAt: caseStartedAt,
        durationMs: Math.round(performance.now() - start),
        result,
        evaluation: evaluateExtraction(entry, result, caseStartedAt),
      };
      rows.push(row);
      await journal.write(`${JSON.stringify(row)}\n`);
      await journal.sync();
      process.stdout.write(
        `${entry.id}: ${result.status}, ${row.evaluation.verdict}\n`
      );
      if (
        result.status === "error" &&
        (result.error.code === "authentication" ||
          result.error.code === "budget_exceeded")
      ) {
        break;
      }
    }
  } finally {
    await journal.close();
    await Bun.write(
      path.join(outputDirectory, "report.json"),
      `${JSON.stringify(
        {
          version: 1,
          runId,
          startedAt,
          finishedAt: new Date().toISOString(),
          corpusSha256: createHash("sha256")
            .update(JSON.stringify(corpus))
            .digest("hex"),
          mode: "http",
          retries: 0,
          browserRequests: 0,
          planned: corpus.cases.length,
          complete: rows.length === corpus.cases.length,
          summary: summarizeBenchmark(rows),
          segments: Object.fromEntries(
            [...new Set(rows.map((row) => row.segment))].map((segment) => [
              segment,
              summarizeBenchmark(rows.filter((row) => row.segment === segment)),
            ])
          ),
          cost: {
            status: "unmeasured",
            currency: "USD",
            total: null,
            source:
              "Requires isolated Zyte Stats usage or billing export; never infer zero from missing cost.",
          },
        },
        null,
        2
      )}\n`
    );
  }
}
