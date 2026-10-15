CREATE TYPE "public"."incident_person_role" AS ENUM('involved', 'injured', 'witness');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('injury', 'discipline', 'damage', 'match', 'other');--> statement-breakpoint
CREATE TABLE "incident_people" (
	"incident_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "incident_person_role" DEFAULT 'involved' NOT NULL,
	CONSTRAINT "incident_people_incident_id_person_id_pk" PRIMARY KEY("incident_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "incident_type" NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"place" text,
	"team_id" uuid,
	"description" text NOT NULL,
	"follow_up" text,
	"reported_by" uuid,
	"client_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_reporter_client_key_key" UNIQUE("reported_by","client_key")
);
--> statement-breakpoint
ALTER TABLE "incident_people" ADD CONSTRAINT "incident_people_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_people" ADD CONSTRAINT "incident_people_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_occurred_idx" ON "incidents" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_team_idx" ON "incidents" USING btree ("team_id");