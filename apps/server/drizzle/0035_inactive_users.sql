ALTER TYPE "public"."audit_action" ADD VALUE 'account.purged' BEFORE 'approval.decided';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'account.deactivated' BEFORE 'approval.decided';--> statement-breakpoint
CREATE TABLE "account_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"days_before" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_notices_user_days_key" UNIQUE("user_id","days_before")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_notices" ADD CONSTRAINT "account_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing logins start their inactivity clock now, so nothing is warned or purged at once.
UPDATE "users" SET "last_sign_in_at" = now();
