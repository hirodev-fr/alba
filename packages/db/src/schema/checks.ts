import type {
  ExtractionError,
  ExtractionRequestV1,
  ExtractionResultV1,
} from "@alba/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { products } from "./products";

export const checkStatus = pgEnum("price_check_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const extractionMode = pgEnum("extraction_mode", ["http", "browser"]);
export const attemptStatus = pgEnum("extraction_attempt_status", [
  "running",
  "succeeded",
  "failed",
]);
export const availability = pgEnum("availability", [
  "in_stock",
  "out_of_stock",
  "unknown",
]);

export const priceChecks = pgTable(
  "price_checks",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    productId: varchar("product_id", { length: 128 })
      .notNull()
      .references(() => products.id),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    workflowId: varchar("workflow_id", { length: 128 }).unique(),
    status: checkStatus("status").notNull().default("pending"),
    request: jsonb("request").$type<ExtractionRequestV1>(),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }),
    finishedAt: timestamp("finished_at", { withTimezone: true, precision: 3 }),
    observationId: varchar("observation_id", { length: 128 }),
    error: jsonb("error").$type<ExtractionError>(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: "price_checks_observation_check_fk",
      columns: [table.observationId, table.id],
      foreignColumns: [priceObservations.id, priceObservations.checkId],
    }),
    unique("price_checks_product_due_unique").on(
      table.productId,
      table.scheduledAt
    ),
    unique("price_checks_id_product_unique").on(table.id, table.productId),
    index("price_checks_status_due_idx").on(table.status, table.scheduledAt),
    check(
      "price_checks_state_check",
      sql`
    (${table.status} = 'pending' and ${table.startedAt} is null and ${table.finishedAt} is null and ${table.observationId} is null and ${table.error} is null)
    or (${table.status} = 'running' and ${table.workflowId} is not null and ${table.startedAt} is not null and ${table.finishedAt} is null and ${table.observationId} is null and ${table.error} is null)
    or (${table.status} = 'succeeded' and ${table.finishedAt} is not null and ${table.observationId} is not null and ${table.error} is null)
    or (${table.status} = 'failed' and ${table.finishedAt} is not null and ${table.observationId} is null and ${table.error} is not null)
    or (${table.status} = 'cancelled' and ${table.finishedAt} is not null and ${table.observationId} is null and ${table.error} is null)
  `
    ),
  ]
);

export const extractionAttempts = pgTable(
  "extraction_attempts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    checkId: varchar("check_id", { length: 128 })
      .notNull()
      .references(() => priceChecks.id),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull().default("zyte"),
    mode: extractionMode("mode").notNull(),
    status: attemptStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, precision: 3 }),
    durationMs: integer("duration_ms"),
    result: jsonb("result").$type<ExtractionResultV1>(),
  },
  (table) => [
    unique("extraction_attempts_check_number_unique").on(
      table.checkId,
      table.attemptNumber
    ),
    check("extraction_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check(
      "extraction_attempts_provider_check",
      sql`${table.provider} = 'zyte'`
    ),
    check("extraction_attempts_duration_check", sql`${table.durationMs} >= 0`),
    check(
      "extraction_attempts_state_check",
      sql`
    ((${table.status} = 'running' and ${table.finishedAt} is null and ${table.durationMs} is null and ${table.result} is null)
    or (${table.status} in ('succeeded', 'failed') and ${table.finishedAt} is not null and ${table.durationMs} is not null and ${table.result} is not null
      and (${table.result}->>'version') = '1'
      and ((${table.status} = 'succeeded' and ${table.result}->>'status' = 'success') or (${table.status} = 'failed' and ${table.result}->>'status' = 'error')))) is true
  `
    ),
  ]
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    productId: varchar("product_id", { length: 128 })
      .notNull()
      .references(() => products.id),
    checkId: varchar("check_id", { length: 128 }).notNull().unique(),
    // Unconstrained numeric preserves B03 precision and scale without rounding.
    amount: numeric("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    availability: availability("availability").notNull(),
    title: text("title"),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    sourceUrl: text("source_url").notNull(),
    provider: text("provider").notNull().default("zyte"),
    mode: extractionMode("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "price_observations_check_product_fk",
      columns: [table.checkId, table.productId],
      foreignColumns: [priceChecks.id, priceChecks.productId],
    }),
    unique("price_observations_id_check_unique").on(table.id, table.checkId),
    index("price_observations_history_idx").on(
      table.productId,
      table.observedAt.desc(),
      table.id.desc()
    ),
    check(
      "price_observations_amount_check",
      sql`${table.amount}::text ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$'`
    ),
    check(
      "price_observations_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check("price_observations_provider_check", sql`${table.provider} = 'zyte'`),
  ]
);
