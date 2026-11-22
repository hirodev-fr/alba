/* oxlint-disable eslint/no-await-in-loop -- Observe one known check without starting replacement work. */
import { eq } from "drizzle-orm";

import {
  createDb,
  extractionAttempts,
  priceChecks,
  products,
  productSchedules,
  trackings,
  user,
} from "../packages/db/src";

const [apiUrl] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
const url = apiUrl ? URL.parse(apiUrl) : null;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !databaseUrl
) {
  throw new Error(
    "Usage: dispatcher:verify <local-api-url>; requires DATABASE_URL matching Alchemy dev, DISPATCH_ENABLED=true and EXTRACTION_ENABLED=false."
  );
}
const db = createDb(databaseUrl);
const id = `b08-${crypto.randomUUID()}`;
const now = Date.now();
await db.batch([
  db
    .insert(user)
    .values({ id, name: "B08 verification", email: `${id}@example.test` }),
  db.insert(products).values({
    id,
    identityKey: crypto.randomUUID().replaceAll("-", "").repeat(2),
    url: "https://dispatcher.example/product",
    context: {
      variant: {},
      country: null,
      expectedCurrency: "GBP",
      seller: null,
    },
  }),
  db.insert(trackings).values({
    id,
    productId: id,
    userId: id,
    intervalSeconds: 3600,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 300_000),
  }),
  db.insert(productSchedules).values({
    productId: id,
    intervalSeconds: 3600,
    nextCheckAt: new Date(now - 60_000),
  }),
]);
process.stdout.write(`Dispatcher verification product: ${id}\n`);
const trigger = async () => {
  const response = await fetch(new URL("/cdn-cgi/handler/scheduled", url), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || (await response.text()) !== "ok") {
    throw new Error(`Scheduled trigger HTTP ${response.status}`);
  }
};
try {
  await trigger();
  let complete = false;
  for (let poll = 0; poll < 30; poll += 1) {
    const checks = await db
      .select()
      .from(priceChecks)
      .where(eq(priceChecks.productId, id));
    const [check] = checks;
    if (checks.length > 1) {
      throw new Error("Duplicate scheduled check");
    }
    if (check?.finishedAt) {
      const attempts = await db
        .select()
        .from(extractionAttempts)
        .where(eq(extractionAttempts.checkId, check.id));
      const [schedule] = await db
        .select()
        .from(productSchedules)
        .where(eq(productSchedules.productId, id));
      if (
        check.status !== "failed" ||
        check.error?.code !== "budget_exceeded" ||
        attempts.length !== 1 ||
        check.workflowId !== check.id ||
        !schedule ||
        schedule.leaseToken !== null ||
        schedule.nextCheckAt.getTime() <= Date.now()
      ) {
        throw new Error(
          "Expected one disabled-spending workflow and an acknowledged schedule"
        );
      }
      await trigger();
      const repeated = await db
        .select()
        .from(priceChecks)
        .where(eq(priceChecks.productId, id));
      if (repeated.length !== 1) {
        throw new Error("Repeated cron created a duplicate check");
      }
      process.stdout.write(
        `${JSON.stringify({ productId: id, checkId: check.id, status: check.status, error: check.error.code, attempts: attempts.length, nextCheckAt: schedule.nextCheckAt.toISOString(), repeatedCron: "no duplicate" })}\n`
      );
      complete = true;
      break;
    }
    await Bun.sleep(2000);
  }
  if (!complete) {
    throw new Error(
      `Observation timeout for ${id}; inspect the retained check before retrying.`
    );
  }
} finally {
  // Keep evidence, but stop this synthetic tracking from generating future work.
  await db
    .update(trackings)
    .set({ status: "cancelled" })
    .where(eq(trackings.id, id));
}
