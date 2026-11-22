import { z } from "zod";

import { contractVersionSchema, idSchema, timestampSchema } from "./common";
import { offerSchema } from "./product";

// Technical bounds only; pricing and supported commercial plans remain undecided.
export const intervalSecondsSchema = z.int().min(60).max(31_536_000);
export const trackingStatusSchema = z.enum([
  "active",
  "paused",
  "cancelled",
  "expired",
]);

const trackingPeriodSchema = z.strictObject({
  intervalSeconds: intervalSecondsSchema,
  startsAt: timestampSchema,
  endsAt: timestampSchema,
});

const hasOrderedPeriod = (value: { startsAt: string; endsAt: string }) =>
  Date.parse(value.endsAt) > Date.parse(value.startsAt);
const periodError = {
  message: "endsAt must be after startsAt",
  path: ["endsAt"],
};

export const createTrackingInputV1Schema = z
  .strictObject({
    version: contractVersionSchema,
    offer: offerSchema,
    ...trackingPeriodSchema.shape,
  })
  .refine(hasOrderedPeriod, periodError);

// A complete replacement of mutable settings lets the period be checked locally.
export const updateTrackingInputV1Schema = z
  .strictObject({
    version: contractVersionSchema,
    trackingId: idSchema,
    ...trackingPeriodSchema.shape,
    status: z.enum(["active", "paused", "cancelled"]),
  })
  .refine(hasOrderedPeriod, periodError);

export const getTrackingInputV1Schema = z.strictObject({
  version: contractVersionSchema,
  trackingId: idSchema,
});

export const trackingV1Schema = z
  .strictObject({
    version: contractVersionSchema,
    id: idSchema,
    productId: idSchema,
    ...trackingPeriodSchema.shape,
    status: trackingStatusSchema,
    createdAt: timestampSchema,
  })
  .refine(hasOrderedPeriod, periodError);

export type CreateTrackingInputV1 = z.infer<typeof createTrackingInputV1Schema>;
export type UpdateTrackingInputV1 = z.infer<typeof updateTrackingInputV1Schema>;
export type GetTrackingInputV1 = z.infer<typeof getTrackingInputV1Schema>;
export type TrackingV1 = z.infer<typeof trackingV1Schema>;
export type TrackingStatus = z.infer<typeof trackingStatusSchema>;
