ALTER TYPE "public"."audit_action" ADD VALUE 'invitation.resent' BEFORE 'admin.bootstrapped';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'invitation.revoked' BEFORE 'admin.bootstrapped';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'user.deactivated' BEFORE 'admin.bootstrapped';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'user.reactivated' BEFORE 'admin.bootstrapped';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;