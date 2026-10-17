ALTER TYPE "public"."audit_action" ADD VALUE 'settings.change';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'booking';--> statement-breakpoint
CREATE TABLE "club_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
