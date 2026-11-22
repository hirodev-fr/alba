import type { OfferContext } from "@alba/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    // Offer identity supplied by product creation, implemented with the business API in B10.
    identityKey: varchar("identity_key", { length: 64 }).notNull().unique(),
    url: text("url").notNull(),
    context: jsonb("context").$type<OfferContext>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "products_identity_key_check",
      sql`${table.identityKey} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "products_url_length_check",
      sql`length(${table.url}) between 1 and 4096`
    ),
    check(
      "products_context_check",
      sql`jsonb_typeof(${table.context}) = 'object'`
    ),
  ]
);
