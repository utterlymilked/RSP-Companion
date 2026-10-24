CREATE TYPE "public"."approval_status" AS ENUM('pending', 'needs_info', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."approval_type" AS ENUM('test');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'approval.decided' BEFORE 'settings.change';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'hr' BEFORE 'anonymous';--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "approval_type" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"subject_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewer_user_id" uuid,
	"reason" text,
	"decided_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athletes" DROP CONSTRAINT "athletes_display_name";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "full_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "current_club" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "social_url" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "positions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "birthplace" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "dominant_foot" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "own_phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "own_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nif" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_status_created_idx" ON "approval_requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospects_person_idx" ON "prospects" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "prospects_nif_idx" ON "prospects" USING btree ("nif");--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_display_name" CHECK (char_length(btrim("athletes"."display_name")) between 2 and 80 and "athletes"."display_name" !~ '^[ .''’-]*$');