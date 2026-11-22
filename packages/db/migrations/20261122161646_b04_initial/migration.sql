CREATE TYPE "public"."tracking_status" AS ENUM('active', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."extraction_attempt_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('in_stock', 'out_of_stock', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."price_check_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."extraction_mode" AS ENUM('http', 'browser');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3) with time zone,
	"refresh_token_expires_at" timestamp (3) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_identity_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"identity_key" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_identity_key_unique" UNIQUE("identity_key"),
	CONSTRAINT "products_identity_key_check" CHECK ("products"."identity_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "products_url_length_check" CHECK (length("products"."url") between 1 and 4096),
	CONSTRAINT "products_context_check" CHECK (jsonb_typeof("products"."context") = 'object')
);
--> statement-breakpoint
CREATE TABLE "product_schedules" (
	"product_id" varchar(128) PRIMARY KEY NOT NULL,
	"next_check_at" timestamp (3) with time zone NOT NULL,
	"interval_seconds" integer NOT NULL,
	"lease_token" varchar(128),
	"lease_expires_at" timestamp (3) with time zone,
	CONSTRAINT "product_schedules_interval_check" CHECK ("product_schedules"."interval_seconds" between 60 and 31536000),
	CONSTRAINT "product_schedules_lease_check" CHECK (("product_schedules"."lease_token" is null) = ("product_schedules"."lease_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "trackings" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"interval_seconds" integer NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"status" "tracking_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trackings_interval_check" CHECK ("trackings"."interval_seconds" between 60 and 31536000),
	CONSTRAINT "trackings_period_check" CHECK ("trackings"."ends_at" > "trackings"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "extraction_attempts" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"check_id" varchar(128) NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text DEFAULT 'zyte' NOT NULL,
	"mode" "extraction_mode" NOT NULL,
	"status" "extraction_attempt_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	"duration_ms" integer,
	"result" jsonb,
	CONSTRAINT "extraction_attempts_check_number_unique" UNIQUE("check_id","attempt_number"),
	CONSTRAINT "extraction_attempts_number_check" CHECK ("extraction_attempts"."attempt_number" > 0),
	CONSTRAINT "extraction_attempts_provider_check" CHECK ("extraction_attempts"."provider" = 'zyte'),
	CONSTRAINT "extraction_attempts_duration_check" CHECK ("extraction_attempts"."duration_ms" >= 0),
	CONSTRAINT "extraction_attempts_state_check" CHECK (
    ("extraction_attempts"."status" = 'running' and "extraction_attempts"."finished_at" is null and "extraction_attempts"."duration_ms" is null and "extraction_attempts"."result" is null)
    or ("extraction_attempts"."status" in ('succeeded', 'failed') and "extraction_attempts"."finished_at" is not null and "extraction_attempts"."duration_ms" is not null and "extraction_attempts"."result" is not null
      and ("extraction_attempts"."result"->>'version') = '1'
      and (("extraction_attempts"."status" = 'succeeded' and "extraction_attempts"."result"->>'status' = 'success') or ("extraction_attempts"."status" = 'failed' and "extraction_attempts"."result"->>'status' = 'error')))
  )
);
--> statement-breakpoint
CREATE TABLE "price_checks" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"scheduled_at" timestamp (3) with time zone NOT NULL,
	"workflow_id" varchar(128),
	"status" "price_check_status" DEFAULT 'pending' NOT NULL,
	"request" jsonb,
	"started_at" timestamp (3) with time zone,
	"finished_at" timestamp (3) with time zone,
	"observation_id" varchar(128),
	"error" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_checks_workflow_id_unique" UNIQUE("workflow_id"),
	CONSTRAINT "price_checks_product_due_unique" UNIQUE("product_id","scheduled_at"),
	CONSTRAINT "price_checks_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "price_checks_state_check" CHECK (
    ("price_checks"."status" = 'pending' and "price_checks"."started_at" is null and "price_checks"."finished_at" is null and "price_checks"."observation_id" is null and "price_checks"."error" is null)
    or ("price_checks"."status" = 'running' and "price_checks"."workflow_id" is not null and "price_checks"."started_at" is not null and "price_checks"."finished_at" is null and "price_checks"."observation_id" is null and "price_checks"."error" is null)
    or ("price_checks"."status" = 'succeeded' and "price_checks"."finished_at" is not null and "price_checks"."observation_id" is not null and "price_checks"."error" is null)
    or ("price_checks"."status" = 'failed' and "price_checks"."finished_at" is not null and "price_checks"."observation_id" is null and "price_checks"."error" is not null)
    or ("price_checks"."status" = 'cancelled' and "price_checks"."finished_at" is not null and "price_checks"."observation_id" is null and "price_checks"."error" is null)
  )
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"check_id" varchar(128) NOT NULL,
	"amount" numeric NOT NULL,
	"currency" varchar(3) NOT NULL,
	"availability" "availability" NOT NULL,
	"title" text,
	"observed_at" timestamp (3) with time zone NOT NULL,
	"source_url" text NOT NULL,
	"provider" text DEFAULT 'zyte' NOT NULL,
	"mode" "extraction_mode" NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_observations_check_id_unique" UNIQUE("check_id"),
	CONSTRAINT "price_observations_id_check_unique" UNIQUE("id","check_id"),
	CONSTRAINT "price_observations_amount_check" CHECK ("price_observations"."amount"::text ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$'),
	CONSTRAINT "price_observations_currency_check" CHECK ("price_observations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "price_observations_provider_check" CHECK ("price_observations"."provider" = 'zyte')
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackings" ADD CONSTRAINT "trackings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackings" ADD CONSTRAINT "trackings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_attempts" ADD CONSTRAINT "extraction_attempts_check_id_price_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."price_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_checks" ADD CONSTRAINT "price_checks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_checks" ADD CONSTRAINT "price_checks_observation_check_fk" FOREIGN KEY ("observation_id","id") REFERENCES "public"."price_observations"("id","check_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_check_product_fk" FOREIGN KEY ("check_id","product_id") REFERENCES "public"."price_checks"("id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "product_schedules_due_idx" ON "product_schedules" USING btree ("next_check_at","product_id");--> statement-breakpoint
CREATE INDEX "product_schedules_lease_idx" ON "product_schedules" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "trackings_user_idx" ON "trackings" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "trackings_product_status_idx" ON "trackings" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "price_checks_status_due_idx" ON "price_checks" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "price_observations_history_idx" ON "price_observations" USING btree ("product_id","observed_at" DESC NULLS LAST,"id" DESC NULLS LAST);