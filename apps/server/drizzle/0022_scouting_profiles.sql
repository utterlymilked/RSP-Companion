ALTER TABLE "persons" ADD COLUMN "nif" text;--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "position_played" text;--> statement-breakpoint
ALTER TABLE "prospect_reports" ADD COLUMN "heat" jsonb;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "nif" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "archetype" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospects_person_idx" ON "prospects" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "prospects_nif_idx" ON "prospects" USING btree ("nif");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_nif_unique" UNIQUE("nif");