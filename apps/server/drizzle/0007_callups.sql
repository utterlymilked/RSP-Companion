CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'going', 'not_going');--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"called_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_up_by" uuid,
	"rsvp" "rsvp_status" DEFAULT 'pending' NOT NULL,
	"rsvp_note" text,
	"rsvp_at" timestamp with time zone,
	"rsvp_by" uuid,
	"attendance" "attendance_status",
	"attendance_marked_at" timestamp with time zone,
	"attendance_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_event_person_key" UNIQUE("event_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_called_up_by_users_id_fk" FOREIGN KEY ("called_up_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_rsvp_by_users_id_fk" FOREIGN KEY ("rsvp_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_attendance_by_users_id_fk" FOREIGN KEY ("attendance_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_participants_person_idx" ON "event_participants" USING btree ("person_id");