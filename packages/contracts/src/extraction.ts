import { z } from "zod";

import { contractVersionSchema, labelSchema } from "./common";
import {
  extractedPriceSchema,
  extractionModeSchema,
  offerSchema,
} from "./product";

export const extractionRequestV1Schema = z.strictObject({
  version: contractVersionSchema,
  offer: offerSchema,
  mode: extractionModeSchema,
});

export const extractionErrorSchema = z.discriminatedUnion("category", [
  z.strictObject({
    category: z.literal("temporary"),
    code: z.enum([
      "network",
      "timeout",
      "rate_limited",
      "provider_unavailable",
    ]),
    message: labelSchema,
  }),
  z.strictObject({
    category: z.literal("permanent"),
    code: z.enum([
      "authentication",
      "budget_exceeded",
      "access_denied",
      "unsupported_url",
      "invalid_response",
      "workflow_failed",
    ]),
    message: labelSchema,
  }),
  z.strictObject({
    category: z.literal("business"),
    code: z.enum([
      "missing_price",
      "ambiguous_price",
      "context_mismatch",
      "currency_mismatch",
      "product_not_found",
    ]),
    message: labelSchema,
  }),
]);

export const extractionResultV1Schema = z.discriminatedUnion("status", [
  z.strictObject({
    version: contractVersionSchema,
    status: z.literal("success"),
    price: extractedPriceSchema,
  }),
  z.strictObject({
    version: contractVersionSchema,
    status: z.literal("error"),
    error: extractionErrorSchema,
  }),
]);

export type ExtractionRequestV1 = z.infer<typeof extractionRequestV1Schema>;
export type ExtractionError = z.infer<typeof extractionErrorSchema>;
export type ExtractionResultV1 = z.infer<typeof extractionResultV1Schema>;
