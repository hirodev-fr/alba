import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

// Partial stack: API, workflow, bindings, secrets and environments are not yet defined.
export const Website = Cloudflare.Website.Nuxt("Web", { rootDir: "apps/web" });

export default Alchemy.Stack(
  "Alba",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* createStack() {
    const web = yield* Website;
    return { webUrl: web.url };
  })
);
