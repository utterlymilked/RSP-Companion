CREATE TYPE "public"."incident_origin" AS ENUM('competition', 'school', 'other');--> statement-breakpoint
ALTER TYPE "public"."incident_type" ADD VALUE 'equipment' BEFORE 'match';--> statement-breakpoint
ALTER TYPE "public"."incident_type" ADD VALUE 'facilities' BEFORE 'match';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub8' BEFORE 'sub9';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub10' BEFORE 'sub11';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub12' BEFORE 'sub13';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub14' BEFORE 'sub15';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub16' BEFORE 'sub17';--> statement-breakpoint
ALTER TYPE "public"."prospect_escalao" ADD VALUE 'sub18' BEFORE 'sub19';--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "origin" "incident_origin";--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "origin_group" text;