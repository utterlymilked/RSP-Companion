CREATE TYPE "public"."booking_activity" AS ENUM('training', 'match', 'formation', 'game_analysis', 'meeting', 'recruitment', 'rental', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('to_confirm', 'confirmed', 'not_confirmed', 'voided', 'done', 'to_schedule', 'to_reschedule', 'postponed', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."space_kind" AS ENUM('field', 'auditorium', 'meeting_room', 'gym', 'office', 'other');--> statement-breakpoint
CREATE TYPE "public"."venue_kind" AS ENUM('home', 'external');--> statement-breakpoint
CREATE TABLE "booking_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"every_weeks" smallint NOT NULL,
	"until_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"team_id" uuid,
	"series_id" uuid,
	"activity" "booking_activity" NOT NULL,
	"status" "booking_status" DEFAULT 'to_confirm' NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"target_group" text,
	"expected_attendance" integer,
	"actual_attendance" integer,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ends_after_start" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_attendance_non_negative" CHECK (("bookings"."expected_attendance" IS NULL OR "bookings"."expected_attendance" >= 0)
        AND ("bookings"."actual_attendance" IS NULL OR "bookings"."actual_attendance" >= 0))
);
--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feeds_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "calendar_feeds_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "space_components" (
	"space_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	CONSTRAINT "space_components_space_id_component_id_pk" PRIMARY KEY("space_id","component_id"),
	CONSTRAINT "space_components_distinct" CHECK ("space_components"."space_id" <> "space_components"."component_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "space_kind" NOT NULL,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_venue_name_key" UNIQUE("venue_id","name"),
	CONSTRAINT "spaces_capacity_positive" CHECK ("spaces"."capacity" IS NULL OR "spaces"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "venue_kind" NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_components" ADD CONSTRAINT "space_components_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_components" ADD CONSTRAINT "space_components_component_id_spaces_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_space_starts_idx" ON "bookings" USING btree ("space_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_starts_idx" ON "bookings" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "bookings_series_idx" ON "bookings" USING btree ("series_id");