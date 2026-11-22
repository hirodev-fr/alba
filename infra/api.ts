import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as Output from "alchemy/Output";
import type * as Redacted from "effect/Redacted";

import type { PriceCheckParamsV1 } from "../packages/contracts/src";
import { compatibility } from "./config";

export const createApi = (
  host: Cloudflare.Worker,
  workflowName: string,
  databaseUrl: Output.Output<Redacted.Redacted<string>>,
  verificationToken: Redacted.Redacted<string>,
  dispatchEnabled: boolean
) =>
  Cloudflare.Worker("Api", {
    main: "apps/api/src/index.ts",
    compatibility,
    workersDev: false,
    crons: dispatchEnabled ? ["* * * * *"] : [],
    env: {
      DATABASE_URL: databaseUrl,
      DISPATCH_ENABLED: String(dispatchEnabled),
      WORKFLOW_VERIFY_TOKEN: verificationToken,
      PRICE_CHECK: Cloudflare.Workflow<PriceCheckParamsV1>("PriceCheck", {
        className: "PriceCheckWorkflow",
        scriptName: host.workerName,
        workflowName,
      }),
    },
  });
