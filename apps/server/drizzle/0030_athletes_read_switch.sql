ALTER TABLE "athletes" DROP CONSTRAINT "athletes_display_name";--> statement-breakpoint
-- ADR 0024 step 4: scouting reads and writes identity facts on the athlete. Finish the copy
-- (names the old rule rejected, NIFs), then stop mirroring prospects and drop the old columns.
-- A person link held by a second prospect of the same person was already left out of
-- athletes (one athlete per person), so it is not carried over.
UPDATE "athletes" a SET "display_name" = left(btrim(regexp_replace(p."full_name", '[<>{}()\[\]@#$%^&*+=|\\/~`"!?:;,_]', '', 'g')), 160)
FROM "prospects" p
WHERE p."id" = a."id" AND a."display_name" LIKE 'Atleta %'
  AND char_length(btrim(regexp_replace(p."full_name", '[<>{}()\[\]@#$%^&*+=|\\/~`"!?:;,_]', '', 'g'))) >= 2
  AND btrim(regexp_replace(p."full_name", '[<>{}()\[\]@#$%^&*+=|\\/~`"!?:;,_]', '', 'g')) !~ '^[ .''’-]*$';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source")
SELECT a."id", 'name', a."display_name", 'legacy_sync' FROM "athletes" a
JOIN "prospects" p ON p."id" = a."id"
WHERE a."display_name" = left(btrim(regexp_replace(p."full_name", '[<>{}()\[\]@#$%^&*+=|\\/~`"!?:;,_]', '', 'g')), 160)
  AND NOT EXISTS (SELECT 1 FROM "athlete_attributes" x WHERE x."athlete_id" = a."id" AND x."type" = 'name' AND x."valid_to" IS NULL);--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source")
SELECT p."id", 'nif', btrim(p."nif"), 'legacy_sync' FROM "prospects" p
WHERE btrim(coalesce(p."nif", '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM "athlete_attributes" x WHERE x."athlete_id" = p."id" AND x."type" = 'nif' AND x."valid_to" IS NULL);--> statement-breakpoint
DROP TRIGGER "prospects_sync_athlete" ON "prospects";--> statement-breakpoint
DROP FUNCTION "sync_prospect_athlete"();--> statement-breakpoint
DROP FUNCTION "sync_athlete_contact"(uuid, "contact_kind", text, text);--> statement-breakpoint
DROP FUNCTION "set_athlete_attr"(uuid, text, text, numeric, date, text);--> statement-breakpoint
ALTER TABLE "prospects" DROP CONSTRAINT "prospects_person_id_persons_id_fk";
--> statement-breakpoint
DROP INDEX "prospects_person_idx";--> statement-breakpoint
DROP INDEX "prospects_nif_idx";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "full_name";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "birth_year";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "current_club";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "position";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "birth_date";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "guardian_phone";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "guardian_email";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "social_url";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "positions";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "height_cm";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "nationality";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "birthplace";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "nickname";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "dominant_foot";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "own_phone";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "own_email";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "media_url";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "nif";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "person_id";--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_display_name" CHECK (char_length(btrim("athletes"."display_name")) between 2 and 160 and "athletes"."display_name" !~ '^[ .''’-]*$');