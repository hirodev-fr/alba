import process from "node:process";

const [webUrl] = process.argv.slice(2);
if (!webUrl) {
  throw new Error(
    "Usage: bun run infra:verify <webUrl>; use workflow:verify for the paid B07 check."
  );
}
for (const [path, init, expected] of [
  ["/api/health", {}, { status: "ok" }],
  [
    "/api/rpc/health",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
    { json: { status: "ok" } },
  ],
] as const) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- Verify the two endpoints sequentially.
  const response = await fetch(new URL(path, webUrl), {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  // oxlint-disable-next-line eslint/no-await-in-loop -- Read each response before proceeding.
  const body: unknown = await response.json();
  if (!response.ok || JSON.stringify(body) !== JSON.stringify(expected)) {
    throw new Error(`Infrastructure verification failed: ${path}`);
  }
}
process.stdout.write("Web → API HTTP and oRPC: ok\n");
