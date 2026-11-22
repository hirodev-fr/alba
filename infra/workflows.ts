import * as Cloudflare from "@alchemy.run/cloudflare";

import { compatibility } from "./config";

export const createWorkflows = (workflowName: string) =>
  Cloudflare.Worker("Workflows", {
    main: "apps/workflows/src/index.ts",
    compatibility,
    workersDev: false,
    env: {
      PRICE_CHECK: Cloudflare.Workflow<{ checkId: string }>("PriceCheck", {
        className: "PriceCheckWorkflow",
        workflowName,
      }),
    },
  });
