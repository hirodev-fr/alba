import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as Output from "alchemy/Output";
import type * as Redacted from "effect/Redacted";

import { compatibility } from "./config";

export const createWorkflows = (
  workflowName: string,
  databaseUrl: Output.Output<Redacted.Redacted<string>>
) =>
  Cloudflare.Worker("Workflows", {
    main: "apps/workflows/src/index.ts",
    compatibility,
    workersDev: false,
    env: {
      DATABASE_URL: databaseUrl,
      PRICE_CHECK: Cloudflare.Workflow<{ checkId: string }>("PriceCheck", {
        className: "PriceCheckWorkflow",
        workflowName,
      }),
    },
  });
