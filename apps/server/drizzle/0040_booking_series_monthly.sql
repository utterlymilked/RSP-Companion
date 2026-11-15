ALTER TABLE "booking_series" ALTER COLUMN "every_weeks" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_series" ADD COLUMN "every_months" smallint;