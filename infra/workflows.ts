import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as Output from "alchemy/Output";
import type * as Redacted from "effect/Redacted";

import type { PriceCheckParamsV1 } from "../packages/contracts/src";
import { compatibility } from "./config";

export const createWorkflows = (
  workflowName: string,
  databaseUrl: Output.Output<Redacted.Redacted<string>>,
  extraction: {
    ZYTE_API_KEY: Redacted.Redacted<string>;
    EXTRACTION_ENABLED: string;
    EXTRACTION_ALLOWED_HOSTS: string;
  }
) =>
  Cloudflare.Worker("Workflows", {
    main: "apps/workflows/src/index.ts",
    compatibility,
    workersDev: false,
    env: {
      DATABASE_URL: databaseUrl,
      ...extraction,
      PRICE_CHECK: Cloudflare.Workflow<PriceCheckParamsV1>("PriceCheck", {
        className: "PriceCheckWorkflow",
        workflowName,
      }),
    },
  });
