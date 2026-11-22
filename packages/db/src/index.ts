// oxlint-disable oxc/no-barrel-file -- Public server-only package entry point.
import { drizzle } from "drizzle-orm/neon-http";

// The caller supplies a server-only URL. No connection at import time.
export const createDb = (databaseUrl: string) => drizzle(databaseUrl);
export type Database = ReturnType<typeof createDb>;
export * from "./schema";
