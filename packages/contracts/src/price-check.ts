import { z } from "zod";

import { contractVersionSchema, idSchema, timestampSchema } from "./common";
import { extractionErrorSchema } from "./extraction";
import { priceObservationV1Schema } from "./product";

export const priceCheckParamsV1Schema = z.strictObject({
  version: contractVersionSchema,
  checkId: idSchema,
});

const checkFields = {
  version: contractVersionSchema,
  id: idSchema,
  productId: idSchema,
  scheduledAt: timestampSchema,
  workflowId: idSchema.nullable(),
};

export const priceCheckV1Schema = z.discriminatedUnion("status", [
  z.strictObject({ ...checkFields, status: z.literal("pending") }),
  z.strictObject({
    ...checkFields,
    status: z.literal("running"),
    workflowId: idSchema,
    startedAt: timestampSchema,
  }),
  z.strictObject({
    ...checkFields,
    status: z.literal("succeeded"),
    finishedAt: timestampSchema,
    observationId: idSchema,
  }),
  z.strictObject({
    ...checkFields,
    status: z.literal("failed"),
    finishedAt: timestampSchema,
    error: extractionErrorSchema,
  }),
  z.strictObject({
    ...checkFields,
    status: z.literal("cancelled"),
    finishedAt: timestampSchema,
  }),
]);

export const getPriceCheckInputV1Schema = priceCheckParamsV1Schema;

// History is scoped to a tracking so B10 can enforce ownership before sharing observations.
export const getPriceHistoryInputV1Schema = z.strictObject({
  version: contractVersionSchema,
  trackingId: idSchema,
  limit: z.int().min(1).max(100),
  cursor: idSchema.nullable(),
});

export const priceHistoryV1Schema = z.strictObject({
  version: contractVersionSchema,
  observations: z.array(priceObservationV1Schema).max(100),
  nextCursor: idSchema.nullable(),
});

export type PriceCheckParamsV1 = z.infer<typeof priceCheckParamsV1Schema>;
export type PriceCheckV1 = z.infer<typeof priceCheckV1Schema>;
export type GetPriceCheckInputV1 = z.infer<typeof getPriceCheckInputV1Schema>;
export type GetPriceHistoryInputV1 = z.infer<
  typeof getPriceHistoryInputV1Schema
>;
export type PriceHistoryV1 = z.infer<typeof priceHistoryV1Schema>;
