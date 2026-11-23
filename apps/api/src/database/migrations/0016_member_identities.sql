CREATE TABLE "member_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar(255) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_id" varchar(255),
	"handle" varchar(255) NOT NULL,
	"verified_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_webhooks" ADD COLUMN "identity_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_identities_member_provider" ON "member_identities" USING btree ("member_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_identities_provider_handle" ON "member_identities" USING btree ("provider","handle");--> statement-breakpoint
CREATE INDEX "idx_member_identities_provider" ON "member_identities" USING btree ("provider");