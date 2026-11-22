import * as Neon from "@alchemy.run/neon";
import * as RemovalPolicy from "alchemy/RemovalPolicy";

// A project per stage keeps production and preview data independent.
export const createDatabase = (stage: string) =>
  Neon.Project("Database", {
    region: "aws-eu-central-1",
    pgVersion: 17,
    defaultBranchName: stage,
    historyRetentionSeconds: 21_600,
    migrations: "./packages/db/migrations",
  }).pipe(RemovalPolicy.protect(stage === "prod" || stage === "production"));
