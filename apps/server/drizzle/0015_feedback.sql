CREATE TYPE "public"."feedback_kind" AS ENUM('bug', 'idea', 'question');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'seen', 'done');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'tester';--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid,
	"kind" "feedback_kind" DEFAULT 'bug' NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"message" text NOT NULL,
	"route" text NOT NULL,
	"screen_title" text,
	"platform" text NOT NULL,
	"app_version" text,
	"viewport_width" integer NOT NULL,
	"viewport_height" integer NOT NULL,
	"position" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_created_idx" ON "feedback" USING btree ("status","created_at");