CREATE TYPE "public"."consent_kind" AS ENUM('image_rights', 'transport');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_kind" AS ENUM('export', 'erasure', 'rectification', 'other');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('open', 'done', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'consent.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'privacy.export';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'person.erased';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'account.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'retention.purged';--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted_by_person_id" uuid,
	"granted_on" date NOT NULL,
	"revoked_on" date,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_dates" CHECK ("consents"."revoked_on" IS NULL OR "consents"."revoked_on" >= "consents"."granted_on")
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"kind" "privacy_request_kind" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'open' NOT NULL,
	"message" text,
	"requested_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_requests_resolved" CHECK (("privacy_requests"."status" = 'open') = ("privacy_requests"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_granted_by_person_id_persons_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_one_active_idx" ON "consents" USING btree ("person_id","kind") WHERE "consents"."revoked_on" IS NULL;--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status","created_at");