-- ADR 0027: a role is a capability; the teams a coach or team manager works with are staff
-- assignments of their person. Keep what the old rows said, then drop the team and class columns.
-- 1. A login with a scoped role and no person gets one (named after the login), linked as owner.
DO $$
DECLARE r record; p uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT u."id", u."name" FROM "users" u
    JOIN "role_assignments" ra ON ra."user_id" = u."id" AND ra."role" IN ('coach', 'team_manager')
    WHERE NOT EXISTS (
      SELECT 1 FROM "user_persons" up
      WHERE up."user_id" = u."id" AND up."relationship" = 'owner' AND up."status" <> 'revoked')
  LOOP
    INSERT INTO "persons" ("full_name", "source") VALUES (r."name", 'legacy_sync') RETURNING "id" INTO p;
    INSERT INTO "user_persons" ("user_id", "person_id", "relationship", "status", "approved_at")
    VALUES (r."id", p, 'owner', 'approved', now());
  END LOOP;
END $$;--> statement-breakpoint
-- 2. Each scoped role row becomes a staff assignment of the login's person, in the season of its
--    team or class, unless an equivalent one exists.
INSERT INTO "staff_assignments" ("person_id", "season_id", "function", "organisation_id", "team_id", "class_id")
SELECT DISTINCT up."person_id", COALESCE(t."season_id", c."season_id"),
  CASE ra."role" WHEN 'coach' THEN 'head_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END,
  COALESCE(t."organisation_id", c."organisation_id"), ra."team_id", ra."class_id"
FROM "role_assignments" ra
JOIN "user_persons" up ON up."user_id" = ra."user_id" AND up."relationship" = 'owner' AND up."status" <> 'revoked'
LEFT JOIN "teams" t ON t."id" = ra."team_id"
LEFT JOIN "classes" c ON c."id" = ra."class_id"
WHERE ra."role" IN ('coach', 'team_manager') AND (ra."team_id" IS NOT NULL OR ra."class_id" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "staff_assignments" sa
    WHERE sa."person_id" = up."person_id"
      AND sa."team_id" IS NOT DISTINCT FROM ra."team_id" AND sa."class_id" IS NOT DISTINCT FROM ra."class_id"
      AND sa."function" IN (
        CASE ra."role" WHEN 'coach' THEN 'head_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END,
        CASE ra."role" WHEN 'coach' THEN 'assistant_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END,
        CASE ra."role" WHEN 'coach' THEN 'goalkeeper_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END,
        CASE ra."role" WHEN 'coach' THEN 'fitness_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END));--> statement-breakpoint
-- 3. Pending invitations that name a person get the same assignments; their roles lose the scope.
INSERT INTO "staff_assignments" ("person_id", "season_id", "function", "organisation_id", "team_id", "class_id")
SELECT DISTINCT i."person_id", COALESCE(t."season_id", c."season_id"),
  CASE e.value ->> 'role' WHEN 'coach' THEN 'head_coach'::"staff_function" ELSE 'team_manager'::"staff_function" END,
  COALESCE(t."organisation_id", c."organisation_id"), t."id", c."id"
FROM "invitations" i
CROSS JOIN LATERAL jsonb_array_elements(i."roles") AS e(value)
LEFT JOIN "teams" t ON t."id" = NULLIF(e.value ->> 'teamId', '')::uuid
LEFT JOIN "classes" c ON c."id" = NULLIF(e.value ->> 'classId', '')::uuid
WHERE i."accepted_at" IS NULL AND i."person_id" IS NOT NULL
  AND e.value ->> 'role' IN ('coach', 'team_manager') AND (t."id" IS NOT NULL OR c."id" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "staff_assignments" sa
    WHERE sa."person_id" = i."person_id" AND sa."team_id" IS NOT DISTINCT FROM t."id"
      AND sa."class_id" IS NOT DISTINCT FROM c."id"
      AND sa."function" IN ('head_coach', 'assistant_coach', 'goalkeeper_coach', 'fitness_coach', 'team_manager'));--> statement-breakpoint
UPDATE "invitations" SET "roles" = COALESCE(
  (SELECT jsonb_agg(DISTINCT jsonb_build_object('role', e.value ->> 'role')) FROM jsonb_array_elements("roles") AS e(value)),
  '[]'::jsonb);--> statement-breakpoint
-- 4. One row per user and role, then the columns go.
DELETE FROM "role_assignments" a USING "role_assignments" b
WHERE a."user_id" = b."user_id" AND a."role" = b."role" AND a."id" > b."id";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_grant_key";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_scope";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "role_assignments" DROP COLUMN "class_id";--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_role_key" UNIQUE("user_id","role");
