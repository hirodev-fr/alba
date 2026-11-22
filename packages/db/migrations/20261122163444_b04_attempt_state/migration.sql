ALTER TABLE "extraction_attempts" DROP CONSTRAINT "extraction_attempts_state_check", ADD CONSTRAINT "extraction_attempts_state_check" CHECK (
    (("status" = 'running' and "finished_at" is null and "duration_ms" is null and "result" is null)
    or ("status" in ('succeeded', 'failed') and "finished_at" is not null and "duration_ms" is not null and "result" is not null
      and ("result"->>'version') = '1'
      and (("status" = 'succeeded' and "result"->>'status' = 'success') or ("status" = 'failed' and "result"->>'status' = 'error')))) is true
  );