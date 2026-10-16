import {
  cancelChargeSchema,
  createChargeFromSaleSchema,
  createChargeSchema,
  createChargesFromPlanSchema,
  createFeePlanSchema,
  createPaymentSchema,
  listChargesQuerySchema,
  listFeePlansQuerySchema,
  updateFeePlanSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import {
  cancelCharge,
  createCharge,
  createChargeFromSale,
  createChargesFromPlan,
  createPlan,
  getCharge,
  listCharges,
  listPayments,
  listPlans,
  overdueReport,
  recordPayment,
  updatePlan,
} from "./service.js";

const planParam = z.object({ planId: z.uuid() });
const chargeParam = z.object({ chargeId: z.uuid() });

/**
 * /api/fees: the ledger. Club-wide and finance-only (`fees.read` / `fees.write`: admin and
 * treasurer), so permissions are not scoped. Online payments (Multibanco, MB WAY) arrive
 * with M12b; for now payments are recorded by hand.
 */
export const feesRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get(
      "/plans",
      requirePermission("fees.read"),
      validate("query", listFeePlansQuerySchema),
      async (c) => c.json({ plans: await listPlans(db, c.req.valid("query")) }),
    )
    .post(
      "/plans",
      requirePermission("fees.write"),
      validate("json", createFeePlanSchema),
      async (c) => {
        const plan = await writeOrApiError(db, (tx) => createPlan(tx, c.req.valid("json")));
        return c.json({ plan }, 201);
      },
    )
    .patch(
      "/plans/:planId",
      requirePermission("fees.write"),
      validate("param", planParam),
      validate("json", updateFeePlanSchema),
      async (c) => {
        const plan = await writeOrApiError(db, (tx) =>
          updatePlan(tx, c.req.valid("param").planId, c.req.valid("json")),
        );
        if (!plan) throw notFound();
        return c.json({ plan });
      },
    )
    .get(
      "/charges",
      requirePermission("fees.read"),
      validate("query", listChargesQuerySchema),
      async (c) => c.json({ charges: await listCharges(db, c.req.valid("query")) }),
    )
    .post(
      "/charges",
      requirePermission("fees.write"),
      validate("json", createChargeSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const charge = await writeOrApiError(db, (tx) =>
          createCharge(tx, c.req.valid("json"), userId),
        );
        return c.json({ charge: await getCharge(db, charge.id) }, 201);
      },
    )
    .post(
      "/charges/from-plan",
      requirePermission("fees.write"),
      validate("json", createChargesFromPlanSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const created = await writeOrApiError(db, (tx) =>
          createChargesFromPlan(tx, c.req.valid("json"), userId),
        );
        return c.json({ created: created.length }, 201);
      },
    )
    .post(
      "/charges/from-sale",
      requirePermission("fees.write"),
      validate("json", createChargeFromSaleSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const { movementId, dueDate } = c.req.valid("json");
        const charge = await writeOrApiError(db, (tx) =>
          createChargeFromSale(tx, movementId, dueDate, userId),
        );
        return c.json({ charge: await getCharge(db, charge.id) }, 201);
      },
    )
    .get(
      "/charges/:chargeId",
      requirePermission("fees.read"),
      validate("param", chargeParam),
      async (c) => {
        const { chargeId } = c.req.valid("param");
        const charge = await getCharge(db, chargeId);
        if (!charge) throw notFound();
        return c.json({ charge, payments: await listPayments(db, chargeId) });
      },
    )
    .post(
      "/charges/:chargeId/payments",
      requirePermission("fees.write"),
      validate("param", chargeParam),
      validate("json", createPaymentSchema),
      async (c) => {
        const { chargeId } = c.req.valid("param");
        const userId = principalOf(c).userId;
        const payment = await writeOrApiError(db, (tx) =>
          recordPayment(tx, chargeId, c.req.valid("json"), userId),
        );
        return c.json({ payment, charge: await getCharge(db, chargeId) }, 201);
      },
    )
    .post(
      "/charges/:chargeId/cancel",
      requirePermission("fees.write"),
      validate("param", chargeParam),
      validate("json", cancelChargeSchema),
      async (c) => {
        const { chargeId } = c.req.valid("param");
        const cancelled = await writeOrApiError(db, (tx) =>
          cancelCharge(tx, chargeId, c.req.valid("json").reason),
        );
        if (!cancelled) throw notFound();
        return c.json({ charge: await getCharge(db, chargeId) });
      },
    )
    .get("/overdue", requirePermission("fees.read"), async (c) =>
      c.json({ overdue: await overdueReport(db) }),
    );
