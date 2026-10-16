CREATE TYPE "public"."guardian_relation" AS ENUM('parent', 'step_parent', 'family', 'tutor', 'agent');--> statement-breakpoint
CREATE TYPE "public"."prospect_context" AS ENUM('federated_club', 'school');--> statement-breakpoint
CREATE TYPE "public"."prospect_escalao" AS ENUM('sub7', 'sub9', 'sub11', 'sub13', 'sub15', 'sub17', 'sub19');--> statement-breakpoint
CREATE TYPE "public"."prospect_id_type" AS ENUM('cc', 'passport', 'residence_permit', 'other');--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "guardian_relation" "guardian_relation";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "own_contact" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "social_url" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "target_escalao" "prospect_escalao";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "context" "prospect_context";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "positions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "seasons_played" integer;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "motive" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "id_type" "prospect_id_type";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "birthplace" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "preferred_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "alternative_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "trial_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "trial_venue" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "club_authorisation_needed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "club_authorised" boolean DEFAULT false NOT NULL;