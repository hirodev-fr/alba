import type { PriceCheckParamsV1 } from "@alba/contracts";
import { createDb } from "@alba/db";
import { createZyteExtractor } from "@alba/extraction";
import {
  finalizeCheck,
  InvalidCheckError,
  prepareCheck,
  recordAttempt,
} from "@alba/tracking";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import { runPriceCheck } from "./price-check";

interface Env {
  DATABASE_URL: string;
  ZYTE_API_KEY: string;
  EXTRACTION_ENABLED: string;
  EXTRACTION_ALLOWED_HOSTS: string;
}

export class PriceCheckWorkflow extends WorkflowEntrypoint<
  Env,
  PriceCheckParamsV1
> {
  run(event: WorkflowEvent<PriceCheckParamsV1>, step: WorkflowStep) {
    const db = createDb(this.env.DATABASE_URL);
    const extract = createZyteExtractor({
      apiKey: this.env.ZYTE_API_KEY,
      allowedHosts: this.env.EXTRACTION_ALLOWED_HOSTS.split(",")
        .map((host) => host.trim())
        .filter(Boolean),
      timeoutMs: 60_000,
    });
    return runPriceCheck(event.payload, event.instanceId, step, {
      prepare: async (checkId, workflowId) => {
        try {
          return await prepareCheck(db, checkId, workflowId);
        } catch (error) {
          if (error instanceof InvalidCheckError) {
            throw new NonRetryableError(error.message);
          }
          throw error;
        }
      },
      extract: (request) =>
        this.env.EXTRACTION_ENABLED === "true"
          ? extract(request)
          : Promise.resolve({
              version: 1,
              status: "error",
              error: {
                category: "permanent",
                code: "budget_exceeded",
                message: "Extraction spending is disabled.",
              },
            }),
      record: (input) => recordAttempt(db, input),
      finalize: async (checkId, result) => {
        const check = await finalizeCheck(db, { checkId, result });
        return { status: check.status };
      },
    });
  }
}
export default { fetch: () => new Response("Not found", { status: 404 }) };
