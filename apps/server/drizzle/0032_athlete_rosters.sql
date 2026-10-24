-- ADR 0024 step 4b: rosters point at the athlete. Expand: add athlete_id, backfill it, and keep
-- it filled from person_id by a trigger so every existing writer keeps working until step 5.
ALTER TABLE "class_members" ADD COLUMN "athlete_id" uuid;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "athlete_id" uuid;--> statement-breakpoint
-- The athlete of a person: the existing one, or a new club athlete named like the person.
CREATE FUNCTION "ensure_person_athlete"(pid uuid) RETURNS uuid AS $$
DECLARE
  aid uuid;
  nm text;
  dob date;
BEGIN
  SELECT "id" INTO aid FROM "athletes" WHERE "person_id" = pid;
  IF aid IS NOT NULL THEN RETURN aid; END IF;
  SELECT left(btrim(regexp_replace("full_name", '[<>{}()\[\]@#$%^&*+=|\\/~`"!?:;,_]', '', 'g')), 160), "birth_date"
    INTO nm, dob FROM "persons" WHERE "id" = pid;
  IF nm IS NULL OR char_length(nm) < 2 OR nm ~ '^[ .''’-]*$' THEN
    nm := 'Atleta ' || upper(substr(replace(pid::text, '-', ''), 1, 8));
  END IF;
  INSERT INTO "athletes" ("display_name", "person_id", "source") VALUES (nm, pid, 'club') RETURNING "id" INTO aid;
  INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source") VALUES (aid, 'name', nm, 'legacy_sync');
  IF dob IS NOT NULL THEN
    INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_date", "precision", "source") VALUES (aid, 'date_of_birth', dob, 'day', 'legacy_sync');
  END IF;
  RETURN aid;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "roster_fill_athlete"() RETURNS trigger AS $$
BEGIN
  IF NEW."athlete_id" IS NULL THEN
    NEW."athlete_id" := "ensure_person_athlete"(NEW."person_id");
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "class_members_fill_athlete" BEFORE INSERT OR UPDATE OF "person_id" ON "class_members"
  FOR EACH ROW EXECUTE FUNCTION "roster_fill_athlete"();--> statement-breakpoint
CREATE TRIGGER "team_members_fill_athlete" BEFORE INSERT OR UPDATE OF "person_id" ON "team_members"
  FOR EACH ROW EXECUTE FUNCTION "roster_fill_athlete"();--> statement-breakpoint
-- Backfill: the trigger fires on the no-op person_id update and creates missing athletes.
UPDATE "class_members" SET "athlete_id" = NULL, "person_id" = "person_id";--> statement-breakpoint
UPDATE "team_members" SET "athlete_id" = NULL, "person_id" = "person_id";--> statement-breakpoint
ALTER TABLE "class_members" ALTER COLUMN "athlete_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "athlete_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_members_athlete_idx" ON "class_members" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "team_members_athlete_idx" ON "team_members" USING btree ("athlete_id");
