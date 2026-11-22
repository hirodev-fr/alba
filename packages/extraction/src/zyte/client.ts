import { extractionRequestV1Schema } from "@alba/contracts";
import type { ExtractionResultV1 } from "@alba/contracts";
import { z } from "zod";

import { isAllowedProductUrl } from "../url-policy";
import { classifyHttpError, failure } from "./errors";
import { mapZyteProduct } from "./mapper";

export interface ZyteOptions {
  apiKey: string;
  allowedHosts?: readonly string[];
  timeoutMs?: number;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

const errorSchema = z.object({ type: z.string().optional() });

export const createZyteExtractor = (options: ZyteOptions) => {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 120_000
  ) {
    throw new Error(
      "Extraction timeout must be between 1 and 120000 milliseconds."
    );
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  return async (input: unknown): Promise<ExtractionResultV1> => {
    const parsed = extractionRequestV1Schema.safeParse(input);
    if (
      !parsed.success ||
      parsed.data.mode !== "http" ||
      !isAllowedProductUrl(parsed.data.offer.url, options.allowedHosts)
    ) {
      return failure({
        category: "permanent",
        code: "unsupported_url",
        message: "A valid HTTP extraction request is required.",
      });
    }
    if (!options.apiKey.trim()) {
      return failure({
        category: "permanent",
        code: "authentication",
        message: "Provider API key is missing.",
      });
    }
    const request = parsed.data;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetcher("https://api.zyte.com/v1/extract", {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${btoa(`${options.apiKey}:`)}`,
        },
        body: JSON.stringify({
          url: request.offer.url,
          product: true,
          productOptions: { extractFrom: "httpResponseBody" },
          ...(request.offer.context.country === null
            ? {}
            : { geolocation: request.offer.context.country }),
        }),
      });
      if (!response.ok) {
        let type = "";
        try {
          const error = errorSchema.safeParse(await response.json());
          type = error.success ? (error.data.type ?? "") : "";
        } catch {
          // HTTP status still classifies non-JSON provider errors.
        }
        return failure(classifyHttpError(response.status, type));
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (signal.aborted) {
          return failure({
            category: "temporary",
            code: "timeout",
            message: "Extraction timed out.",
          });
        }
        return failure({
          category: "permanent",
          code: "invalid_response",
          message: "Provider returned invalid JSON.",
        });
      }
      const result = mapZyteProduct(payload, request, new Date().toISOString());
      if (
        result.status === "success" &&
        !isAllowedProductUrl(result.price.sourceUrl, options.allowedHosts)
      ) {
        return failure({
          category: "permanent",
          code: "unsupported_url",
          message: "Returned product URL is not allowed.",
        });
      }
      return result;
    } catch {
      if (signal.aborted) {
        return failure({
          category: "temporary",
          code: "timeout",
          message: "Extraction timed out.",
        });
      }
      return failure({
        category: "temporary",
        code: "network",
        message: "Provider connection failed.",
      });
    }
  };
};
