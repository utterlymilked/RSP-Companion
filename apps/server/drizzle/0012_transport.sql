CREATE TYPE "public"."ride_kind" AS ENUM('club_van', 'carpool');--> statement-breakpoint
CREATE TABLE "transport_passengers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_passengers_event_person_key" UNIQUE("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "transport_rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "ride_kind" NOT NULL,
	"label" text,
	"driver_person_id" uuid,
	"seats" integer NOT NULL,
	"pickup_point" text,
	"pickup_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_rides_seats_positive" CHECK ("transport_rides"."seats" > 0)
);
--> statement-breakpoint
ALTER TABLE "transport_passengers" ADD CONSTRAINT "transport_passengers_ride_id_transport_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."transport_rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passengers" ADD CONSTRAINT "transport_passengers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passengers" ADD CONSTRAINT "transport_passengers_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_passengers" ADD CONSTRAINT "transport_passengers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_rides" ADD CONSTRAINT "transport_rides_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_rides" ADD CONSTRAINT "transport_rides_driver_person_id_persons_id_fk" FOREIGN KEY ("driver_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_rides" ADD CONSTRAINT "transport_rides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transport_passengers_ride_idx" ON "transport_passengers" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "transport_rides_event_idx" ON "transport_rides" USING btree ("event_id");