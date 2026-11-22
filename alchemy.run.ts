import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

import { createApi } from "./infra/api";
import { createWeb } from "./infra/web";
import { createWorkflows } from "./infra/workflows";

export default Alchemy.Stack(
  "Alba",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* createStack() {
    const stage = yield* Alchemy.Stage;
    const workflowName = `alba-price-check-${stage}`;
    const workflows = yield* createWorkflows(workflowName);
    const api = yield* createApi(workflows, workflowName);
    const web = yield* createWeb(api);
    return {
      webUrl: web.url,
      apiWorkerName: api.workerName,
      workflowWorkerName: workflows.workerName,
      workflowName,
    };
  })
);
