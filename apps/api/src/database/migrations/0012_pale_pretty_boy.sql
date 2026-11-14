CREATE TABLE IF NOT EXISTS "project_created_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"role_id" varchar(255) NOT NULL,
	"server_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_created_roles_project_id_projects_id_fk' AND conrelid = 'public.project_created_roles'::regclass) THEN
    ALTER TABLE "project_created_roles" ADD CONSTRAINT "project_created_roles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_created_roles_role_id_roles_id_fk' AND conrelid = 'public.project_created_roles'::regclass) THEN
    ALTER TABLE "project_created_roles" ADD CONSTRAINT "project_created_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_created_roles_server_id_servers_id_fk' AND conrelid = 'public.project_created_roles'::regclass) THEN
    ALTER TABLE "project_created_roles" ADD CONSTRAINT "project_created_roles_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_project_created_roles_project_role" ON "project_created_roles" USING btree ("project_id","role_id");
