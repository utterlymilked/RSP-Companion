import { FEE_KINDS, PAYMENT_METHODS } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { stockMovements } from "../equipment/schema.js";
import { persons } from "../people/schema.js";
import { ageGroups, seasons } from "../seasons/schema.js";

export const feeKind = pgEnum("fee_kind", FEE_KINDS);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);

/** What the club charges: an amount per season, optionally for one escalão. */
export const feePlans = pgTable(
  "fee_plans",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    ageGroupId: uuid().references(() => ageGroups.id, { onDelete: "restrict" }),
    name: text().notNull(),
    kind: feeKind().notNull(),
    amountCents: integer().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("fee_plans_season_idx").on(t.seasonId),
    check("fee_plans_amount_check", sql`${t.amountCents} > 0`),
  ],
);

/**
 * Something a person owes. Net amount = `amountCents - discountCents`; what was paid is the
 * sum of its payments and the status is derived, never stored. A cancelled charge keeps its
 * payments (they stay on record) but no longer counts as owed.
 */
export const charges = pgTable(
  "charges",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    planId: uuid().references(() => feePlans.id, { onDelete: "set null" }),
    /** The economato sale this charge bills; one charge per sale. */
    stockMovementId: uuid().references(() => stockMovements.id, { onDelete: "set null" }),
    kind: feeKind().notNull(),
    description: text().notNull(),
    amountCents: integer().notNull(),
    discountCents: integer().notNull().default(0),
    dueDate: date({ mode: "string" }).notNull(),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("charges_person_idx").on(t.personId),
    index("charges_due_idx").on(t.dueDate),
    uniqueIndex("charges_stock_movement_key").on(t.stockMovementId),
    check("charges_amount_check", sql`${t.amountCents} > 0`),
    check(
      "charges_discount_check",
      sql`${t.discountCents} >= 0 and ${t.discountCents} < ${t.amountCents}`,
    ),
  ],
);

/** A payment against one charge. The receipt number is a gap-tolerant club-wide serial. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    chargeId: uuid()
      .notNull()
      .references(() => charges.id, { onDelete: "restrict" }),
    amountCents: integer().notNull(),
    method: paymentMethod().notNull(),
    paidOn: date({ mode: "string" }).notNull(),
    receiptNumber: integer().notNull().generatedAlwaysAsIdentity(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_charge_idx").on(t.chargeId),
    uniqueIndex("payments_receipt_number_key").on(t.receiptNumber),
    check("payments_amount_check", sql`${t.amountCents} > 0`),
  ],
);

export type FeePlan = typeof feePlans.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
