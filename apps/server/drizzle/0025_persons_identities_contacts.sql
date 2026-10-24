CREATE TYPE "public"."contact_kind" AS ENUM('email', 'phone', 'address');--> statement-breakpoint
CREATE TYPE "public"."identity_type" AS ENUM('nif', 'cc', 'bi', 'passport', 'residence_permit', 'fpf_licence', 'rsc_code');--> statement-breakpoint
CREATE TABLE "user_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"relationship" text DEFAULT 'owner' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_persons_user_person_key" UNIQUE("user_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"value" text NOT NULL,
	"address_json" jsonb,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_issuers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_issuers_country_name_key" UNIQUE("country","name")
);
--> statement-breakpoint
CREATE TABLE "person_contact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text DEFAULT 'own' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"verified_at" timestamp with time zone,
	CONSTRAINT "person_contact_links_person_contact_key" UNIQUE("person_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "person_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "identity_type" NOT NULL,
	"issuer_id" uuid,
	"value" text NOT NULL,
	"value_normalised" text NOT NULL,
	"evidence" text DEFAULT 'legacy_sync' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_persons" ADD CONSTRAINT "user_persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_persons" ADD CONSTRAINT "user_persons_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_persons" ADD CONSTRAINT "user_persons_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_links" ADD CONSTRAINT "person_contact_links_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_links" ADD CONSTRAINT "person_contact_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identities" ADD CONSTRAINT "person_identities_issuer_id_identity_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."identity_issuers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_persons_person_idx" ON "user_persons" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_persons_one_owner_per_person_idx" ON "user_persons" USING btree ("person_id") WHERE "user_persons"."relationship" = 'owner' and "user_persons"."status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "user_persons_one_person_per_owner_idx" ON "user_persons" USING btree ("user_id") WHERE "user_persons"."relationship" = 'owner' and "user_persons"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "person_contact_links_person_idx" ON "person_contact_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_identities_person_idx" ON "person_identities" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_identities_key" ON "person_identities" USING btree ("type",coalesce("issuer_id", '00000000-0000-0000-0000-000000000000'::uuid),"value_normalised");--> statement-breakpoint
-- ADR 0024 step 1 (expand): backfill the new tables from the legacy columns.
INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
SELECT "id", 'rsc_code', "identity_code", upper("identity_code"), 'legacy_sync' FROM "persons"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
SELECT "id", 'nif', "nif", upper(regexp_replace("nif", '[^[:alnum:]]', '', 'g')), 'legacy_sync' FROM "persons"
WHERE "nif" IS NOT NULL AND regexp_replace("nif", '[^[:alnum:]]', '', 'g') <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
SELECT "id", 'fpf_licence', "federation_id", upper(regexp_replace("federation_id", '[^[:alnum:]]', '', 'g')), 'legacy_sync' FROM "persons"
WHERE "federation_id" IS NOT NULL AND regexp_replace("federation_id", '[^[:alnum:]]', '', 'g') <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
WITH "src" AS (
  SELECT gen_random_uuid() AS "cid", "id" AS "pid", 'email'::"contact_kind" AS "k", "email" AS "v" FROM "persons"
  WHERE "email" IS NOT NULL AND btrim("email") <> ''
  UNION ALL
  SELECT gen_random_uuid(), "id", 'phone'::"contact_kind", "phone" FROM "persons"
  WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
), "ins" AS (
  INSERT INTO "contacts" ("id", "kind", "value", "source") SELECT "cid", "k", "v", 'legacy_sync' FROM "src"
)
INSERT INTO "person_contact_links" ("person_id", "contact_id", "is_primary") SELECT "pid", "cid", true FROM "src";--> statement-breakpoint
INSERT INTO "user_persons" ("user_id", "person_id", "relationship", "status", "approved_at")
SELECT "id", "person_id", 'owner', 'approved', now() FROM "users" WHERE "person_id" IS NOT NULL;--> statement-breakpoint
-- Dual write: until the legacy columns are dropped, triggers keep the new tables in step.
CREATE FUNCTION "sync_person_contact"(p uuid, k "contact_kind", v text) RETURNS void AS $$
DECLARE cur uuid; curval text; newc uuid;
BEGIN
  IF v IS NOT NULL AND btrim(v) = '' THEN v := NULL; END IF;
  SELECT l."id", c."value" INTO cur, curval FROM "person_contact_links" l
    JOIN "contacts" c ON c."id" = l."contact_id"
    WHERE l."person_id" = p AND c."kind" = k AND c."source" = 'legacy_sync' AND l."valid_to" IS NULL AND l."label" = 'own'
    LIMIT 1;
  IF cur IS NOT NULL AND curval IS NOT DISTINCT FROM v THEN RETURN; END IF;
  IF cur IS NOT NULL THEN UPDATE "person_contact_links" SET "valid_to" = now() WHERE "id" = cur; END IF;
  IF v IS NOT NULL THEN
    INSERT INTO "contacts" ("kind", "value", "source") VALUES (k, v, 'legacy_sync') RETURNING "id" INTO newc;
    INSERT INTO "person_contact_links" ("person_id", "contact_id", "is_primary") VALUES (p, newc, true);
  END IF;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "sync_person_legacy"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
    VALUES (NEW."id", 'rsc_code', NEW."identity_code", upper(NEW."identity_code"), 'legacy_sync') ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP = 'INSERT' OR NEW."nif" IS DISTINCT FROM OLD."nif" THEN
    DELETE FROM "person_identities" WHERE "person_id" = NEW."id" AND "type" = 'nif' AND "evidence" = 'legacy_sync';
    IF NEW."nif" IS NOT NULL AND regexp_replace(NEW."nif", '[^[:alnum:]]', '', 'g') <> '' THEN
      INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
      VALUES (NEW."id", 'nif', NEW."nif", upper(regexp_replace(NEW."nif", '[^[:alnum:]]', '', 'g')), 'legacy_sync') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW."federation_id" IS DISTINCT FROM OLD."federation_id" THEN
    DELETE FROM "person_identities" WHERE "person_id" = NEW."id" AND "type" = 'fpf_licence' AND "evidence" = 'legacy_sync';
    IF NEW."federation_id" IS NOT NULL AND regexp_replace(NEW."federation_id", '[^[:alnum:]]', '', 'g') <> '' THEN
      INSERT INTO "person_identities" ("person_id", "type", "value", "value_normalised", "evidence")
      VALUES (NEW."id", 'fpf_licence', NEW."federation_id", upper(regexp_replace(NEW."federation_id", '[^[:alnum:]]', '', 'g')), 'legacy_sync') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW."email" IS DISTINCT FROM OLD."email" THEN
    PERFORM "sync_person_contact"(NEW."id", 'email', NEW."email");
  END IF;
  IF TG_OP = 'INSERT' OR NEW."phone" IS DISTINCT FROM OLD."phone" THEN
    PERFORM "sync_person_contact"(NEW."id", 'phone', NEW."phone");
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "persons_sync_legacy" AFTER INSERT OR UPDATE ON "persons"
  FOR EACH ROW EXECUTE FUNCTION "sync_person_legacy"();--> statement-breakpoint
CREATE FUNCTION "sync_user_person"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."person_id" IS NOT NULL AND OLD."person_id" IS DISTINCT FROM NEW."person_id" THEN
    UPDATE "user_persons" SET "status" = 'revoked', "valid_to" = now(), "updated_at" = now()
    WHERE "user_id" = NEW."id" AND "person_id" = OLD."person_id" AND "relationship" = 'owner';
  END IF;
  IF NEW."person_id" IS NOT NULL THEN
    INSERT INTO "user_persons" ("user_id", "person_id", "relationship", "status", "approved_at")
    VALUES (NEW."id", NEW."person_id", 'owner', 'approved', now())
    ON CONFLICT ("user_id", "person_id") DO UPDATE
      SET "relationship" = 'owner', "status" = 'approved', "valid_to" = NULL, "updated_at" = now();
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "users_sync_person" AFTER INSERT OR UPDATE OF "person_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "sync_user_person"();--> statement-breakpoint
-- A person that exists must keep at least one identity (checked at commit).
CREATE FUNCTION "require_person_identity"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "persons" WHERE "id" = OLD."person_id")
     AND NOT EXISTS (SELECT 1 FROM "person_identities" WHERE "person_id" = OLD."person_id") THEN
    RAISE EXCEPTION 'person_needs_identity' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "person_identities_keep_one" AFTER DELETE ON "person_identities"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "require_person_identity"();
