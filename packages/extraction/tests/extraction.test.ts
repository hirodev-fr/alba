import { expect, test } from "bun:test";

import { createZyteExtractor } from "../src";

const request = {
  version: 1,
  mode: "http",
  offer: {
    url: "https://books.toscrape.com/product",
    context: {
      variant: {},
      country: null,
      seller: null,
      expectedCurrency: "GBP",
    },
  },
};

test("HTTP extraction sends explicit mode and preserves decimal precision", async () => {
  const calls: RequestInit[] = [];
  const extract = createZyteExtractor({
    apiKey: "test-key",
    fetch: (_url, init) => {
      calls.push(init);
      return Promise.resolve(
        Response.json({
          product: {
            url: request.offer.url,
            price: "00019.990000000000000001",
            currency: "GBP",
            availability: "InStock",
          },
        })
      );
    },
  });
  const result = await extract(request);
  expect(calls).toHaveLength(1);
  expect(JSON.parse(String(calls[0]?.body))).toEqual({
    url: request.offer.url,
    product: true,
    productOptions: { extractFrom: "httpResponseBody" },
  });
  expect(result.status).toBe("success");
  if (result.status === "success") {
    expect(result.price.amount).toBe("19.990000000000000001");
    expect(result.price.availability).toBe("in_stock");
  }
});

test.each([
  [401, "authentication"],
  [402, "budget_exceeded"],
  [429, "rate_limited"],
  [521, "access_denied"],
  [520, "provider_unavailable"],
] as const)("classifies HTTP %i without leaking body", async (status, code) => {
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () =>
      Promise.resolve(new Response("sensitive provider body", { status })),
  });
  const result = await extract(request);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error.code).toBe(code);
    expect(result.error.message).not.toContain("sensitive");
  }
});

test("rejects browser mode before calling provider", async () => {
  let calls = 0;
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () => {
      calls += 1;
      return Promise.resolve(Response.json({}));
    },
  });
  const result = await extract({ ...request, mode: "browser" });
  expect(result.status).toBe("error");
  expect(calls).toBe(0);
});

test.each([
  [{}, "product_not_found"],
  [{ product: { url: request.offer.url } }, "missing_price"],
  [
    { product: { url: request.offer.url, price: "10", currency: "USD" } },
    "currency_mismatch",
  ],
  [
    { product: { url: request.offer.url, price: "10-20", currency: "GBP" } },
    "ambiguous_price",
  ],
  [{ product: { url: request.offer.url, price: 10 } }, "invalid_response"],
] as const)("rejects unusable product %j", async (payload, code) => {
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () => Promise.resolve(Response.json(payload)),
  });
  const result = await extract(request);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error.code).toBe(code);
  }
});

test("network failures do not expose the exception or retry", async () => {
  let calls = 0;
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () => {
      calls += 1;
      return Promise.reject(new Error("secret-key"));
    },
  });
  const result = await extract(request);
  expect(result).toEqual({
    version: 1,
    status: "error",
    error: {
      category: "temporary",
      code: "network",
      message: "Provider connection failed.",
    },
  });
  expect(calls).toBe(1);
});

test.each([
  [404, "product_not_found"],
  [503, "provider_unavailable"],
  [403, "access_denied"],
] as const)(
  "rejects target HTTP %i inside successful Zyte response",
  async (statusCode, code) => {
    const extract = createZyteExtractor({
      apiKey: "test",
      fetch: () =>
        Promise.resolve(
          Response.json({
            statusCode,
            product: { url: request.offer.url, price: "10", currency: "GBP" },
          })
        ),
    });
    const result = await extract(request);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(code);
    }
  }
);

test("aborts an outstanding provider request at its timeout", async () => {
  const extract = createZyteExtractor({
    apiKey: "test",
    timeoutMs: 10,
    fetch: (_url, init) =>
      // oxlint-disable-next-line promise/avoid-new -- Model fetch cancellation through AbortSignal.
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
      }),
  });
  const result = await extract(request);
  expect(result).toEqual({
    version: 1,
    status: "error",
    error: {
      category: "temporary",
      code: "timeout",
      message: "Extraction timed out.",
    },
  });
});

test.each([
  "http://127.0.0.1/product",
  "https://localhost/product",
  "https://shop.test/product",
  "https://books.toscrape.com:8080/product",
  "https://user:password@books.toscrape.com/product",
])("rejects disallowed URL %s before spending", async (url) => {
  let calls = 0;
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () => {
      calls += 1;
      return Promise.resolve(Response.json({}));
    },
  });
  const result = await extract({
    ...request,
    offer: { ...request.offer, url },
  });
  expect(result.status).toBe("error");
  expect(calls).toBe(0);
});

test("checks the returned URL against the explicit host policy", async () => {
  const extract = createZyteExtractor({
    apiKey: "test",
    allowedHosts: ["books.toscrape.com"],
    fetch: () =>
      Promise.resolve(
        Response.json({
          product: {
            url: "https://other.example.org/product",
            price: "10",
            currency: "GBP",
          },
        })
      ),
  });
  const result = await extract(request);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error.code).toBe("unsupported_url");
  }
});

test("requested variant must match extracted attributes", async () => {
  const extract = createZyteExtractor({
    apiKey: "test",
    fetch: () =>
      Promise.resolve(
        Response.json({
          product: {
            url: request.offer.url,
            price: "10",
            currency: "GBP",
            color: "Red",
          },
        })
      ),
  });
  const result = await extract({
    ...request,
    offer: {
      ...request.offer,
      context: { ...request.offer.context, variant: { color: "Blue" } },
    },
  });
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error.code).toBe("context_mismatch");
  }
});
