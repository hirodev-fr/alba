/* oxlint-disable eslint/no-await-in-loop -- Poll one specific workflow without starting another instance. */
import { eq, sql } from "drizzle-orm";

import {
  createDb,
  extractionAttempts,
  priceChecks,
  priceObservations,
  products,
} from "../packages/db/src";
import { finalizeCheck } from "../packages/tracking/src";

const [webUrl, mode, fault] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
const token = process.env.WORKFLOW_VERIFY_TOKEN;
if (
  !webUrl ||
  mode !== "--live" ||
  !databaseUrl ||
  !token ||
  (fault !== undefined && fault !== "--sql-failure")
) {
  throw new Error(
    "Usage: workflow:verify <webUrl> --live [--sql-failure]; requires DATABASE_URL and WORKFLOW_VERIFY_TOKEN matching the running stage. Up to three paid HTTP calls."
  );
}
const db = createDb(databaseUrl);
const checkId = `b07-${crypto.randomUUID()}`;
const productId = crypto.randomUUID();
const url =
  "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
await db.batch([
  db.insert(products).values({
    id: productId,
    identityKey: productId.replaceAll("-", "").repeat(2),
    url,
    context: {
      variant: {},
      country: null,
      expectedCurrency: "GBP",
      seller: null,
    },
  }),
  db
    .insert(priceChecks)
    .values({ id: checkId, productId, scheduledAt: new Date() }),
]);
// Retain the check, attempts and observation as evidence, including on failure.
process.stdout.write(`Verification check: ${checkId}\n`);
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
const faultName = `b07_fault_${crypto.randomUUID().replaceAll("-", "")}`;
if (fault) {
  // nextval is not rolled back: exactly the first finalization fails, then the retry can succeed.
  await db.execute(sql`create sequence ${sql.identifier(faultName)}`);
  await db.execute(
    sql.raw(
      `create function "${faultName}"() returns trigger language plpgsql as $body$ begin if new.id = '${checkId}' and new.status = 'succeeded' then if nextval('"${faultName}"') = 1 then raise exception 'B07 injected SQL failure'; end if; end if; return new; end $body$`
    )
  );
  await db.execute(
    sql`create trigger ${sql.identifier(faultName)} before update on price_checks for each row execute function ${sql.identifier(faultName)}()`
  );
}
try {
  const started = await fetch(new URL("/api/internal/checks/start", webUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, checkId }),
    signal: AbortSignal.timeout(30_000),
  });
  if (started.status !== 201) {
    throw new Error(
      `Workflow start HTTP ${started.status}; retained check ${checkId}. Inspect the instance before retrying; do not create another check blindly.`
    );
  }
  let complete = false;
  for (let poll = 0; poll < 150; poll += 1) {
    const response = await fetch(
      new URL(`/api/internal/checks/${checkId}`, webUrl),
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) {
      throw new Error(`Workflow status HTTP ${response.status}`);
    }
    const state: unknown = await response.json();
    if (typeof state !== "object" || state === null || !("status" in state)) {
      throw new Error("Invalid Workflow status response");
    }
    if (state.status === "complete") {
      complete = true;
      break;
    }
    if (state.status === "errored" || state.status === "terminated") {
      throw new Error(
        `Workflow ${state.status}; inspect retained check ${checkId}`
      );
    }
    await Bun.sleep(2000);
  }
  if (!complete) {
    throw new Error(
      `Observation timeout; instance ${checkId} may still be running. Poll it before starting further work.`
    );
  }
  const [check] = await db
    .select()
    .from(priceChecks)
    .where(eq(priceChecks.id, checkId));
  const attempts = await db
    .select()
    .from(extractionAttempts)
    .where(eq(extractionAttempts.checkId, checkId));
  const observations = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, checkId));
  const [observation] = observations;
  const successful = attempts.find(
    (attempt) => attempt.result?.status === "success"
  );
  if (
    check?.status !== "succeeded" ||
    observations.length !== 1 ||
    observation?.amount !== "51.77" ||
    observation.currency !== "GBP" ||
    !successful?.result
  ) {
    throw new Error(
      `Workflow did not persist the reference price; inspect retained check ${checkId}`
    );
  }
  let sqlFinalizationAttempts: string | null = null;
  if (fault) {
    const counter = await db.execute(
      sql`select last_value::text as value, is_called from ${sql.identifier(faultName)}`
    );
    const [row] = counter.rows;
    if (!row?.is_called || row.value !== "2") {
      throw new Error(
        "Expected one injected SQL failure and one successful retry"
      );
    }
    sqlFinalizationAttempts = String(row.value);
    await db.execute(
      sql`drop trigger ${sql.identifier(faultName)} on price_checks`
    );
  }
  const repeated = await finalizeCheck(db, {
    checkId,
    result: successful.result,
  });
  const repeatedAgain = await finalizeCheck(db, {
    checkId,
    result: successful.result,
  });
  const after = await db
    .select()
    .from(priceObservations)
    .where(eq(priceObservations.checkId, checkId));
  if (
    after.length !== 1 ||
    repeated.observationId !== observation.id ||
    repeatedAgain.observationId !== observation.id
  ) {
    throw new Error("Finalization idempotence failed");
  }
  process.stdout.write(
    `${JSON.stringify({ checkId, productId, workflowStatus: "complete", checkStatus: check.status, attempts: attempts.length, observations: after.length, amount: observation.amount, currency: observation.currency, observedAt: observation.observedAt.toISOString(), repeatedFinalizations: 2, sqlFinalizationAttempts })}\n`
  );
} finally {
  if (fault) {
    await db.execute(
      sql`drop trigger if exists ${sql.identifier(faultName)} on price_checks`
    );
    await db.execute(sql`drop function ${sql.identifier(faultName)}()`);
    await db.execute(sql`drop sequence ${sql.identifier(faultName)}`);
  }
}
