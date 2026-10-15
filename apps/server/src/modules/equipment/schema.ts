import { EQUIPMENT_CATEGORIES, STOCK_MOVEMENT_KINDS } from "@rsc/shared";
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
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";
import { teams } from "../teams/schema.js";

export const equipmentCategory = pgEnum("equipment_category", EQUIPMENT_CATEGORIES);
export const stockMovementKind = pgEnum("stock_movement_kind", STOCK_MOVEMENT_KINDS);

/** An economato item; one row per size. Stock is the sum of its movements, never stored. */
export const equipmentItems = pgTable(
  "equipment_items",
  {
    id: id(),
    name: text().notNull(),
    category: equipmentCategory().notNull(),
    size: text(),
    /** Sale price in cents. */
    priceCents: integer(),
    minStock: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("equipment_items_name_size_key").on(t.name, t.size).nullsNotDistinct(),
    check("equipment_items_price_check", sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
    check("equipment_items_min_stock_check", sql`${t.minStock} >= 0`),
  ],
);

/** Loans of an item to one person or one team. Returned whole (`returnedAt` set). */
export const equipmentLoans = pgTable(
  "equipment_loans",
  {
    id: id(),
    itemId: uuid()
      .notNull()
      .references(() => equipmentItems.id, { onDelete: "restrict" }),
    quantity: integer().notNull(),
    personId: uuid().references(() => persons.id, { onDelete: "restrict" }),
    teamId: uuid().references(() => teams.id, { onDelete: "restrict" }),
    loanedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dueDate: date({ mode: "string" }),
    returnedAt: timestamp({ withTimezone: true }),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("equipment_loans_item_idx").on(t.itemId),
    check("equipment_loans_quantity_check", sql`${t.quantity} > 0`),
    check("equipment_loans_borrower_check", sql`(${t.personId} is null) <> (${t.teamId} is null)`),
  ],
);

/** Append-only stock ledger: `delta` is signed (receipts +, sales and loans -). */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    itemId: uuid()
      .notNull()
      .references(() => equipmentItems.id, { onDelete: "restrict" }),
    kind: stockMovementKind().notNull(),
    delta: integer().notNull(),
    loanId: uuid().references(() => equipmentLoans.id, { onDelete: "set null" }),
    /** Buyer of a sale. */
    personId: uuid().references(() => persons.id, { onDelete: "restrict" }),
    /** Price per unit of a sale, in cents (M12 turns it into a charge). */
    unitPriceCents: integer(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_item_idx").on(t.itemId),
    check("stock_movements_delta_check", sql`${t.delta} <> 0`),
  ],
);

export type EquipmentItem = typeof equipmentItems.$inferSelect;
export type EquipmentLoan = typeof equipmentLoans.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
