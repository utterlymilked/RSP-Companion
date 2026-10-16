import { z } from "zod";
import { CHARGE_STATUSES, FEE_KINDS, PAYMENT_METHODS } from "./domain.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const positiveCents = z.number().int().min(1).max(100_000_00);
const nullableUuid = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

/** Body of POST /api/fees/plans: an amount the club charges, per season (and escalão). */
export const createFeePlanSchema = z.object({
  seasonId: z.uuid(),
  ageGroupId: nullableUuid,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(FEE_KINDS),
  amountCents: positiveCents,
});
export type CreateFeePlanInput = z.infer<typeof createFeePlanSchema>;

export const updateFeePlanSchema = createFeePlanSchema
  .pick({ name: true, amountCents: true })
  .partial()
  .extend({ active: z.boolean().optional() });
export type UpdateFeePlanInput = z.infer<typeof updateFeePlanSchema>;

export const listFeePlansQuerySchema = z.object({ seasonId: z.uuid().optional() });
export type ListFeePlansQuery = z.infer<typeof listFeePlansQuerySchema>;

const discount = z.number().int().min(0).max(100_000_00).default(0);

/** Body of POST /api/fees/charges: one charge for one person. */
export const createChargeSchema = z
  .object({
    personId: z.uuid(),
    planId: nullableUuid,
    kind: z.enum(FEE_KINDS),
    description: z.string().trim().min(1).max(200),
    amountCents: positiveCents,
    /** Taken off the amount; the person owes `amountCents - discountCents`. */
    discountCents: discount,
    dueDate: z.iso.date(),
  })
  .refine((v) => v.discountCents < v.amountCents, { path: ["discountCents"] });
export type CreateChargeInput = z.infer<typeof createChargeSchema>;

/** Body of POST /api/fees/charges/from-plan: the plan's charge for several people at once. */
export const createChargesFromPlanSchema = z.object({
  planId: z.uuid(),
  personIds: z.array(z.uuid()).min(1).max(500),
  dueDate: z.iso.date(),
  discountCents: discount,
});
export type CreateChargesFromPlanInput = z.infer<typeof createChargesFromPlanSchema>;

/** Body of POST /api/fees/charges/from-sale: bills a kit sale recorded in the economato. */
export const createChargeFromSaleSchema = z.object({
  movementId: z.uuid(),
  dueDate: z.iso.date(),
});
export type CreateChargeFromSaleInput = z.infer<typeof createChargeFromSaleSchema>;

export const listChargesQuerySchema = z.object({
  personId: z.uuid().optional(),
  status: z.enum(CHARGE_STATUSES).optional(),
});
export type ListChargesQuery = z.infer<typeof listChargesQuerySchema>;

/** Body of POST /api/fees/charges/:id/payments. `paidOn` defaults to today (Lisbon). */
export const createPaymentSchema = z.object({
  amountCents: positiveCents,
  method: z.enum(PAYMENT_METHODS),
  paidOn: z.iso
    .date()
    .nullish()
    .transform((v) => v ?? null),
  note: optionalText(500),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const cancelChargeSchema = z.object({ reason: optionalText(500) });
export type CancelChargeInput = z.infer<typeof cancelChargeSchema>;
