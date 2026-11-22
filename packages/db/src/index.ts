import { drizzle } from "drizzle-orm/neon-http";

// The caller supplies a server-only Neon connection string. No connection at import time.
export const createDb = (databaseUrl: string) => drizzle(databaseUrl);
