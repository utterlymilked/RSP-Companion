CREATE TYPE "public"."dominant_foot" AS ENUM('left', 'right', 'both');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('goalkeeper', 'defender', 'midfielder', 'forward');--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"position" "player_position",
	"dominant_foot" "dominant_foot",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_person_key" UNIQUE("person_id")
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "identity_code" text DEFAULT 'RSC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "is_pseudonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_identity_code_key" UNIQUE("identity_code");--> statement-breakpoint
-- Everyone already on a team roster is a player.
INSERT INTO "players" ("person_id") SELECT DISTINCT "person_id" FROM "team_members";
