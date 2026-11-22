import {
  availabilitySchema,
  currencySchema,
  decimalAmountSchema,
  extractionRequestV1Schema,
  idSchema,
  productUrlSchema,
  timestampSchema,
} from "@alba/contracts";
import type { ExtractionResultV1 } from "@alba/contracts";
import { z } from "zod";

import { isAllowedProductUrl } from "./url-policy";

const referenceSchema = z.strictObject({
  checkedAt: timestampSchema,
  sourceUrl: productUrlSchema,
  evidence: z.string().min(1),
  expected: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("price"),
      amount: decimalAmountSchema,
      currency: currencySchema,
      availability: availabilitySchema.nullable(),
    }),
    z.strictObject({ status: z.literal("no_observation") }),
    z.strictObject({ status: z.literal("unverified") }),
  ]),
});

export const benchmarkCorpusSchema = z
  .strictObject({
    version: z.literal(1),
    description: z.string().min(1),
    cases: z
      .array(
        z.strictObject({
          id: idSchema,
          segment: z.string().min(1),
          tags: z.array(z.string().min(1)).min(1),
          request: extractionRequestV1Schema.refine(
            (request) =>
              request.mode === "http" && isAllowedProductUrl(request.offer.url),
            "Benchmark requires a public HTTP extraction target"
          ),
          reference: referenceSchema,
        })
      )
      .min(1)
      .max(30),
  })
  .refine(
    (corpus) =>
      new Set(corpus.cases.map((entry) => entry.id)).size ===
      corpus.cases.length,
    "Case IDs must be unique"
  );

export type BenchmarkCase = z.infer<
  typeof benchmarkCorpusSchema
>["cases"][number];
export type Verdict = "correct" | "incorrect" | "unverified";

// Compare decimal values without losing precision or penalizing trailing zeroes.
const canonicalDecimal = (value: string) => {
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.replace(/0+$/u, "")}`;
};

export const evaluateExtraction = (
  entry: BenchmarkCase,
  result: ExtractionResultV1,
  startedAt: string
) => {
  const { reference } = entry;
  const age = Date.parse(startedAt) - Date.parse(reference.checkedAt);
  if (
    age < 0 ||
    age > 86_400_000 ||
    reference.expected.status === "unverified"
  ) {
    return {
      verdict: "unverified" as const,
      amount: null,
      currency: null,
      availability: null,
    };
  }
  if (reference.expected.status === "no_observation") {
    // A transport failure does not demonstrate a correct business rejection.
    const correct =
      result.status === "error" && result.error.category === "business";
    return {
      verdict: correct ? ("correct" as const) : ("incorrect" as const),
      amount: null,
      currency: null,
      availability: null,
    };
  }
  const amount =
    result.status === "success" &&
    canonicalDecimal(result.price.amount) ===
      canonicalDecimal(reference.expected.amount);
  const currency =
    result.status === "success" &&
    result.price.currency === reference.expected.currency;
  const availability =
    reference.expected.availability === null
      ? null
      : result.status === "success" &&
        result.price.availability === reference.expected.availability;
  return {
    verdict:
      amount && currency && availability !== false
        ? ("correct" as const)
        : ("incorrect" as const),
    amount,
    currency,
    availability,
  };
};

export interface BenchmarkRow {
  id: string;
  segment: string;
  startedAt: string;
  durationMs: number;
  result: ExtractionResultV1;
  evaluation: ReturnType<typeof evaluateExtraction>;
}

export const summarizeBenchmark = (rows: readonly BenchmarkRow[]) => {
  const verified = rows.filter(
    (row) => row.evaluation.verdict !== "unverified"
  );
  const correct = verified.filter(
    (row) => row.evaluation.verdict === "correct"
  );
  const validObservations = correct.filter(
    (row) => row.result.status === "success"
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- Sort a fresh array; the shared TS target is ES2022.
  const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  return {
    attempted: rows.length,
    extracted: rows.filter((row) => row.result.status === "success").length,
    verified: verified.length,
    correct: correct.length,
    validObservations: validObservations.length,
    accuracy: verified.length === 0 ? null : correct.length / verified.length,
    coverage: rows.length === 0 ? null : validObservations.length / rows.length,
    latencyP50Ms:
      durations[Math.max(0, Math.ceil(durations.length * 0.5) - 1)] ?? null,
    latencyP95Ms:
      durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? null,
  };
};
