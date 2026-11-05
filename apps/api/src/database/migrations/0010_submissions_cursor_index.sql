-- Re-run on every boot: rebuild only while the index still lacks "id".
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_inbound_webhook_submissions_webhook' AND indexdef LIKE '%(webhook_id, received_at, id)') THEN
    DROP INDEX IF EXISTS "idx_inbound_webhook_submissions_webhook";
    CREATE INDEX "idx_inbound_webhook_submissions_webhook" ON "inbound_webhook_submissions" USING btree ("webhook_id","received_at","id");
  END IF;
END $$;
