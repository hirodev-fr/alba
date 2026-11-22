import * as Cloudflare from "@alchemy.run/cloudflare";

import { compatibility } from "./config";

export const createApi = (host: Cloudflare.Worker, workflowName: string) =>
  Cloudflare.Worker("Api", {
    main: "apps/api/src/index.ts",
    compatibility,
    workersDev: false,
    env: {
      PRICE_CHECK: Cloudflare.Workflow<{ checkId: string }>("PriceCheck", {
        className: "PriceCheckWorkflow",
        scriptName: host.workerName,
        workflowName,
      }),
    },
  });
