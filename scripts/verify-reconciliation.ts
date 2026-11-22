import { eq } from "drizzle-orm";

/* oxlint-disable eslint/no-await-in-loop -- Poll the same instance; an observation timeout never creates replacement work. */
import { idSchema } from "../packages/contracts/src";
import {
  createDb,
  extractionAttempts,
  priceChecks,
  priceObservations,
  products,
} from "../packages/db/src";

const [apiUrl, mode, existingId] = process.argv.slice(2);
if (
  mode !== undefined &&
  (mode !== "--resume" || !existingId?.startsWith("b09-"))
) {
  throw new Error("Expected --resume <b09-check-id>");
}
const url = apiUrl ? URL.parse(apiUrl) : null;
const databaseUrl = process.env.DATABASE_URL;
const token = process.env.WORKFLOW_VERIFY_TOKEN;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !databaseUrl ||
  !token
) {
  throw new Error(
    "Usage: reconciliation:verify <local-api-url> [--resume <b09-check-id>]; requires DATABASE_URL and WORKFLOW_VERIFY_TOKEN matching Alchemy dev with DISPATCH_ENABLED=true and EXTRACTION_ENABLED=false."
  );
}
const db = createDb(databaseUrl);
const id = existingId
  ? idSchema.parse(existingId)
  : `b09-${crypto.randomUUID()}`;
const offer = {
  url: "https://reconciliation.example/product",
  context: {
    variant: {},
    country: null,
    expectedCurrency: "EUR",
    seller: null,
  },
};
if (!existingId) {
  await db.batch([
    db.insert(products).values({
      id,
      identityKey: crypto.randomUUID().replaceAll("-", "").repeat(2),
      ...offer,
    }),
    db.insert(priceChecks).values({
      id,
      productId: id,
      workflowId: id,
      scheduledAt: new Date(),
      // Deliberately incompatible with B07 HTTP preparation: real runtime failure,
      // before any extraction. Keep reconciliation ineligible until observed.
      request: { version: 1, mode: "browser", offer },
      nextReconcileAt: new Date(Date.now() + 3_600_000),
    }),
  ]);
}
process.stdout.write(`Reconciliation verification check: ${id}\n`);
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
if (!existingId) {
  const started = await fetch(new URL("/internal/checks/start", url), {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, checkId: id }),
    signal: AbortSignal.timeout(30_000),
  });
  if (started.status !== 201) {
    throw new Error(
      `Start HTTP ${started.status}; inspect retained check ${id}.`
    );
  }
}
let errored = false;
for (let poll = 0; poll < 30; poll += 1) {
  const response = await fetch(new URL(`/internal/checks/${id}`, url), {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Status HTTP ${response.status}`);
  }
  const state: unknown = await response.json();
  if (
    state &&
    typeof state === "object" &&
    "status" in state &&
    state.status === "errored"
  ) {
    errored = true;
    break;
  }
  await Bun.sleep(1000);
}
if (!errored) {
  throw new Error(`Observation timeout; inspect ${id}, do not recreate it.`);
}
const [before] = await db
  .select()
  .from(priceChecks)
  .where(eq(priceChecks.id, id));
if (
  before?.status !== "running" &&
  !(
    existingId &&
    before?.status === "failed" &&
    before.error?.code === "workflow_failed"
  )
) {
  throw new Error("Expected orphaned running SQL check");
}
await db
  .update(priceChecks)
  .set({ nextReconcileAt: new Date(0) })
  .where(eq(priceChecks.id, id));
for (let pass = 0; pass < 2; pass += 1) {
  const response = await fetch(new URL("/cdn-cgi/handler/scheduled", url), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || (await response.text()) !== "ok") {
    throw new Error(`Scheduled HTTP ${response.status}; inspect ${id}.`);
  }
  const [after] = await db
    .select()
    .from(priceChecks)
    .where(eq(priceChecks.id, id));
  const attempts = await db
    .select()
    .from(extractionAttempts)
    .where(eq(extractionAttempts.checkId, id));
  const observations = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, id));
  if (
    after?.status !== "failed" ||
    after.error?.code !== "workflow_failed" ||
    attempts.length !== 0 ||
    observations.length !== 0
  ) {
    throw new Error(
      "Expected reconciled failure with zero extraction attempts and observations"
    );
  }
}
process.stdout.write(
  `${JSON.stringify({ checkId: id, workflowStatus: "errored", checkStatus: "failed", code: "workflow_failed", attempts: 0, observations: 0, cronPasses: 2 })}\n`
);
