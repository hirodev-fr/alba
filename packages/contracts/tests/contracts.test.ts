import { expect, test } from "bun:test";

import type { PriceCheckV1 } from "../src";
import {
  availabilitySchema,
  createTrackingInputV1Schema,
  decimalAmountSchema,
  extractionRequestV1Schema,
  extractionResultV1Schema,
  getPriceCheckInputV1Schema,
  getPriceHistoryInputV1Schema,
  getProductInputV1Schema,
  getTrackingInputV1Schema,
  priceCheckParamsV1Schema,
  priceCheckV1Schema,
  priceHistoryV1Schema,
  priceObservationV1Schema,
  productUrlSchema,
  productV1Schema,
  trackingV1Schema,
  updateTrackingInputV1Schema,
} from "../src";
import { invalidFixtures } from "./fixtures/invalid";
import {
  extractionErrorFixtures,
  offer,
  price,
  validFixtures,
} from "./fixtures/valid";

const schemas = {
  createTracking: createTrackingInputV1Schema,
  updateTracking: updateTrackingInputV1Schema,
  getTracking: getTrackingInputV1Schema,
  tracking: trackingV1Schema,
  getProduct: getProductInputV1Schema,
  product: productV1Schema,
  observation: priceObservationV1Schema,
  priceCheckParams: priceCheckParamsV1Schema,
  getPriceCheck: getPriceCheckInputV1Schema,
  priceCheck: priceCheckV1Schema,
  getPriceHistory: getPriceHistoryInputV1Schema,
  priceHistory: priceHistoryV1Schema,
  extractionRequest: extractionRequestV1Schema,
  extractionResult: extractionResultV1Schema,
};

for (const name of Object.keys(
  validFixtures
) as (keyof typeof validFixtures)[]) {
  test(`${name}: accepts a JSON round-trip without loss`, () => {
    const serialized = JSON.stringify(validFixtures[name]);
    const payload: unknown = JSON.parse(serialized);
    expect(schemas[name].parse(payload)).toEqual(validFixtures[name]);
  });
}

test.each(invalidFixtures)("rejects $name", ({ contract, value, path }) => {
  const result = schemas[contract].safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(path);
  }
});

test.each(extractionErrorFixtures)(
  "accepts $error.category / $error.code",
  (fixture) => {
    expect(extractionResultV1Schema.parse(fixture)).toEqual(fixture);
  }
);

test.each([
  0,
  -1,
  Number.NaN,
  Infinity,
  "-1",
  "+1",
  "01",
  "1,99",
  "1e3",
  "1\n",
  " 1.99",
  "1.",
  ".99",
  "",
])("rejects a non-decimal amount %p", (amount) => {
  expect(decimalAmountSchema.safeParse(amount).success).toBe(false);
});

test.each(["0", "0.00", "19.9900", price.amount])(
  "preserves decimal amount %s exactly",
  (amount) => {
    expect(decimalAmountSchema.parse(amount)).toBe(amount);
  }
);

test.each([
  "file:///etc/passwd",
  "ftp://shop.example/product",
  "https://user:password@shop.example/product",
  "https://127.0.0.1/product",
  "https://[::1]/product",
  "http://2130706433/product",
  "http://localhost/product",
  "http://app.localhost/product",
  "http://shop.local/product",
  "http://shop.internal/product",
  "/products/1",
  "",
  "https://shop.example/\u0000",
  "https://shop.example/\nproduct",
  "https://shop.example/\tproduct",
  " https://shop.example/product",
])("rejects unsafe or invalid URL %s", (url) => {
  expect(productUrlSchema.safeParse(url).success).toBe(false);
});

test("preserves offer identity across variants, sellers, countries and query parameters", () => {
  const variants = [
    offer,
    { ...offer, url: `${offer.url}&size=2L` },
    {
      ...offer,
      context: {
        ...offer.context,
        variant: { ...offer.context.variant, color: "red" },
      },
    },
    { ...offer, context: { ...offer.context, seller: "other" } },
    { ...offer, context: { ...offer.context, country: "BE" } },
    { ...offer, context: { ...offer.context, expectedCurrency: "USD" } },
    {
      ...offer,
      context: {
        variant: {},
        country: null,
        expectedCurrency: null,
        seller: null,
      },
    },
  ];
  for (const variant of variants) {
    expect(
      extractionRequestV1Schema.parse({
        version: 1,
        offer: variant,
        mode: "http",
      }).offer
    ).toEqual(variant);
  }
  expect(new Set(variants.map((variant) => JSON.stringify(variant))).size).toBe(
    variants.length
  );
});

test("browser extraction must be explicitly requested", () => {
  expect(
    extractionRequestV1Schema.parse({
      ...validFixtures.extractionRequest,
      mode: "browser",
    }).mode
  ).toBe("browser");
  expect(
    extractionResultV1Schema.parse({
      ...validFixtures.extractionResult,
      price: { ...price, provenance: { provider: "zyte", mode: "browser" } },
    }).status
  ).toBe("success");
});

test.each(["in_stock", "out_of_stock", "unknown"])(
  "accepts availability %s with an observed price",
  (availability) => {
    const parsedAvailability = availabilitySchema.parse(availability);
    expect(
      extractionResultV1Schema.parse({
        ...validFixtures.extractionResult,
        price: { ...price, availability: parsedAvailability },
      }).status
    ).toBe("success");
  }
);

test("accepts each check lifecycle state and rejects a running check without a workflow", () => {
  const base = {
    version: 1 as const,
    id: "check-1",
    productId: "product-1",
    scheduledAt: price.observedAt,
    workflowId: null,
  };
  const states = [
    { ...base, status: "pending" },
    {
      ...base,
      status: "running",
      workflowId: "workflow-1",
      startedAt: price.observedAt,
    },
    validFixtures.priceCheck,
    {
      ...base,
      status: "failed",
      finishedAt: price.observedAt,
      error: extractionErrorFixtures[0].error,
    },
    { ...base, status: "cancelled", finishedAt: price.observedAt },
  ] satisfies PriceCheckV1[];
  for (const state of states) {
    expect(priceCheckV1Schema.parse(state)).toEqual(state);
  }
  expect(
    priceCheckV1Schema.safeParse({
      ...base,
      status: "running",
      startedAt: price.observedAt,
    }).success
  ).toBe(false);
});
