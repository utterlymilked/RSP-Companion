-- ADR 0024 steps 4c and 4d: evaluations and call-ups point at the athlete. Same expand as the
-- rosters (0032): add athlete_id, backfill it, and keep it filled from person_id by trigger.
ALTER TABLE "evaluations" ADD COLUMN "athlete_id" uuid;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "athlete_id" uuid;--> statement-breakpoint
CREATE TRIGGER "evaluations_fill_athlete" BEFORE INSERT OR UPDATE OF "person_id" ON "evaluations"
  FOR EACH ROW EXECUTE FUNCTION "roster_fill_athlete"();--> statement-breakpoint
CREATE TRIGGER "event_participants_fill_athlete" BEFORE INSERT OR UPDATE OF "person_id" ON "event_participants"
  FOR EACH ROW EXECUTE FUNCTION "roster_fill_athlete"();--> statement-breakpoint
UPDATE "evaluations" SET "athlete_id" = NULL, "person_id" = "person_id";--> statement-breakpoint
UPDATE "event_participants" SET "athlete_id" = NULL, "person_id" = "person_id";--> statement-breakpoint
ALTER TABLE "evaluations" ALTER COLUMN "athlete_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event_participants" ALTER COLUMN "athlete_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluations_athlete_idx" ON "evaluations" USING btree ("athlete_id","evaluated_on");--> statement-breakpoint
CREATE INDEX "event_participants_athlete_idx" ON "event_participants" USING btree ("athlete_id");
