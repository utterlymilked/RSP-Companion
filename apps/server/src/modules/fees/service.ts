import {
  type ChargeStatus,
  type CreateChargeInput,
  type CreateChargesFromPlanInput,
  type CreateFeePlanInput,
  type CreatePaymentInput,
  type ListChargesQuery,
  type ListFeePlansQuery,
  toLisbon,
  type UpdateFeePlanInput,
} from "@rsc/shared";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { equipmentItems, stockMovements } from "../equipment/schema.js";
import { persons } from "../people/schema.js";
import { type Charge, charges, type FeePlan, feePlans, type Payment, payments } from "./schema.js";

/** Today in Europe/Lisbon as `YYYY-MM-DD`. */
export function todayInLisbon(now = new Date()): string {
  const { year, month, day } = toLisbon(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const netCents = (c: Pick<Charge, "amountCents" | "discountCents">) =>
  c.amountCents - c.discountCents;

export function chargeStatus(
  c: Pick<Charge, "amountCents" | "discountCents" | "dueDate" | "cancelledAt">,
  paidCents: number,
  today: string,
): ChargeStatus {
  if (c.cancelledAt) return "cancelled";
  if (paidCents >= netCents(c)) return "paid";
  return c.dueDate < today ? "overdue" : "open";
}

export async function createPlan(db: Db, input: CreateFeePlanInput): Promise<FeePlan> {
  const [plan] = await db.insert(feePlans).values(input).returning();
  if (!plan) throw new Error("Insert returned no row");
  return plan;
}

export async function updatePlan(
  db: Db,
  planId: string,
  input: UpdateFeePlanInput,
): Promise<FeePlan | null> {
  const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) return getPlan(db, planId);
  const [plan] = await db.update(feePlans).set(values).where(eq(feePlans.id, planId)).returning();
  return plan ?? null;
}

export async function getPlan(db: Db, planId: string): Promise<FeePlan | null> {
  const [plan] = await db.select().from(feePlans).where(eq(feePlans.id, planId));
  return plan ?? null;
}

export async function listPlans(db: Db, filter: ListFeePlansQuery): Promise<FeePlan[]> {
  return db
    .select()
    .from(feePlans)
    .where(filter.seasonId ? eq(feePlans.seasonId, filter.seasonId) : undefined)
    .orderBy(asc(feePlans.name), asc(feePlans.id));
}

async function insertCharges(db: Db, rows: (typeof charges.$inferInsert)[]): Promise<Charge[]> {
  return db.insert(charges).values(rows).returning();
}

export async function createCharge(
  db: Db,
  input: CreateChargeInput,
  userId: string,
): Promise<Charge> {
  const [charge] = await insertCharges(db, [{ ...input, createdBy: userId }]);
  if (!charge) throw new Error("Insert returned no row");
  return charge;
}

/** One charge per person from a plan (404 for an unknown plan or person). */
export async function createChargesFromPlan(
  db: Db,
  input: CreateChargesFromPlanInput,
  userId: string,
): Promise<Charge[]> {
  const plan = await getPlan(db, input.planId);
  if (!plan) throw new ApiError(404, "not_found");
  const personIds = [...new Set(input.personIds)];
  return insertCharges(
    db,
    personIds.map((personId) => ({
      personId,
      planId: plan.id,
      kind: plan.kind,
      description: plan.name,
      amountCents: plan.amountCents,
      discountCents: input.discountCents,
      dueDate: input.dueDate,
      createdBy: userId,
    })),
  );
}

/**
 * Bills an economato sale: the buyer owes `quantity × unit price`. 404 for an unknown
 * movement, 409 `not_a_sale` for anything but a priced sale with a buyer, 409 when the
 * sale was already billed.
 */
export async function createChargeFromSale(
  db: Db,
  movementId: string,
  dueDate: string,
  userId: string,
): Promise<Charge> {
  const [sale] = await db
    .select({
      kind: stockMovements.kind,
      delta: stockMovements.delta,
      personId: stockMovements.personId,
      unitPriceCents: stockMovements.unitPriceCents,
      name: equipmentItems.name,
      size: equipmentItems.size,
    })
    .from(stockMovements)
    .innerJoin(equipmentItems, eq(equipmentItems.id, stockMovements.itemId))
    .where(eq(stockMovements.id, movementId));
  if (!sale) throw new ApiError(404, "not_found");
  if (sale.kind !== "sale" || !sale.personId || !sale.unitPriceCents || sale.unitPriceCents <= 0) {
    throw new ApiError(409, "not_a_sale");
  }
  const quantity = -sale.delta;
  const [charge] = await insertCharges(db, [
    {
      personId: sale.personId,
      stockMovementId: movementId,
      kind: "kit",
      description: `${quantity} × ${sale.name}${sale.size ? ` (${sale.size})` : ""}`,
      amountCents: quantity * sale.unitPriceCents,
      dueDate,
      createdBy: userId,
    },
  ]);
  if (!charge) throw new Error("Insert returned no row");
  return charge;
}

export interface ChargeView extends Charge {
  personName: string;
  netCents: number;
  paidCents: number;
  balanceCents: number;
  status: ChargeStatus;
}

// The outer table is named in raw SQL: Drizzle drops table prefixes in single-table selects.
const paidSql = sql<number>`coalesce((select sum(${payments.amountCents}) from ${payments} where ${payments.chargeId} = "charges"."id"), 0)::int`;

const toView = (
  row: Charge & { personName: string; paidCents: number },
  today: string,
): ChargeView => {
  const net = netCents(row);
  return {
    ...row,
    netCents: net,
    balanceCents: row.cancelledAt ? 0 : Math.max(net - row.paidCents, 0),
    status: chargeStatus(row, row.paidCents, today),
  };
};

const chargeSelect = (db: Db) =>
  db
    .select({ ...getTableColumns(charges), personName: persons.fullName, paidCents: paidSql })
    .from(charges)
    .innerJoin(persons, eq(persons.id, charges.personId));

export async function listCharges(
  db: Db,
  filter: ListChargesQuery,
  today = todayInLisbon(),
): Promise<ChargeView[]> {
  const rows = await chargeSelect(db)
    .where(filter.personId ? eq(charges.personId, filter.personId) : undefined)
    .orderBy(asc(charges.dueDate), desc(charges.createdAt), asc(charges.id))
    .limit(500);
  const views = rows.map((r) => toView(r, today));
  return filter.status ? views.filter((v) => v.status === filter.status) : views;
}

export async function getCharge(
  db: Db,
  chargeId: string,
  today = todayInLisbon(),
): Promise<ChargeView | null> {
  const [row] = await chargeSelect(db).where(eq(charges.id, chargeId));
  return row ? toView(row, today) : null;
}

export async function listPayments(db: Db, chargeId: string): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.chargeId, chargeId))
    .orderBy(asc(payments.receiptNumber));
}

/**
 * Records a payment after locking the charge, so two concurrent payments cannot together
 * exceed it. 404 unknown charge, 409 `charge_cancelled`, 409 `overpayment`.
 */
export async function recordPayment(
  db: Db,
  chargeId: string,
  input: CreatePaymentInput,
  userId: string,
  today = todayInLisbon(),
): Promise<Payment> {
  const [charge] = await db.select().from(charges).where(eq(charges.id, chargeId)).for("update");
  if (!charge) throw new ApiError(404, "not_found");
  if (charge.cancelledAt) throw new ApiError(409, "charge_cancelled");
  const [row] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(eq(payments.chargeId, chargeId));
  if ((row?.paid ?? 0) + input.amountCents > netCents(charge)) {
    throw new ApiError(409, "overpayment");
  }
  const [payment] = await db
    .insert(payments)
    .values({
      chargeId,
      amountCents: input.amountCents,
      method: input.method,
      paidOn: input.paidOn ?? today,
      note: input.note,
      createdBy: userId,
    })
    .returning();
  if (!payment) throw new Error("Insert returned no row");
  return payment;
}

/** Cancels a charge (kept on record). Null when unknown; 409 when already cancelled. */
export async function cancelCharge(
  db: Db,
  chargeId: string,
  reason: string | null,
): Promise<Charge | null> {
  const [charge] = await db.select().from(charges).where(eq(charges.id, chargeId)).for("update");
  if (!charge) return null;
  if (charge.cancelledAt) throw new ApiError(409, "conflict");
  const [updated] = await db
    .update(charges)
    .set({ cancelledAt: new Date(), cancelReason: reason })
    .where(eq(charges.id, chargeId))
    .returning();
  return updated ?? null;
}

export interface OverdueRow {
  personId: string;
  personName: string;
  chargeCount: number;
  balanceCents: number;
  oldestDueDate: string;
}

/** Overdue balances grouped by person, largest first. */
export async function overdueReport(db: Db, today = todayInLisbon()): Promise<OverdueRow[]> {
  const views = await listCharges(db, { status: "overdue" }, today);
  const byPerson = new Map<string, OverdueRow>();
  for (const v of views) {
    const row = byPerson.get(v.personId) ?? {
      personId: v.personId,
      personName: v.personName,
      chargeCount: 0,
      balanceCents: 0,
      oldestDueDate: v.dueDate,
    };
    row.chargeCount += 1;
    row.balanceCents += v.balanceCents;
    if (v.dueDate < row.oldestDueDate) row.oldestDueDate = v.dueDate;
    byPerson.set(v.personId, row);
  }
  return [...byPerson.values()].sort(
    (a, b) => b.balanceCents - a.balanceCents || a.personName.localeCompare(b.personName),
  );
}
