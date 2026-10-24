-- ADR 0024 step 3: keep athletes in step with prospects (dual write) and make erasure reach
-- contacts. Prospects remain the write path until the contract step.
CREATE FUNCTION "set_athlete_attr"(a uuid, t text, vt text, vn numeric, vd date, prec text) RETURNS void AS $$
DECLARE cur "athlete_attributes"%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM "athlete_attributes" WHERE "athlete_id" = a AND "type" = t AND "valid_to" IS NULL;
  IF vt IS NULL AND vn IS NULL AND vd IS NULL THEN
    IF FOUND THEN UPDATE "athlete_attributes" SET "valid_to" = now() WHERE "id" = cur."id"; END IF;
    RETURN;
  END IF;
  IF FOUND THEN
    IF cur."value_text" IS NOT DISTINCT FROM vt AND cur."value_num" IS NOT DISTINCT FROM vn
       AND cur."value_date" IS NOT DISTINCT FROM vd AND cur."precision" IS NOT DISTINCT FROM prec THEN RETURN; END IF;
    UPDATE "athlete_attributes" SET "valid_to" = now() WHERE "id" = cur."id";
  END IF;
  INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "value_num", "value_date", "precision", "source")
  VALUES (a, t, vt, vn, vd, prec, 'legacy_sync');
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "sync_athlete_contact"(a uuid, k "contact_kind", lbl text, v text) RETURNS void AS $$
DECLARE cur uuid; curval text; newc uuid;
BEGIN
  IF v IS NOT NULL THEN v := btrim(v); IF v = '' THEN v := NULL; END IF; END IF;
  SELECT l."id", c."value" INTO cur, curval FROM "athlete_contact_links" l
    JOIN "contacts" c ON c."id" = l."contact_id"
    WHERE l."athlete_id" = a AND c."kind" = k AND c."source" = 'legacy_sync' AND l."label" = lbl AND l."valid_to" IS NULL
    LIMIT 1;
  IF cur IS NOT NULL AND curval IS NOT DISTINCT FROM v THEN RETURN; END IF;
  IF cur IS NOT NULL THEN UPDATE "athlete_contact_links" SET "valid_to" = now() WHERE "id" = cur; END IF;
  IF v IS NOT NULL THEN
    INSERT INTO "contacts" ("kind", "value", "source") VALUES (k, v, 'legacy_sync') RETURNING "id" INTO newc;
    INSERT INTO "athlete_contact_links" ("athlete_id", "contact_id", "label", "is_primary") VALUES (a, newc, lbl, true);
  END IF;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "sync_prospect_athlete"() RETURNS trigger AS $$
DECLARE
  valid_name boolean := char_length(btrim(NEW."full_name")) BETWEEN 2 AND 80 AND NEW."full_name" !~ '^[ .''’-]*$';
  valid_nick boolean := char_length(btrim(coalesce(NEW."nickname", ''))) BETWEEN 2 AND 80 AND NEW."nickname" !~ '^[ .''’-]*$';
  pos text[];
  p text;
BEGIN
  INSERT INTO "athletes" ("id", "display_name", "person_id", "source", "retain_until", "created_by")
  VALUES (
    NEW."id",
    CASE WHEN valid_name THEN btrim(NEW."full_name") WHEN valid_nick THEN btrim(NEW."nickname") ELSE 'Atleta ' || left(NEW."id"::text, 8) END,
    CASE WHEN EXISTS (SELECT 1 FROM "athletes" x WHERE x."person_id" = NEW."person_id" AND x."id" <> NEW."id") THEN NULL ELSE NEW."person_id" END,
    CASE WHEN NEW."source" = 'request' THEN 'public_form' ELSE 'scouting' END,
    NEW."retain_until", NEW."created_by")
  ON CONFLICT ("id") DO UPDATE SET
    "display_name" = EXCLUDED."display_name", "person_id" = EXCLUDED."person_id",
    "retain_until" = EXCLUDED."retain_until", "updated_at" = now();
  PERFORM "set_athlete_attr"(NEW."id", 'name', CASE WHEN valid_name THEN btrim(NEW."full_name") END, NULL, NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'nickname', CASE WHEN valid_nick THEN btrim(NEW."nickname") END, NULL, NULL, NULL);
  IF NEW."birth_date" IS NOT NULL THEN
    PERFORM "set_athlete_attr"(NEW."id", 'date_of_birth', NULL, NULL, NEW."birth_date", 'day');
  ELSIF NEW."birth_year" BETWEEN 1900 AND 2100 THEN
    PERFORM "set_athlete_attr"(NEW."id", 'date_of_birth', NULL, NULL, make_date(NEW."birth_year", 1, 1), 'year');
  ELSE
    PERFORM "set_athlete_attr"(NEW."id", 'date_of_birth', NULL, NULL, NULL, NULL);
  END IF;
  PERFORM "set_athlete_attr"(NEW."id", 'height_cm', NULL, NEW."height_cm", NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'dominant_foot', nullif(btrim(coalesce(NEW."dominant_foot", '')), ''), NULL, NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'nationality', nullif(btrim(coalesce(NEW."nationality", '')), ''), NULL, NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'birthplace', nullif(btrim(coalesce(NEW."birthplace", '')), ''), NULL, NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'social_url', nullif(btrim(coalesce(NEW."social_url", '')), ''), NULL, NULL, NULL);
  PERFORM "set_athlete_attr"(NEW."id", 'media_url', nullif(btrim(coalesce(NEW."media_url", '')), ''), NULL, NULL, NULL);
  -- Positions are several current rows: close the ones no longer listed, add the new ones.
  SELECT coalesce(array_agg(DISTINCT btrim(x)) FILTER (WHERE btrim(x) <> ''), '{}')
    INTO pos FROM unnest(NEW."positions" || CASE WHEN NEW."position" IS NULL THEN '{}'::text[] ELSE ARRAY[NEW."position"] END) x;
  UPDATE "athlete_attributes" SET "valid_to" = now()
    WHERE "athlete_id" = NEW."id" AND "type" = 'position' AND "valid_to" IS NULL AND NOT ("value_text" = ANY (pos));
  FOREACH p IN ARRAY pos LOOP
    INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source")
    SELECT NEW."id", 'position', p, 'legacy_sync'
    WHERE NOT EXISTS (SELECT 1 FROM "athlete_attributes" WHERE "athlete_id" = NEW."id" AND "type" = 'position' AND "value_text" = p AND "valid_to" IS NULL);
  END LOOP;
  -- Current club.
  IF nullif(btrim(coalesce(NEW."current_club", '')), '') IS NULL THEN
    UPDATE "athlete_clubs" SET "to_date" = current_date WHERE "athlete_id" = NEW."id" AND "to_date" IS NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM "athlete_clubs" WHERE "athlete_id" = NEW."id" AND "to_date" IS NULL AND "club_name" = btrim(NEW."current_club")) THEN
    UPDATE "athlete_clubs" SET "to_date" = current_date WHERE "athlete_id" = NEW."id" AND "to_date" IS NULL;
    INSERT INTO "athlete_clubs" ("athlete_id", "club_name") VALUES (NEW."id", btrim(NEW."current_club"));
  END IF;
  PERFORM "sync_athlete_contact"(NEW."id", 'phone', 'guardian', NEW."guardian_phone");
  PERFORM "sync_athlete_contact"(NEW."id", 'email', 'guardian', NEW."guardian_email");
  PERFORM "sync_athlete_contact"(NEW."id", 'phone', 'own', NEW."own_phone");
  PERFORM "sync_athlete_contact"(NEW."id", 'email', 'own', NEW."own_email");
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "prospects_sync_athlete" AFTER INSERT OR UPDATE ON "prospects"
  FOR EACH ROW EXECUTE FUNCTION "sync_prospect_athlete"();--> statement-breakpoint
-- Erasing a prospect (retention purge) erases the athlete with it.
CREATE FUNCTION "delete_prospect_athlete"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "athletes" WHERE "id" = OLD."id";
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "prospects_delete_athlete" AFTER DELETE ON "prospects"
  FOR EACH ROW EXECUTE FUNCTION "delete_prospect_athlete"();--> statement-breakpoint
-- A contact nobody links to any more is erased (right to erasure reaches contact history too).
CREATE FUNCTION "delete_orphan_contact"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "contacts" c WHERE c."id" = OLD."contact_id"
    AND NOT EXISTS (SELECT 1 FROM "person_contact_links" WHERE "contact_id" = c."id")
    AND NOT EXISTS (SELECT 1 FROM "athlete_contact_links" WHERE "contact_id" = c."id");
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "person_contact_links_orphans" AFTER DELETE ON "person_contact_links"
  FOR EACH ROW EXECUTE FUNCTION "delete_orphan_contact"();--> statement-breakpoint
CREATE TRIGGER "athlete_contact_links_orphans" AFTER DELETE ON "athlete_contact_links"
  FOR EACH ROW EXECUTE FUNCTION "delete_orphan_contact"();--> statement-breakpoint
-- Catch up athletes whose prospect changed after the step 2 copy: a no-op update re-runs the sync.
UPDATE "prospects" SET "updated_at" = "updated_at";
