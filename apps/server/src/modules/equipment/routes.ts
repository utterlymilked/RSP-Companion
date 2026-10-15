import {
  createEquipmentItemSchema,
  createLoanSchema,
  createStockMovementSchema,
  listEquipmentItemsQuerySchema,
  listLoansQuerySchema,
  updateEquipmentItemSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import {
  createItem,
  createLoan,
  getItem,
  listItems,
  listLoans,
  listMovements,
  recordMovement,
  returnLoan,
  updateItem,
} from "./service.js";

const itemParam = z.object({ itemId: z.uuid() });
const loanParam = z.object({ loanId: z.uuid() });

/**
 * /api/equipment: the economato. Club-wide and general tier (no personal data beyond ids),
 * so permissions are not scoped: `equipment.read` to look, `equipment.write` to change.
 */
export const equipmentRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get(
      "/items",
      requirePermission("equipment.read"),
      validate("query", listEquipmentItemsQuerySchema),
      async (c) => c.json({ items: await listItems(db, c.req.valid("query")) }),
    )
    .post(
      "/items",
      requirePermission("equipment.write"),
      validate("json", createEquipmentItemSchema),
      async (c) => {
        const item = await writeOrApiError(db, (tx) => createItem(tx, c.req.valid("json")));
        return c.json({ item: { ...item, stock: 0, low: 0 <= item.minStock } }, 201);
      },
    )
    .get(
      "/items/:itemId",
      requirePermission("equipment.read"),
      validate("param", itemParam),
      async (c) => {
        const { itemId } = c.req.valid("param");
        const item = await getItem(db, itemId);
        if (!item) throw notFound();
        return c.json({ item, movements: await listMovements(db, itemId) });
      },
    )
    .patch(
      "/items/:itemId",
      requirePermission("equipment.write"),
      validate("param", itemParam),
      validate("json", updateEquipmentItemSchema),
      async (c) => {
        const { itemId } = c.req.valid("param");
        const updated = await writeOrApiError(db, (tx) =>
          updateItem(tx, itemId, c.req.valid("json")),
        );
        const item = updated && (await getItem(db, itemId));
        if (!item) throw notFound();
        return c.json({ item });
      },
    )
    .post(
      "/items/:itemId/movements",
      requirePermission("equipment.write"),
      validate("param", itemParam),
      validate("json", createStockMovementSchema),
      async (c) => {
        const { itemId } = c.req.valid("param");
        const userId = principalOf(c).userId;
        const movement = await writeOrApiError(db, (tx) =>
          recordMovement(tx, itemId, c.req.valid("json"), userId),
        );
        return c.json({ movement, item: await getItem(db, itemId) }, 201);
      },
    )
    .get(
      "/loans",
      requirePermission("equipment.read"),
      validate("query", listLoansQuerySchema),
      async (c) => c.json({ loans: await listLoans(db, c.req.valid("query")) }),
    )
    .post(
      "/loans",
      requirePermission("equipment.write"),
      validate("json", createLoanSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const loan = await writeOrApiError(db, (tx) => createLoan(tx, c.req.valid("json"), userId));
        return c.json({ loan }, 201);
      },
    )
    .post(
      "/loans/:loanId/return",
      requirePermission("equipment.write"),
      validate("param", loanParam),
      async (c) => {
        const userId = principalOf(c).userId;
        const loan = await writeOrApiError(db, (tx) =>
          returnLoan(tx, c.req.valid("param").loanId, userId),
        );
        if (!loan) throw notFound();
        return c.json({ loan });
      },
    );
