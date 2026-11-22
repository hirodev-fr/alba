import { expect, test } from "bun:test";

import app from "./index";

test("health endpoint", async () => {
  const response = await app.request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("RPC health procedure and missing route", async () => {
  const response = await app.request("/rpc/health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ json: { status: "ok" } });
  const missing = await app.request("/rpc/missing", { method: "POST" });
  expect(missing.status).toBe(404);
});
