import { CloudflareEnvironment } from "@alchemy.run/cloudflare/CloudflareEnvironment";
import { CloudflareApiLive } from "@alchemy.run/cloudflare/Providers";
import * as Workflows from "@distilled.cloud/cloudflare/workflows";
import * as BunServices from "@effect/platform-bun/BunServices";
import { AuthProvidersLive } from "alchemy/Auth/Registry";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schedule from "effect/Schedule";

const [webUrl, workflowName] = process.argv.slice(2);
if (!(webUrl && workflowName)) {
  throw new Error("Usage: bun run infra:verify <webUrl> <workflowName>");
}

const verify = Effect.gen(function* verify() {
  const { accountId } = yield* CloudflareEnvironment.current;
  const health = yield* Effect.tryPromise(async () => {
    const response = await fetch(new URL("/api/health", webUrl));
    const body: unknown = await response.json();
    if (!response.ok || JSON.stringify(body) !== '{"status":"ok"}') {
      throw new Error("Web → API health failed");
    }
    const rpc = await fetch(new URL("/api/rpc/health", webUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const rpcBody: unknown = await rpc.json();
    if (!rpc.ok || JSON.stringify(rpcBody) !== '{"json":{"status":"ok"}}') {
      throw new Error("Web → API RPC failed");
    }
    return "ok";
  });

  const instanceId = `b02-${crypto.randomUUID()}`;
  yield* Workflows.createInstance({
    accountId,
    workflowName,
    instanceId,
    params: { checkId: instanceId },
  });
  const instance = yield* Workflows.getInstance({
    accountId,
    workflowName,
    instanceId,
  }).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("2 seconds"),
      until: (result) =>
        ["complete", "errored", "terminated"].includes(result.status),
    }),
    Effect.timeout("60 seconds")
  );
  if (instance.status !== "complete") {
    return yield* Effect.fail(new Error(`Workflow status: ${instance.status}`));
  }
  const output: unknown = instance.output;
  if (
    typeof output !== "object" ||
    output === null ||
    !("checkId" in output) ||
    output.checkId !== instanceId ||
    !("status" in output) ||
    output.status !== "not-implemented"
  ) {
    return yield* Effect.fail(new Error("Unexpected skeleton Workflow output"));
  }
  yield* Effect.logInfo({
    health,
    workflowName,
    instanceId,
    output: instance.output,
  });
});

await Effect.runPromise(
  verify.pipe(
    Effect.provide(CloudflareApiLive()),
    Effect.provide(AuthProvidersLive),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(SecureRandom.layerWebCrypto),
    Effect.provide(BunServices.layer)
  )
);
