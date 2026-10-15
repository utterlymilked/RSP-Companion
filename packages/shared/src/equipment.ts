import { z } from "zod";
import { EQUIPMENT_CATEGORIES, STOCK_MOVEMENT_KINDS } from "./domain.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(100_000_00);

/** Body of POST /api/equipment/items. One item per size (a shirt in M and in L are two). */
export const createEquipmentItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(EQUIPMENT_CATEGORIES),
  size: optionalText(20),
  /** Sale price in cents, used by sales when no price is given. */
  priceCents: cents.nullish().transform((v) => v ?? null),
  /** Stock at or below this raises a low-stock alert. */
  minStock: z.number().int().min(0).max(100_000).default(0),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemSchema>;

export const updateEquipmentItemSchema = createEquipmentItemSchema
  .partial()
  .extend({ active: z.boolean().optional() });
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemSchema>;

export const listEquipmentItemsQuerySchema = z.object({
  category: z.enum(EQUIPMENT_CATEGORIES).optional(),
  /** `true` lists only items at or below their minimum stock. */
  low: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type ListEquipmentItemsQuery = z.infer<typeof listEquipmentItemsQuerySchema>;

/**
 * Body of POST /api/equipment/items/:id/movements. `quantity` is positive for receipts,
 * losses and sales (the kind sets the direction) and signed for adjustments. Loans and
 * returns have their own endpoints. A sale may name the buyer and a price (default: the
 * item's price); M12 turns sales into charges.
 */
export const createStockMovementSchema = z
  .object({
    kind: z.enum(STOCK_MOVEMENT_KINDS.filter((k) => k !== "loan" && k !== "return")),
    quantity: z.number().int().min(-100_000).max(100_000),
    personId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    unitPriceCents: cents.nullish().transform((v) => v ?? null),
    note: optionalText(500),
  })
  .refine((v) => v.quantity !== 0 && (v.kind === "adjustment" || v.quantity > 0), {
    path: ["quantity"],
  });
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;

/** Body of POST /api/equipment/loans: to one person or one team. */
export const createLoanSchema = z
  .object({
    itemId: z.uuid(),
    quantity: z.number().int().min(1).max(10_000),
    personId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    teamId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    dueDate: z.iso
      .date()
      .nullish()
      .transform((v) => v ?? null),
    note: optionalText(500),
  })
  .refine((v) => (v.personId === null) !== (v.teamId === null), { path: ["personId"] });
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const listLoansQuerySchema = z.object({
  itemId: z.uuid().optional(),
  personId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  /** `true` lists only loans not yet returned. */
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type ListLoansQuery = z.infer<typeof listLoansQuerySchema>;
