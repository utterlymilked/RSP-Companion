ALTER TYPE "public"."guardian_relation" ADD VALUE 'father' BEFORE 'step_parent';--> statement-breakpoint
ALTER TYPE "public"."guardian_relation" ADD VALUE 'mother' BEFORE 'step_parent';--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"city" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"wikidata_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_name_key" UNIQUE("name_key"),
	CONSTRAINT "clubs_wikidata_key" UNIQUE("wikidata_id")
);
--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "kind" text DEFAULT 'match' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "recommendation" text;--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "dominant_foot" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "own_phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "own_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "media_url" text;