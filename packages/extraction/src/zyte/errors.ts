import type { ExtractionError, ExtractionResultV1 } from "@alba/contracts";

export const failure = (error: ExtractionError): ExtractionResultV1 => ({
  version: 1,
  status: "error",
  error,
});

export const classifyHttpError = (
  status: number,
  type: string
): ExtractionError => {
  if (status === 401) {
    return {
      category: "permanent",
      code: "authentication",
      message: "Provider authentication failed.",
    };
  }
  if (status === 402 || type === "/limits/over-spending-limit") {
    return {
      category: "permanent",
      code: "budget_exceeded",
      message: "Provider spending limit reached.",
    };
  }
  if (status === 403 || status === 451 || status === 521) {
    return {
      category: "permanent",
      code: "access_denied",
      message: "Provider denied extraction.",
    };
  }
  if (
    status === 429 ||
    type === "/limits/over-global-limit" ||
    type === "/extractor/over-global-limit"
  ) {
    return {
      category: "temporary",
      code: "rate_limited",
      message: "Provider rate limit reached.",
    };
  }
  if (status === 408 || status === 504 || type === "/server/timed-out") {
    return {
      category: "temporary",
      code: "timeout",
      message: "Provider request timed out.",
    };
  }
  if (status >= 500) {
    return {
      category: "temporary",
      code: "provider_unavailable",
      message: "Provider temporarily unavailable.",
    };
  }
  return {
    category: "permanent",
    code: "unsupported_url",
    message: "Provider rejected the extraction request.",
  };
};
