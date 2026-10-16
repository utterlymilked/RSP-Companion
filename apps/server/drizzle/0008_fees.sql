CREATE TYPE "public"."fee_kind" AS ENUM('dues', 'monthly', 'registration', 'kit', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'multibanco', 'mbway', 'other');--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"plan_id" uuid,
	"stock_movement_id" uuid,
	"kind" "fee_kind" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_amount_check" CHECK ("charges"."amount_cents" > 0),
	CONSTRAINT "charges_discount_check" CHECK ("charges"."discount_cents" >= 0 and "charges"."discount_cents" < "charges"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"age_group_id" uuid,
	"name" text NOT NULL,
	"kind" "fee_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_plans_amount_check" CHECK ("fee_plans"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"receipt_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "payments_receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_plan_id_fee_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_age_group_id_age_groups_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."age_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_person_idx" ON "charges" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "charges_due_idx" ON "charges" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_stock_movement_key" ON "charges" USING btree ("stock_movement_id");--> statement-breakpoint
CREATE INDEX "fee_plans_season_idx" ON "fee_plans" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "payments_charge_idx" ON "payments" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments" USING btree ("receipt_number");