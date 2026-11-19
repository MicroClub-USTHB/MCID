CREATE TABLE IF NOT EXISTS "project_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"response_status" integer,
	"response_headers" jsonb,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_idempotency_keys_project_id_projects_id_fk' AND conrelid = 'public.project_idempotency_keys'::regclass) THEN
    ALTER TABLE "project_idempotency_keys" ADD CONSTRAINT "project_idempotency_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_idempotency_keys_project_key" ON "project_idempotency_keys" USING btree ("project_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_idempotency_keys_expires_at" ON "project_idempotency_keys" USING btree ("expires_at");
