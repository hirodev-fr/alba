import { offer, price, validFixtures } from "./valid";

export const invalidFixtures: {
  name: string;
  contract: keyof typeof validFixtures;
  value: unknown;
  path: (string | number)[];
}[] = [
  {
    name: "unsupported workflow version",
    contract: "priceCheckParams",
    value: { version: 2, checkId: "check-1" },
    path: ["version"],
  },
  {
    name: "unversioned workflow",
    contract: "priceCheckParams",
    value: { checkId: "check-1" },
    path: ["version"],
  },
  {
    name: "empty check identifier",
    contract: "getPriceCheck",
    value: { version: 1, checkId: "" },
    path: ["checkId"],
  },
  {
    name: "caller-supplied workflow context",
    contract: "priceCheckParams",
    value: { ...validFixtures.priceCheckParams, offer },
    path: [],
  },
  {
    name: "owner injection",
    contract: "createTracking",
    value: { ...validFixtures.createTracking, userId: "another-user" },
    path: [],
  },
  {
    name: "zero frequency",
    contract: "createTracking",
    value: { ...validFixtures.createTracking, intervalSeconds: 0 },
    path: ["intervalSeconds"],
  },
  {
    name: "fractional frequency",
    contract: "createTracking",
    value: { ...validFixtures.createTracking, intervalSeconds: 60.5 },
    path: ["intervalSeconds"],
  },
  {
    name: "reversed period",
    contract: "createTracking",
    value: {
      ...validFixtures.createTracking,
      endsAt: "2026-11-21T12:00:00.000Z",
    },
    path: ["endsAt"],
  },
  {
    name: "empty period",
    contract: "updateTracking",
    value: {
      ...validFixtures.updateTracking,
      endsAt: validFixtures.updateTracking.startsAt,
    },
    path: ["endsAt"],
  },
  {
    name: "server-managed expiry",
    contract: "updateTracking",
    value: { ...validFixtures.updateTracking, status: "expired" },
    path: ["status"],
  },
  {
    name: "timezone-less period",
    contract: "tracking",
    value: { ...validFixtures.tracking, startsAt: "2026-11-22T12:00:00.000" },
    path: ["startsAt"],
  },
  {
    name: "missing tracking identifier",
    contract: "getTracking",
    value: { version: 1 },
    path: ["trackingId"],
  },
  {
    name: "missing product identifier",
    contract: "getProduct",
    value: { version: 1 },
    path: ["productId"],
  },
  {
    name: "missing offer context",
    contract: "product",
    value: { ...validFixtures.product, offer: { url: offer.url } },
    path: ["offer", "context"],
  },
  {
    name: "oversized page",
    contract: "getPriceHistory",
    value: { ...validFixtures.getPriceHistory, limit: 101 },
    path: ["limit"],
  },
  {
    name: "invalid cursor",
    contract: "getPriceHistory",
    value: { ...validFixtures.getPriceHistory, cursor: "" },
    path: ["cursor"],
  },
  {
    name: "invalid nested observation",
    contract: "priceHistory",
    value: {
      ...validFixtures.priceHistory,
      observations: [
        { ...validFixtures.observation, price: { ...price, amount: -1 } },
      ],
    },
    path: ["observations", 0, "price", "amount"],
  },
  {
    name: "numeric monetary amount",
    contract: "observation",
    value: { ...validFixtures.observation, price: { ...price, amount: 19.99 } },
    path: ["price", "amount"],
  },
  {
    name: "unsupported availability",
    contract: "extractionResult",
    value: {
      ...validFixtures.extractionResult,
      price: { ...price, availability: "available" },
    },
    path: ["price", "availability"],
  },
  {
    name: "success without price",
    contract: "extractionResult",
    value: { version: 1, status: "success" },
    path: ["price"],
  },
  {
    name: "error carrying a price",
    contract: "extractionResult",
    value: {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "missing_price",
        message: "No price",
      },
      price,
    },
    path: [],
  },
  {
    name: "authentication marked retryable",
    contract: "extractionResult",
    value: {
      version: 1,
      status: "error",
      error: {
        category: "temporary",
        code: "authentication",
        message: "Unauthorized",
      },
    },
    path: ["error", "code"],
  },
  {
    name: "browser enabled implicitly",
    contract: "extractionRequest",
    value: { version: 1, offer },
    path: ["mode"],
  },
  {
    name: "provider options leaked",
    contract: "extractionRequest",
    value: {
      ...validFixtures.extractionRequest,
      productOptions: { extractFrom: "browserHtml" },
    },
    path: [],
  },
  {
    name: "failed check without error",
    contract: "priceCheck",
    value: { ...validFixtures.priceCheck, status: "failed" },
    path: ["error"],
  },
  {
    name: "pending check with observation",
    contract: "priceCheck",
    value: { ...validFixtures.priceCheck, status: "pending" },
    path: [],
  },
];
