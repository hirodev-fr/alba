import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Neon from "@alchemy.run/neon";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { createApi } from "./infra/api";
import { createDatabase } from "./infra/database";
import { createWeb } from "./infra/web";
import { createWorkflows } from "./infra/workflows";

export default Alchemy.Stack(
  "Alba",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Neon.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* createStack() {
    const stage = yield* Alchemy.Stage;
    const workflowName = `alba-price-check-${stage}`;
    const database = yield* createDatabase(stage);
    const databaseUrl = database.connectionUri.pipe(Output.map(Redacted.make));
    const workflows = yield* createWorkflows(workflowName, databaseUrl);
    const api = yield* createApi(workflows, workflowName, databaseUrl);
    const web = yield* createWeb(api);
    return {
      webUrl: web.url,
      apiWorkerName: api.workerName,
      workflowWorkerName: workflows.workerName,
      workflowName,
      databaseProjectId: database.projectId,
      databaseBranchId: database.defaultBranchId,
    };
  })
);
