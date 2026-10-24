CREATE TABLE "athlete_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value_text" text,
	"value_num" numeric,
	"value_date" date,
	"precision" text,
	"source" text DEFAULT 'observed' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"recorded_by" uuid,
	CONSTRAINT "athlete_attributes_one_value" CHECK (("athlete_attributes"."value_text" is not null)::int + ("athlete_attributes"."value_num" is not null)::int + ("athlete_attributes"."value_date" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "athlete_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"club_id" uuid,
	"club_name" text,
	"from_date" date,
	"to_date" date,
	"level" text,
	"is_loan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_clubs_has_club" CHECK ("athlete_clubs"."club_id" is not null or "athlete_clubs"."club_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "athlete_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"notice_version" text,
	"given_by" text,
	"given_at" timestamp with time zone,
	"informed_at" timestamp with time zone,
	"scope" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_contact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text DEFAULT 'own' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	CONSTRAINT "athlete_contact_links_athlete_contact_key" UNIQUE("athlete_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text DEFAULT 'ATL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) NOT NULL,
	"display_name" text NOT NULL,
	"person_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"retain_until" date,
	"merged_into_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athletes_code_key" UNIQUE("code"),
	CONSTRAINT "athletes_display_name" CHECK (char_length(btrim("athletes"."display_name")) between 2 and 80 and "athletes"."display_name" !~ '^[ .''’-]*$')
);
--> statement-breakpoint
ALTER TABLE "athlete_attributes" ADD CONSTRAINT "athlete_attributes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_attributes" ADD CONSTRAINT "athlete_attributes_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_clubs" ADD CONSTRAINT "athlete_clubs_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_clubs" ADD CONSTRAINT "athlete_clubs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_consents" ADD CONSTRAINT "athlete_consents_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_contact_links" ADD CONSTRAINT "athlete_contact_links_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_contact_links" ADD CONSTRAINT "athlete_contact_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_attributes_athlete_idx" ON "athlete_attributes" USING btree ("athlete_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_attributes_current_single_idx" ON "athlete_attributes" USING btree ("athlete_id","type") WHERE "athlete_attributes"."valid_to" is null and "athlete_attributes"."type" <> 'position';--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_attributes_current_position_idx" ON "athlete_attributes" USING btree ("athlete_id","value_text") WHERE "athlete_attributes"."valid_to" is null and "athlete_attributes"."type" = 'position';--> statement-breakpoint
CREATE INDEX "athlete_clubs_athlete_idx" ON "athlete_clubs" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_consents_athlete_idx" ON "athlete_consents" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_contact_links_athlete_idx" ON "athlete_contact_links" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_person_key" ON "athletes" USING btree ("person_id") WHERE "athletes"."person_id" is not null;--> statement-breakpoint
-- ADR 0024 step 2 (expand): every prospect becomes an athlete with the SAME id, so reports,
-- URLs and retention keep working. Prospects stay the scouting case (pipeline, trial request).
INSERT INTO "athletes" ("id", "display_name", "person_id", "source", "retain_until", "created_by", "created_at", "updated_at")
SELECT p."id",
  CASE WHEN char_length(btrim(p."full_name")) BETWEEN 2 AND 80 AND p."full_name" !~ '^[ .''’-]*$'
       THEN btrim(p."full_name") ELSE 'Atleta ' || left(p."id"::text, 8) END,
  l."person_id",
  CASE WHEN p."source" = 'request' THEN 'public_form' ELSE 'scouting' END,
  p."retain_until", p."created_by", p."created_at", p."updated_at"
FROM "prospects" p
LEFT JOIN (SELECT DISTINCT ON ("person_id") "id", "person_id" FROM "prospects"
           WHERE "person_id" IS NOT NULL ORDER BY "person_id", "created_at") l ON l."id" = p."id";--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'name', btrim(p."full_name"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE char_length(btrim(p."full_name")) BETWEEN 2 AND 80 AND p."full_name" !~ '^[ .''’-]*$';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'nickname', btrim(p."nickname"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE char_length(btrim(p."nickname")) BETWEEN 2 AND 80 AND p."nickname" !~ '^[ .''’-]*$';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'dominant_foot', btrim(p."dominant_foot"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE btrim(coalesce(p."dominant_foot", '')) <> '';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'nationality', btrim(p."nationality"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE btrim(coalesce(p."nationality", '')) <> '';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'birthplace', btrim(p."birthplace"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE btrim(coalesce(p."birthplace", '')) <> '';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'social_url', btrim(p."social_url"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE btrim(coalesce(p."social_url", '')) <> '';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT p."id", 'media_url', btrim(p."media_url"), 'legacy_sync', p."created_at" FROM "prospects" p WHERE btrim(coalesce(p."media_url", '')) <> '';--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_date", "precision", "source", "valid_from")
SELECT p."id", 'date_of_birth', p."birth_date", 'day', 'legacy_sync', p."created_at" FROM "prospects" p WHERE p."birth_date" IS NOT NULL;--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_date", "precision", "source", "valid_from")
SELECT p."id", 'date_of_birth', make_date(p."birth_year", 1, 1), 'year', 'legacy_sync', p."created_at" FROM "prospects" p
WHERE p."birth_date" IS NULL AND p."birth_year" BETWEEN 1900 AND 2100;--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_num", "source", "valid_from")
SELECT p."id", 'height_cm', p."height_cm", 'legacy_sync', p."created_at" FROM "prospects" p WHERE p."height_cm" IS NOT NULL;--> statement-breakpoint
INSERT INTO "athlete_attributes" ("athlete_id", "type", "value_text", "source", "valid_from")
SELECT q."id", 'position', q."pos", 'legacy_sync', min(q."created_at") FROM (
  SELECT p."id", p."created_at", btrim(unnest(p."positions" || CASE WHEN p."position" IS NULL THEN '{}'::text[] ELSE ARRAY[p."position"] END)) AS "pos" FROM "prospects" p
) q WHERE q."pos" <> '' GROUP BY q."id", q."pos";--> statement-breakpoint
INSERT INTO "athlete_clubs" ("athlete_id", "club_name")
SELECT "id", btrim("current_club") FROM "prospects" WHERE btrim(coalesce("current_club", '')) <> '';--> statement-breakpoint
WITH "src" AS (
  SELECT gen_random_uuid() AS "cid", p."id" AS "aid", 'phone'::"contact_kind" AS "k", p."guardian_phone" AS "v", 'guardian' AS "label" FROM "prospects" p WHERE btrim(coalesce(p."guardian_phone", '')) <> ''
  UNION ALL SELECT gen_random_uuid(), p."id", 'email'::"contact_kind", p."guardian_email", 'guardian' FROM "prospects" p WHERE btrim(coalesce(p."guardian_email", '')) <> ''
  UNION ALL SELECT gen_random_uuid(), p."id", 'phone'::"contact_kind", p."own_phone", 'own' FROM "prospects" p WHERE btrim(coalesce(p."own_phone", '')) <> ''
  UNION ALL SELECT gen_random_uuid(), p."id", 'email'::"contact_kind", p."own_email", 'own' FROM "prospects" p WHERE btrim(coalesce(p."own_email", '')) <> ''
), "ins" AS (
  INSERT INTO "contacts" ("id", "kind", "value", "source") SELECT "cid", "k", btrim("v"), 'legacy_sync' FROM "src"
)
INSERT INTO "athlete_contact_links" ("athlete_id", "contact_id", "label", "is_primary") SELECT "aid", "cid", "label", true FROM "src";
