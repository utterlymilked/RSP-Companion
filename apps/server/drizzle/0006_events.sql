CREATE TYPE "public"."event_kind" AS ENUM('training', 'match', 'club_event');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'postponed', 'cancelled', 'played');--> statement-breakpoint
CREATE TYPE "public"."home_away" AS ENUM('home', 'away');--> statement-breakpoint
CREATE TYPE "public"."match_format" AS ENUM('fut3', 'fut4', 'fut7', 'fut11');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('friendly', 'league', 'cup');--> statement-breakpoint
CREATE TABLE "event_matches" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"match_type" "match_type" NOT NULL,
	"competition" text,
	"round" text,
	"format" "match_format",
	"opponent" text NOT NULL,
	"home_away" "home_away" NOT NULL,
	"kit" text,
	"transport" text,
	"medical_cover" text
);
--> statement-breakpoint
CREATE TABLE "event_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"every_weeks" smallint NOT NULL,
	"until_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "event_kind" NOT NULL,
	"team_id" uuid,
	"series_id" uuid,
	"booking_id" uuid,
	"venue_id" uuid,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_booking_key" UNIQUE("booking_id"),
	CONSTRAINT "events_ends_after_start" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "event_matches" ADD CONSTRAINT "event_matches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_event_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."event_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_team_starts_idx" ON "events" USING btree ("team_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_series_idx" ON "events" USING btree ("series_id");