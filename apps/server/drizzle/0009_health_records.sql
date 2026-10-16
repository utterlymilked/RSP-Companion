CREATE TYPE "public"."health_discipline" AS ENUM('medical', 'physio', 'nutrition', 'psychology');--> statement-breakpoint
CREATE TYPE "public"."injury_availability" AS ENUM('unavailable', 'limited');--> statement-breakpoint
CREATE TYPE "public"."injury_status" AS ENUM('active', 'return_to_play', 'cleared');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'health.write' BEFORE 'role.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'health.consent' BEFORE 'role.granted';--> statement-breakpoint
CREATE TABLE "health_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"granted_by_person_id" uuid,
	"granted_on" date NOT NULL,
	"revoked_on" date,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_consents_dates" CHECK ("health_consents"."revoked_on" IS NULL OR "health_consents"."revoked_on" >= "health_consents"."granted_on")
);
--> statement-breakpoint
CREATE TABLE "health_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"discipline" "health_discipline" NOT NULL,
	"recorded_on" date NOT NULL,
	"summary" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"discipline" "health_discipline" NOT NULL,
	"body_part" text NOT NULL,
	"description" text,
	"started_on" date NOT NULL,
	"status" "injury_status" DEFAULT 'active' NOT NULL,
	"availability" "injury_availability" DEFAULT 'unavailable' NOT NULL,
	"expected_return_on" date,
	"cleared_on" date,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "injuries_cleared" CHECK (("injuries"."status" = 'cleared') = ("injuries"."cleared_on" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_granted_by_person_id_persons_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_consents" ADD CONSTRAINT "health_consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_notes" ADD CONSTRAINT "health_notes_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_notes" ADD CONSTRAINT "health_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_consents_one_active_idx" ON "health_consents" USING btree ("person_id") WHERE "health_consents"."revoked_on" IS NULL;--> statement-breakpoint
CREATE INDEX "health_notes_person_idx" ON "health_notes" USING btree ("person_id","discipline");--> statement-breakpoint
CREATE INDEX "injuries_person_idx" ON "injuries" USING btree ("person_id");