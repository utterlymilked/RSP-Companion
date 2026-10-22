ALTER TYPE "public"."event_kind" ADD VALUE 'meeting';--> statement-breakpoint
ALTER TYPE "public"."event_kind" ADD VALUE 'formation';--> statement-breakpoint
ALTER TYPE "public"."event_kind" ADD VALUE 'game_analysis';--> statement-breakpoint
CREATE TABLE "event_invitees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"department_id" uuid,
	"team_id" uuid,
	"user_id" uuid,
	CONSTRAINT "event_invitees_one_target" CHECK (("event_invitees"."department_id" is not null)::int + ("event_invitees"."team_id" is not null)::int + ("event_invitees"."user_id" is not null)::int = 1)
);
--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "source" text DEFAULT 'scout' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_invitees_event_idx" ON "event_invitees" USING btree ("event_id");