ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp(3) with time zone USING "access_token_expires_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp(3) with time zone USING "refresh_token_expires_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3) with time zone USING "updated_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp(3) with time zone USING "expires_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3) with time zone USING "updated_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3) with time zone USING "updated_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expires_at" SET DATA TYPE timestamp(3) with time zone USING "expires_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3) with time zone USING "updated_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "product_schedules" ALTER COLUMN "next_check_at" SET DATA TYPE timestamp(3) with time zone USING "next_check_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "product_schedules" ALTER COLUMN "lease_expires_at" SET DATA TYPE timestamp(3) with time zone USING "lease_expires_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "trackings" ALTER COLUMN "starts_at" SET DATA TYPE timestamp(3) with time zone USING "starts_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "trackings" ALTER COLUMN "ends_at" SET DATA TYPE timestamp(3) with time zone USING "ends_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "trackings" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "extraction_attempts" ALTER COLUMN "started_at" SET DATA TYPE timestamp(3) with time zone USING "started_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "extraction_attempts" ALTER COLUMN "finished_at" SET DATA TYPE timestamp(3) with time zone USING "finished_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_checks" ALTER COLUMN "scheduled_at" SET DATA TYPE timestamp(3) with time zone USING "scheduled_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_checks" ALTER COLUMN "started_at" SET DATA TYPE timestamp(3) with time zone USING "started_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_checks" ALTER COLUMN "finished_at" SET DATA TYPE timestamp(3) with time zone USING "finished_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_checks" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_observations" ALTER COLUMN "observed_at" SET DATA TYPE timestamp(3) with time zone USING "observed_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "price_observations" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3) with time zone USING "created_at"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_identity_key_check", ADD CONSTRAINT "products_identity_key_check" CHECK ("identity_key" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_url_length_check", ADD CONSTRAINT "products_url_length_check" CHECK (length("url") between 1 and 4096);--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_context_check", ADD CONSTRAINT "products_context_check" CHECK (jsonb_typeof("context") = 'object');--> statement-breakpoint
ALTER TABLE "product_schedules" DROP CONSTRAINT "product_schedules_interval_check", ADD CONSTRAINT "product_schedules_interval_check" CHECK ("interval_seconds" between 60 and 31536000);--> statement-breakpoint
ALTER TABLE "product_schedules" DROP CONSTRAINT "product_schedules_lease_check", ADD CONSTRAINT "product_schedules_lease_check" CHECK (("lease_token" is null) = ("lease_expires_at" is null));--> statement-breakpoint
ALTER TABLE "trackings" DROP CONSTRAINT "trackings_interval_check", ADD CONSTRAINT "trackings_interval_check" CHECK ("interval_seconds" between 60 and 31536000);--> statement-breakpoint
ALTER TABLE "trackings" DROP CONSTRAINT "trackings_period_check", ADD CONSTRAINT "trackings_period_check" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "extraction_attempts" DROP CONSTRAINT "extraction_attempts_number_check", ADD CONSTRAINT "extraction_attempts_number_check" CHECK ("attempt_number" > 0);--> statement-breakpoint
ALTER TABLE "extraction_attempts" DROP CONSTRAINT "extraction_attempts_provider_check", ADD CONSTRAINT "extraction_attempts_provider_check" CHECK ("provider" = 'zyte');--> statement-breakpoint
ALTER TABLE "extraction_attempts" DROP CONSTRAINT "extraction_attempts_duration_check", ADD CONSTRAINT "extraction_attempts_duration_check" CHECK ("duration_ms" >= 0);--> statement-breakpoint
ALTER TABLE "extraction_attempts" DROP CONSTRAINT "extraction_attempts_state_check", ADD CONSTRAINT "extraction_attempts_state_check" CHECK (
    ("status" = 'running' and "finished_at" is null and "duration_ms" is null and "result" is null)
    or ("status" in ('succeeded', 'failed') and "finished_at" is not null and "duration_ms" is not null and "result" is not null
      and ("result"->>'version') = '1'
      and (("status" = 'succeeded' and "result"->>'status' = 'success') or ("status" = 'failed' and "result"->>'status' = 'error')))
  );--> statement-breakpoint
ALTER TABLE "price_checks" DROP CONSTRAINT "price_checks_state_check", ADD CONSTRAINT "price_checks_state_check" CHECK (
    ("status" = 'pending' and "started_at" is null and "finished_at" is null and "observation_id" is null and "error" is null)
    or ("status" = 'running' and "workflow_id" is not null and "started_at" is not null and "finished_at" is null and "observation_id" is null and "error" is null)
    or ("status" = 'succeeded' and "finished_at" is not null and "observation_id" is not null and "error" is null)
    or ("status" = 'failed' and "finished_at" is not null and "observation_id" is null and "error" is not null)
    or ("status" = 'cancelled' and "finished_at" is not null and "observation_id" is null and "error" is null)
  );--> statement-breakpoint
ALTER TABLE "price_observations" DROP CONSTRAINT "price_observations_amount_check", ADD CONSTRAINT "price_observations_amount_check" CHECK ("amount"::text ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$');--> statement-breakpoint
ALTER TABLE "price_observations" DROP CONSTRAINT "price_observations_currency_check", ADD CONSTRAINT "price_observations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "price_observations" DROP CONSTRAINT "price_observations_provider_check", ADD CONSTRAINT "price_observations_provider_check" CHECK ("provider" = 'zyte');