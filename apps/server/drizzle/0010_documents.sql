CREATE TYPE "public"."document_kind" AS ENUM('medical_exam', 'federation_registration', 'id_document', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'document.read' BEFORE 'role.granted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'document.write' BEFORE 'role.granted';--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"title" text,
	"issued_on" date,
	"expires_on" date,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "documents_dates" CHECK ("documents"."issued_on" IS NULL OR "documents"."expires_on" IS NULL OR "documents"."expires_on" >= "documents"."issued_on"),
	CONSTRAINT "documents_size" CHECK ("documents"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_person_idx" ON "documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "documents_expires_on_idx" ON "documents" USING btree ("expires_on");