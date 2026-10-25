-- ADR 0024 step 5 (users): the owner link lives only in user_persons now. The trigger kept it in
-- step with users.person_id; copy anything it missed, then drop the trigger and the column.
INSERT INTO "user_persons" ("user_id", "person_id", "relationship", "status", "approved_at")
SELECT u."id", u."person_id", 'owner', 'approved', now() FROM "users" u
WHERE u."person_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "user_persons" up WHERE up."user_id" = u."id" AND up."person_id" = u."person_id")
  AND NOT EXISTS (SELECT 1 FROM "user_persons" up WHERE up."user_id" = u."id" AND up."relationship" = 'owner' AND up."status" <> 'revoked');--> statement-breakpoint
DROP TRIGGER "users_sync_person" ON "users";--> statement-breakpoint
DROP FUNCTION "sync_user_person"();--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_person_key";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_person_id_persons_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "person_id";
