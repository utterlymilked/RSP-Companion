import type {
  CreateEquipmentItemInput,
  CreateLoanInput,
  CreateStockMovementInput,
  ListEquipmentItemsQuery,
  ListLoansQuery,
  UpdateEquipmentItemInput,
} from "@rsc/shared";
import { and, asc, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import {
  type EquipmentItem,
  type EquipmentLoan,
  equipmentItems,
  equipmentLoans,
  type StockMovement,
  stockMovements,
} from "./schema.js";

// The outer table is named in raw SQL: Drizzle drops table prefixes in single-table selects.
const stockSql = sql<number>`coalesce((select sum(${stockMovements.delta}) from ${stockMovements} where ${stockMovements.itemId} = "equipment_items"."id"), 0)::int`;

export type ItemWithStock = EquipmentItem & { stock: number; low: boolean };
const withLow = (row: EquipmentItem & { stock: number }): ItemWithStock => ({
  ...row,
  low: row.stock <= row.minStock,
});

export async function createItem(db: Db, input: CreateEquipmentItemInput): Promise<EquipmentItem> {
  const [item] = await db.insert(equipmentItems).values(input).returning();
  if (!item) throw new Error("Insert returned no row");
  return item;
}

export async function updateItem(
  db: Db,
  itemId: string,
  input: UpdateEquipmentItemInput,
): Promise<EquipmentItem | null> {
  const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) {
    const [item] = await db.select().from(equipmentItems).where(eq(equipmentItems.id, itemId));
    return item ?? null;
  }
  const [item] = await db
    .update(equipmentItems)
    .set(values)
    .where(eq(equipmentItems.id, itemId))
    .returning();
  return item ?? null;
}

export async function listItems(db: Db, filter: ListEquipmentItemsQuery): Promise<ItemWithStock[]> {
  const rows = await db
    .select({ ...getTableColumns(equipmentItems), stock: stockSql })
    .from(equipmentItems)
    .where(
      and(
        filter.category ? eq(equipmentItems.category, filter.category) : undefined,
        filter.includeInactive ? undefined : eq(equipmentItems.active, true),
      ),
    )
    .orderBy(asc(equipmentItems.name), asc(equipmentItems.size));
  const items = rows.map(withLow);
  return filter.low ? items.filter((i) => i.low) : items;
}

export async function getItem(db: Db, itemId: string): Promise<ItemWithStock | null> {
  const [row] = await db
    .select({ ...getTableColumns(equipmentItems), stock: stockSql })
    .from(equipmentItems)
    .where(eq(equipmentItems.id, itemId));
  return row ? withLow(row) : null;
}

/**
 * Appends a movement after locking the item row, so two concurrent removals cannot both
 * pass the stock check. Throws 404 for an unknown item and 409 `insufficient_stock` when the
 * movement would take stock below zero. Run inside a transaction.
 */
async function appendMovement(
  db: Db,
  itemId: string,
  movement: Omit<typeof stockMovements.$inferInsert, "itemId">,
): Promise<StockMovement> {
  const [item] = await db
    .select({ id: equipmentItems.id })
    .from(equipmentItems)
    .where(eq(equipmentItems.id, itemId))
    .for("update");
  if (!item) throw new ApiError(404, "not_found");
  if (movement.delta < 0) {
    const [row] = await db
      .select({ stock: sql<number>`coalesce(sum(${stockMovements.delta}), 0)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.itemId, itemId));
    if ((row?.stock ?? 0) + movement.delta < 0) throw new ApiError(409, "insufficient_stock");
  }
  const [created] = await db
    .insert(stockMovements)
    .values({ ...movement, itemId })
    .returning();
  if (!created) throw new Error("Insert returned no row");
  return created;
}

export async function recordMovement(
  db: Db,
  itemId: string,
  input: CreateStockMovementInput,
  userId: string,
): Promise<StockMovement> {
  const delta =
    input.kind === "adjustment"
      ? input.quantity
      : input.kind === "receipt"
        ? input.quantity
        : -input.quantity;
  let unitPriceCents = null;
  if (input.kind === "sale") {
    const [item] = await db
      .select({ priceCents: equipmentItems.priceCents })
      .from(equipmentItems)
      .where(eq(equipmentItems.id, itemId));
    unitPriceCents = input.unitPriceCents ?? item?.priceCents ?? null;
  }
  return appendMovement(db, itemId, {
    kind: input.kind,
    delta,
    personId: input.personId,
    unitPriceCents,
    note: input.note,
    createdBy: userId,
  });
}

export async function listMovements(db: Db, itemId: string): Promise<StockMovement[]> {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(200);
}

export async function createLoan(
  db: Db,
  input: CreateLoanInput,
  userId: string,
): Promise<EquipmentLoan> {
  const { itemId, quantity, ...rest } = input;
  const [loan] = await db
    .insert(equipmentLoans)
    .values({ itemId, quantity, ...rest, createdBy: userId })
    .returning();
  if (!loan) throw new Error("Insert returned no row");
  await appendMovement(db, itemId, {
    kind: "loan",
    delta: -quantity,
    loanId: loan.id,
    personId: input.personId,
    createdBy: userId,
  });
  return loan;
}

/** Returns a loan whole and puts the stock back. Null when unknown; 409 when already returned. */
export async function returnLoan(
  db: Db,
  loanId: string,
  userId: string,
): Promise<EquipmentLoan | null> {
  const [loan] = await db
    .select()
    .from(equipmentLoans)
    .where(eq(equipmentLoans.id, loanId))
    .for("update");
  if (!loan) return null;
  if (loan.returnedAt) throw new ApiError(409, "conflict");
  const [updated] = await db
    .update(equipmentLoans)
    .set({ returnedAt: new Date() })
    .where(eq(equipmentLoans.id, loanId))
    .returning();
  await appendMovement(db, loan.itemId, {
    kind: "return",
    delta: loan.quantity,
    loanId,
    personId: loan.personId,
    createdBy: userId,
  });
  return updated ?? null;
}

export async function listLoans(db: Db, filter: ListLoansQuery): Promise<EquipmentLoan[]> {
  return db
    .select()
    .from(equipmentLoans)
    .where(
      and(
        filter.itemId ? eq(equipmentLoans.itemId, filter.itemId) : undefined,
        filter.personId ? eq(equipmentLoans.personId, filter.personId) : undefined,
        filter.teamId ? eq(equipmentLoans.teamId, filter.teamId) : undefined,
        filter.open ? isNull(equipmentLoans.returnedAt) : undefined,
      ),
    )
    .orderBy(desc(equipmentLoans.loanedAt), desc(equipmentLoans.id))
    .limit(200);
}
