CREATE TABLE "evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"key_id" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"sha256" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_files_sha256_idx" ON "evidence_files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "evidence_files_expires_idx" ON "evidence_files" USING btree ("expires_at");