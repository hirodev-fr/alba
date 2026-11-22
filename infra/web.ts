import * as Cloudflare from "@alchemy.run/cloudflare";

import { compatibility } from "./config";

export const createWeb = (api: Cloudflare.Worker) =>
  Cloudflare.Website.Nuxt("Web", {
    rootDir: "apps/web",
    compatibility,
    env: { API: api },
  });
