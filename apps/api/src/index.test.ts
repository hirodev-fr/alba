import { expect, test } from "bun:test";

import { app } from "./index";

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

test("operator trigger is disabled without a secret and rejects invalid authorization", async () => {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 1, checkId: "b07-test" }),
  };
  const disabled = await app.request("/internal/checks/start", init);
  expect(disabled.status).toBe(404);
  const response = await app.request("/internal/checks/start", init, {
    WORKFLOW_VERIFY_TOKEN: "test-token",
  });
  expect(response.status).toBe(404);
});

test("operator trigger uses the versioned payload and deterministic ID through binding", async () => {
  const calls: unknown[] = [];
  const env = {
    WORKFLOW_VERIFY_TOKEN: "test-token",
    PRICE_CHECK: {
      create: (options: { id: string }) => {
        calls.push(options);
        return Promise.resolve({ id: options.id });
      },
      get: (id: string) => {
        calls.push(id);
        return Promise.resolve({
          status: () => Promise.resolve({ status: "complete" }),
        });
      },
    },
  };
  const headers = {
    authorization: "Bearer test-token",
    "content-type": "application/json",
  };
  const invalid = await app.request(
    "/internal/checks/start",
    { method: "POST", headers, body: '{"checkId":"b07-test"}' },
    env
  );
  expect(invalid.status).toBe(400);
  expect(calls).toEqual([]);
  const response = await app.request(
    "/internal/checks/start",
    { method: "POST", headers, body: '{"version":1,"checkId":"b07-test"}' },
    env
  );
  expect(response.status).toBe(201);
  expect(calls).toEqual([
    { id: "b07-test", params: { version: 1, checkId: "b07-test" } },
  ]);
  const status = await app.request(
    "/internal/checks/b07-test",
    { headers },
    env
  );
  expect(await status.json()).toEqual({ status: "complete" });
});
