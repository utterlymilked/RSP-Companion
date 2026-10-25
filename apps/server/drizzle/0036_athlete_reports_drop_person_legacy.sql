-- ADR 0024 step 5 (persons): NIF, federation licence, email and phone live only in
-- person_identities and contacts now. The dual-write trigger kept them in step; copy anything it
-- could not (a duplicate NIF, a value set before the trigger existed) and then drop the columns.
INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
SELECT p."id", 'nif', p."nif", upper(regexp_replace(p."nif", '[^[:alnum:]]', '', 'g')), 'legacy_sync'
FROM "persons" p
WHERE p."nif" IS NOT NULL AND regexp_replace(p."nif", '[^[:alnum:]]', '', 'g') <> ''
  AND NOT EXISTS (SELECT 1 FROM "person_identities" i WHERE i."person_id" = p."id" AND i."type" = 'nif')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
SELECT p."id", 'fpf_licence', p."federation_id", upper(regexp_replace(p."federation_id", '[^[:alnum:]]', '', 'g')), 'legacy_sync'
FROM "persons" p
WHERE p."federation_id" IS NOT NULL AND regexp_replace(p."federation_id", '[^[:alnum:]]', '', 'g') <> ''
  AND NOT EXISTS (SELECT 1 FROM "person_identities" i WHERE i."person_id" = p."id" AND i."type" = 'fpf_licence')
ON CONFLICT DO NOTHING;--> statement-breakpoint
DO $$
DECLARE r record; c uuid;
BEGIN
  FOR r IN
    SELECT p."id" AS pid, k.kind, k.val FROM "persons" p
    CROSS JOIN LATERAL (VALUES ('email'::"contact_kind", p."email"), ('phone'::"contact_kind", p."phone")) AS k(kind, val)
    WHERE btrim(coalesce(k.val, '')) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "person_contact_links" l JOIN "contacts" x ON x."id" = l."contact_id"
        WHERE l."person_id" = p."id" AND x."kind" = k.kind AND l."valid_to" IS NULL AND l."label" = 'own')
  LOOP
    INSERT INTO "contacts" ("kind", "value", "source") VALUES (r.kind, btrim(r.val), 'legacy_sync') RETURNING "id" INTO c;
    INSERT INTO "person_contact_links" ("person_id", "contact_id", "is_primary") VALUES (r.pid, c, true);
  END LOOP;
END $$;--> statement-breakpoint
-- The trigger only still has to give a new person its rsc_code identity.
DROP TRIGGER "persons_sync_legacy" ON "persons";--> statement-breakpoint
DROP FUNCTION "sync_person_legacy"();--> statement-breakpoint
DROP FUNCTION "sync_person_contact"(uuid, "contact_kind", text);--> statement-breakpoint
CREATE FUNCTION "give_person_rsc_code"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
  VALUES (NEW."id", 'rsc_code', NEW."identity_code", upper(NEW."identity_code"), 'legacy_sync') ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "persons_give_rsc_code" AFTER INSERT ON "persons"
  FOR EACH ROW EXECUTE FUNCTION "give_person_rsc_code"();--> statement-breakpoint
-- Reports belong to every athlete, scouted or in the club (same ids as the old prospects).
ALTER TABLE "prospect_reports" DROP CONSTRAINT "prospect_reports_prospect_id_prospects_id_fk";
--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD CONSTRAINT "prospect_reports_prospect_id_athletes_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Evaluations are keyed by athlete; the person behind them is optional.
ALTER TABLE "evaluations" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" DROP CONSTRAINT "persons_federationId_unique";--> statement-breakpoint
ALTER TABLE "persons" DROP CONSTRAINT "persons_nif_unique";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "federation_id";--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "nif";
