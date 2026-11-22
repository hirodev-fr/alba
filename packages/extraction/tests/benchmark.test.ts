import { expect, test } from "bun:test";

import type { ExtractionResultV1 } from "@alba/contracts";

import {
  benchmarkCorpusSchema,
  evaluateExtraction,
  summarizeBenchmark,
} from "../src/benchmark";
import type { BenchmarkCase } from "../src/benchmark";

const now = "2026-11-22T18:00:00.000Z";
const entry: BenchmarkCase = {
  id: "precision",
  segment: "control",
  tags: ["precision"],
  request: {
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
  },
  reference: {
    checkedAt: now,
    sourceUrl: "https://books.toscrape.com/product",
    evidence: "Independent reference",
    expected: {
      status: "price",
      amount: "9007199254740993.123456789",
      currency: "GBP",
      availability: "in_stock",
    },
  },
};
const success: ExtractionResultV1 = {
  version: 1,
  status: "success",
  price: {
    amount: "9007199254740993.1234567890",
    currency: "GBP",
    availability: "in_stock",
    title: null,
    sourceUrl: entry.request.offer.url,
    observedAt: now,
    provenance: { provider: "zyte", mode: "http" },
  },
};

test("benchmark preserves decimal precision and checks currency and stock", () => {
  expect(evaluateExtraction(entry, success, now).verdict).toBe("correct");
  for (const price of [
    { ...success.price, amount: "9007199254740993.123456788" },
    { ...success.price, currency: "EUR" },
    { ...success.price, availability: "out_of_stock" as const },
  ]) {
    expect(evaluateExtraction(entry, { ...success, price }, now).verdict).toBe(
      "incorrect"
    );
  }
});

test("stale, future and unverified references never inflate accuracy", () => {
  expect(
    evaluateExtraction(entry, success, "2026-11-24T18:00:00.000Z").verdict
  ).toBe("unverified");
  expect(
    evaluateExtraction(entry, success, "2026-11-21T18:00:00.000Z").verdict
  ).toBe("unverified");
  const unknown: BenchmarkCase = {
    ...entry,
    reference: { ...entry.reference, expected: { status: "unverified" } },
  };
  const summary = summarizeBenchmark([
    {
      id: entry.id,
      segment: entry.segment,
      startedAt: now,
      durationMs: 10,
      result: success,
      evaluation: evaluateExtraction(unknown, success, now),
    },
  ]);
  expect(summary.accuracy).toBeNull();
  expect(summary.coverage).toBe(0);
  expect(summary.extracted).toBe(1);
  expect(summarizeBenchmark([]).latencyP95Ms).toBeNull();
});

test("technical failures do not count as correct business rejections", () => {
  const negative: BenchmarkCase = {
    ...entry,
    reference: { ...entry.reference, expected: { status: "no_observation" } },
  };
  const failure: ExtractionResultV1 = {
    version: 1,
    status: "error",
    error: {
      category: "temporary",
      code: "network",
      message: "Network failure",
    },
  };
  expect(evaluateExtraction(negative, failure, now).verdict).toBe("incorrect");
  const business: ExtractionResultV1 = {
    version: 1,
    status: "error",
    error: {
      category: "business",
      code: "missing_price",
      message: "Missing price",
    },
  };
  const evaluation = evaluateExtraction(negative, business, now);
  expect(evaluation.verdict).toBe("correct");
  expect(
    summarizeBenchmark([
      {
        id: negative.id,
        segment: negative.segment,
        startedAt: now,
        durationMs: 5,
        result: business,
        evaluation,
      },
    ]).validObservations
  ).toBe(0);
});

test("corpus validation rejects duplicate cases, browser requests and private destinations", () => {
  const corpus = { version: 1, description: "Test", cases: [entry] };
  expect(benchmarkCorpusSchema.safeParse(corpus).success).toBe(true);
  expect(
    benchmarkCorpusSchema.safeParse({ ...corpus, cases: [entry, entry] })
      .success
  ).toBe(false);
  for (const request of [
    { ...entry.request, mode: "browser" },
    {
      ...entry.request,
      offer: { ...entry.request.offer, url: "https://localhost/product" },
    },
  ]) {
    expect(
      benchmarkCorpusSchema.safeParse({
        ...corpus,
        cases: [{ ...entry, request }],
      }).success
    ).toBe(false);
  }
});
