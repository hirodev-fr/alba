import { router } from "@alba/api";
import { priceCheckParamsV1Schema } from "@alba/contracts";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";

import { scheduled } from "./scheduled";
import type { SchedulerEnv } from "./scheduled";

interface Env extends SchedulerEnv {
  WORKFLOW_VERIFY_TOKEN?: string;
}
const app = new Hono<{ Bindings: Env }>();
const rpc = new RPCHandler(router);
// Explicit operator-only verification until the owned business API is available in B10/B11.
app.use("/internal/checks/*", async (c, next) => {
  const token = c.env?.WORKFLOW_VERIFY_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) {
    return c.json({ error: "Not found" }, 404);
  }
  return await next();
});
app.post("/internal/checks/start", async (c) => {
  const parsed = priceCheckParamsV1Schema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid check parameters" }, 400);
  }
  const workflow = c.env.PRICE_CHECK;
  if (!workflow) {
    return c.json({ error: "Workflow binding unavailable" }, 503);
  }
  const instance = await workflow.create({
    id: parsed.data.checkId,
    params: parsed.data,
  });
  return c.json({ id: instance.id }, 201);
});
app.get("/internal/checks/:id", async (c) => {
  const parsed = priceCheckParamsV1Schema.safeParse({
    version: 1,
    checkId: c.req.param("id"),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid check ID" }, 400);
  }
  const workflow = c.env.PRICE_CHECK;
  if (!workflow) {
    return c.json({ error: "Workflow binding unavailable" }, 503);
  }
  const instance = await workflow.get(parsed.data.checkId);
  return c.json(await instance.status());
});
app.get("/health", (c) => c.json({ status: "ok" }));
app.use("/rpc/*", async (c, next) => {
  const result = await rpc.handle(c.req.raw, { prefix: "/rpc", context: {} });
  if (result.matched) {
    return c.newResponse(result.response.body, result.response);
  }
  return next();
});
export { app };
export default { fetch: app.fetch, scheduled };
