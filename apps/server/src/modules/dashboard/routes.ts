import { hasPermission } from "@rsc/shared";
import { Hono } from "hono";
import { forbidden } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { principalOf } from "../access/middleware.js";
import { readScope } from "../access/service.js";
import { expiringDocuments } from "../documents/service.js";
import { listItems } from "../equipment/service.js";
import { overdueReport, todayInLisbon } from "../fees/service.js";
import { euros, toCsv } from "./csv.js";
import { dashboardWidgets, EXPIRY_DAYS } from "./service.js";

/**
 * /api/dashboard: club-wide counts for the home screen and CSV exports (ADR 0013). Every
 * widget and export needs the same permission as the screens behind it, club-wide: a coach
 * with a team-scoped grant gets no club totals. Exports are plain CSV downloads of data the
 * caller can already list; none contains health data.
 */
export const dashboardRoutes = ({ db }: AppDeps) => {
  const csv = (name: string, body: string) =>
    new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const principal = principalOf(c);
      const has = (permission: Parameters<typeof readScope>[1]) =>
        readScope(principal, permission) === "all";
      const widgets = await dashboardWidgets(
        db,
        {
          events: has("events.read"),
          fees: has("fees.read"),
          equipment: has("equipment.read"),
          incidents: has("incidents.manage"),
          documents: has("documents.read"),
          privacy: has("privacy.manage"),
        },
        todayInLisbon(),
      );
      return c.json({ widgets });
    })
    .get("/export/overdue-fees.csv", async (c) => {
      if (!hasPermission(principalOf(c).grants, "fees.read")) throw forbidden();
      const rows = await overdueReport(db);
      return csv(
        "overdue-fees.csv",
        toCsv(
          ["person", "overdue_charges", "balance_eur", "oldest_due_date"],
          rows.map((r) => [r.personName, r.chargeCount, euros(r.balanceCents), r.oldestDueDate]),
        ),
      );
    })
    .get("/export/stock.csv", async (c) => {
      if (!hasPermission(principalOf(c).grants, "equipment.read")) throw forbidden();
      const items = await listItems(db, { low: false, includeInactive: false });
      return csv(
        "stock.csv",
        toCsv(
          ["item", "category", "size", "stock", "minimum", "low"],
          items.map((i) => [i.name, i.category, i.size, i.stock, i.minStock, i.low ? "yes" : "no"]),
        ),
      );
    })
    .get("/export/expiring-documents.csv", async (c) => {
      if (readScope(principalOf(c), "documents.read") !== "all") throw forbidden();
      const rows = await expiringDocuments(db, { today: todayInLisbon(), days: EXPIRY_DAYS });
      return csv(
        "expiring-documents.csv",
        toCsv(
          ["person", "kind", "expires_on", "status"],
          rows.map((r) => [r.fullName, r.kind, r.expiresOn, r.status]),
        ),
      );
    });
};
