import type {
  CreateTrackingInputV1,
  ExtractionRequestV1,
  ExtractionResultV1,
  GetPriceCheckInputV1,
  GetPriceHistoryInputV1,
  GetProductInputV1,
  GetTrackingInputV1,
  PriceCheckParamsV1,
  PriceCheckV1,
  PriceHistoryV1,
  PriceObservationV1,
  ProductV1,
  TrackingV1,
  UpdateTrackingInputV1,
} from "../../src";

export const offer = {
  url: "https://shop.example/products/coffee?variant=blue&seller=direct",
  context: {
    variant: { color: "blue", size: "1L" },
    country: "FR",
    expectedCurrency: "EUR",
    seller: "direct",
  },
};

export const price = {
  amount: "9007199254740993.123456789",
  currency: "EUR",
  availability: "in_stock" as const,
  title: "Coffee pot — blue, 1L",
  observedAt: "2026-11-22T12:00:00.000Z",
  sourceUrl: offer.url,
  provenance: { provider: "zyte" as const, mode: "http" as const },
};

const period = {
  intervalSeconds: 3600,
  startsAt: "2026-11-22T12:00:00.000Z",
  endsAt: "2026-12-22T12:00:00.000Z",
};

const observation = {
  version: 1,
  id: "observation-1",
  productId: "product-1",
  checkId: "check-1",
  price,
} satisfies PriceObservationV1;

export const validFixtures = {
  createTracking: { version: 1, offer, ...period },
  updateTracking: {
    version: 1,
    trackingId: "tracking-1",
    ...period,
    status: "paused",
  },
  getTracking: { version: 1, trackingId: "tracking-1" },
  tracking: {
    version: 1,
    id: "tracking-1",
    productId: "product-1",
    ...period,
    status: "active",
    createdAt: period.startsAt,
  },
  getProduct: { version: 1, productId: "product-1" },
  product: {
    version: 1,
    id: "product-1",
    offer,
    title: price.title,
    createdAt: period.startsAt,
    currentObservation: observation,
  },
  observation,
  priceCheckParams: { version: 1, checkId: "check-1" },
  getPriceCheck: { version: 1, checkId: "check-1" },
  priceCheck: {
    version: 1,
    id: "check-1",
    productId: "product-1",
    scheduledAt: period.startsAt,
    workflowId: "price-check-1",
    status: "succeeded",
    finishedAt: price.observedAt,
    observationId: observation.id,
  },
  getPriceHistory: {
    version: 1,
    trackingId: "tracking-1",
    limit: 20,
    cursor: null,
  },
  priceHistory: { version: 1, observations: [observation], nextCursor: null },
  extractionRequest: { version: 1, offer, mode: "http" },
  extractionResult: { version: 1, status: "success", price },
} satisfies {
  createTracking: CreateTrackingInputV1;
  updateTracking: UpdateTrackingInputV1;
  getTracking: GetTrackingInputV1;
  tracking: TrackingV1;
  getProduct: GetProductInputV1;
  product: ProductV1;
  observation: PriceObservationV1;
  priceCheckParams: PriceCheckParamsV1;
  getPriceCheck: GetPriceCheckInputV1;
  priceCheck: PriceCheckV1;
  getPriceHistory: GetPriceHistoryInputV1;
  priceHistory: PriceHistoryV1;
  extractionRequest: ExtractionRequestV1;
  extractionResult: ExtractionResultV1;
};

export const extractionErrorFixtures = [
  {
    version: 1,
    status: "error",
    error: {
      category: "temporary",
      code: "timeout",
      message: "Provider timed out",
    },
  },
  {
    version: 1,
    status: "error",
    error: {
      category: "permanent",
      code: "authentication",
      message: "Provider authentication failed",
    },
  },
  {
    version: 1,
    status: "error",
    error: {
      category: "permanent",
      code: "budget_exceeded",
      message: "Extraction budget exhausted",
    },
  },
  {
    version: 1,
    status: "error",
    error: {
      category: "business",
      code: "missing_price",
      message: "No product price found",
    },
  },
  {
    version: 1,
    status: "error",
    error: {
      category: "business",
      code: "ambiguous_price",
      message: "Several prices require a decision",
    },
  },
] satisfies ExtractionResultV1[];
