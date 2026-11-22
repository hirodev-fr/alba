import { extractedPriceSchema } from "@alba/contracts";
import type { ExtractionRequestV1, ExtractionResultV1 } from "@alba/contracts";
import { z } from "zod";

import { classifyHttpError, failure } from "./errors";

const productSchema = z.object({
  price: z.string().optional(),
  currency: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  availability: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  style: z.string().optional(),
  material: z.string().optional(),
  additionalProperties: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
});
const responseSchema = z.object({
  product: productSchema.nullish(),
  statusCode: z.number().int().min(100).max(599).optional(),
});

export const mapZyteProduct = (
  payload: unknown,
  request: ExtractionRequestV1,
  observedAt: string
): ExtractionResultV1 => {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "permanent",
        code: "invalid_response",
        message: "Invalid provider response.",
      },
    };
  }
  const { statusCode } = parsed.data;
  if (statusCode === 404 || statusCode === 410) {
    return failure({
      category: "business",
      code: "product_not_found",
      message: "Product page was not found.",
    });
  }
  if (statusCode !== undefined && (statusCode < 200 || statusCode >= 300)) {
    return failure(classifyHttpError(statusCode, ""));
  }
  const { product } = parsed.data;
  if (!product) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "product_not_found",
        message: "No product extracted.",
      },
    };
  }
  const attributes = new Map(
    product.additionalProperties?.map(({ name, value }) => [name, value])
  );
  for (const name of ["color", "size", "style", "material"] as const) {
    const value = product[name];
    if (value !== undefined) {
      attributes.set(name, value);
    }
  }
  if (
    request.offer.context.seller !== null ||
    Object.entries(request.offer.context.variant).some(
      ([name, value]) => attributes.get(name) !== value
    )
  ) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "context_mismatch",
        message: "Requested offer context could not be verified.",
      },
    };
  }
  if (product.price === undefined) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "missing_price",
        message: "No offer price extracted.",
      },
    };
  }
  if (
    request.offer.context.expectedCurrency !== null &&
    product.currency !== request.offer.context.expectedCurrency
  ) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "currency_mismatch",
        message: "Extracted currency does not match the requested currency.",
      },
    };
  }
  const price = extractedPriceSchema.safeParse({
    amount: product.price.replace(/^0+(?=\d)/u, ""),
    currency: product.currency,
    availability:
      (
        { InStock: "in_stock", OutOfStock: "out_of_stock" } as Record<
          string,
          string
        >
      )[product.availability ?? ""] ?? "unknown",
    title: product.name ?? null,
    sourceUrl: product.url,
    observedAt,
    provenance: { provider: "zyte", mode: "http" },
  });
  if (!price.success) {
    return {
      version: 1,
      status: "error",
      error: {
        category: "business",
        code: "ambiguous_price",
        message: "Extracted price is not usable as an observation.",
      },
    };
  }
  return { version: 1, status: "success", price: price.data };
};
