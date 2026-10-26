CREATE INDEX IF NOT EXISTS "idx_inbound_webhook_submissions_received" ON "inbound_webhook_submissions" USING btree ("received_at");
