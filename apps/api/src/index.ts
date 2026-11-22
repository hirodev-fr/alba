import { router } from "@alba/api";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";

const app = new Hono();
const rpc = new RPCHandler(router);
app.get("/health", (c) => c.json({ status: "ok" }));
app.use("/rpc/*", async (c, next) => {
  const result = await rpc.handle(c.req.raw, { prefix: "/rpc", context: {} });
  if (result.matched) {
    return c.newResponse(result.response.body, result.response);
  }
  return next();
});
export default app;
