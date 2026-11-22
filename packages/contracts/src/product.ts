import { z } from "zod";

import {
  contractVersionSchema,
  countrySchema,
  currencySchema,
  decimalAmountSchema,
  idSchema,
  labelSchema,
  productUrlSchema,
  timestampSchema,
} from "./common";

export const availabilitySchema = z.enum([
  "in_stock",
  "out_of_stock",
  "unknown",
]);
export const extractionModeSchema = z.enum(["http", "browser"]);

export const offerContextSchema = z.strictObject({
  variant: z.record(labelSchema, labelSchema),
  country: countrySchema.nullable(),
  expectedCurrency: currencySchema.nullable(),
  seller: labelSchema.nullable(),
});

export const offerSchema = z.strictObject({
  url: productUrlSchema,
  context: offerContextSchema,
});

export const extractedPriceSchema = z.strictObject({
  amount: decimalAmountSchema,
  currency: currencySchema,
  availability: availabilitySchema,
  title: labelSchema.nullable(),
  observedAt: timestampSchema,
  sourceUrl: productUrlSchema,
  provenance: z.strictObject({
    provider: z.literal("zyte"),
    mode: extractionModeSchema,
  }),
});

export const priceObservationV1Schema = z.strictObject({
  version: contractVersionSchema,
  id: idSchema,
  productId: idSchema,
  checkId: idSchema,
  price: extractedPriceSchema,
});

export const productV1Schema = z.strictObject({
  version: contractVersionSchema,
  id: idSchema,
  offer: offerSchema,
  title: labelSchema.nullable(),
  createdAt: timestampSchema,
  currentObservation: priceObservationV1Schema.nullable(),
});

export const getProductInputV1Schema = z.strictObject({
  version: contractVersionSchema,
  productId: idSchema,
});

export type OfferContext = z.infer<typeof offerContextSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type ExtractionMode = z.infer<typeof extractionModeSchema>;
export type ExtractedPrice = z.infer<typeof extractedPriceSchema>;
export type PriceObservationV1 = z.infer<typeof priceObservationV1Schema>;
export type ProductV1 = z.infer<typeof productV1Schema>;
export type GetProductInputV1 = z.infer<typeof getProductInputV1Schema>;
