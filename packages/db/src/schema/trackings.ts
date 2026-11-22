import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { products } from "./products";

export const trackingStatus = pgEnum("tracking_status", [
  "active",
  "paused",
  "cancelled",
  "expired",
]);

export const trackings = pgTable(
  "trackings",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 128 })
      .notNull()
      .references(() => products.id),
    intervalSeconds: integer("interval_seconds").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    status: trackingStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trackings_user_idx").on(table.userId, table.createdAt, table.id),
    index("trackings_product_status_idx").on(table.productId, table.status),
    check(
      "trackings_interval_check",
      sql`${table.intervalSeconds} between 60 and 31536000`
    ),
    check("trackings_period_check", sql`${table.endsAt} > ${table.startsAt}`),
  ]
);

export const productSchedules = pgTable(
  "product_schedules",
  {
    productId: varchar("product_id", { length: 128 })
      .primaryKey()
      .references(() => products.id),
    nextCheckAt: timestamp("next_check_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    intervalSeconds: integer("interval_seconds").notNull(),
    leaseToken: varchar("lease_token", { length: 128 }),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    index("product_schedules_due_idx").on(table.nextCheckAt, table.productId),
    index("product_schedules_lease_idx").on(table.leaseExpiresAt),
    check(
      "product_schedules_interval_check",
      sql`${table.intervalSeconds} between 60 and 31536000`
    ),
    check(
      "product_schedules_lease_check",
      sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`
    ),
  ]
);
