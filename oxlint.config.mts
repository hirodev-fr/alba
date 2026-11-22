import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import drizzle from "ultracite/oxlint/drizzle";
import tanstack from "ultracite/oxlint/tanstack";
import vue from "ultracite/oxlint/vue";

export default defineConfig({
  env: core.env,
  extends: [core, vue, tanstack, drizzle],
  ignorePatterns: core.ignorePatterns,
});
