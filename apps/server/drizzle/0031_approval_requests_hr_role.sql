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
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_status_created_idx" ON "approval_requests" USING btree ("status","created_at");
