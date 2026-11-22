import { fileURLToPath } from "node:url";

import * as Cloudflare from "@alchemy.run/cloudflare";

import { compatibility } from "./config";

export const createWeb = (api: Cloudflare.Worker) =>
  Cloudflare.Website.Nuxt("Web", {
    rootDir: fileURLToPath(new URL("../apps/web", import.meta.url)),
    compatibility,
    env: { API: api },
  });
