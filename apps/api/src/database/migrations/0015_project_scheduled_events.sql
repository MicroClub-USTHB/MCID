CREATE TABLE IF NOT EXISTS "project_scheduled_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"server_id" varchar(255) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_scheduled_events_project_id_projects_id_fk' AND conrelid = 'public.project_scheduled_events'::regclass) THEN
    ALTER TABLE "project_scheduled_events" ADD CONSTRAINT "project_scheduled_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_scheduled_events_server_id_servers_id_fk' AND conrelid = 'public.project_scheduled_events'::regclass) THEN
    ALTER TABLE "project_scheduled_events" ADD CONSTRAINT "project_scheduled_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_scheduled_events_server_event" ON "project_scheduled_events" USING btree ("server_id","event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_scheduled_events_project_server" ON "project_scheduled_events" USING btree ("project_id","server_id");
