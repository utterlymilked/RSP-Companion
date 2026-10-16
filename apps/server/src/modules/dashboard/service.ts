import { and, count, eq, gte, isNull, lt, ne } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { expiringDocuments } from "../documents/service.js";
import { equipmentLoans } from "../equipment/schema.js";
import { listItems } from "../equipment/service.js";
import { events } from "../events/schema.js";
import { overdueReport } from "../fees/service.js";
import { incidents } from "../incidents/schema.js";
import { privacyRequests } from "../privacy/schema.js";

export const UPCOMING_DAYS = 7;
export const EXPIRY_DAYS = 30;

/** One count per widget; a widget is present only when the principal may see it. */
export interface DashboardWidgets {
  upcomingEvents?: { count: number; days: number };
  overdueFees?: { people: number; balanceCents: number };
  lowStock?: { count: number };
  openLoans?: { count: number };
  openIncidents?: { count: number };
  expiringDocuments?: { count: number; days: number };
  openPrivacyRequests?: { count: number };
}

export interface DashboardAccess {
  events: boolean;
  fees: boolean;
  equipment: boolean;
  incidents: boolean;
  documents: boolean;
  privacy: boolean;
}

/** Club-wide counts for the widgets `access` allows. Scoped roles get no club totals. */
export async function dashboardWidgets(
  db: Db,
  access: DashboardAccess,
  today: string,
  now = new Date(),
): Promise<DashboardWidgets> {
  const out: DashboardWidgets = {};
  if (access.events) {
    const to = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);
    const [row] = await db
      .select({ n: count() })
      .from(events)
      .where(
        and(gte(events.startsAt, now), lt(events.startsAt, to), ne(events.status, "cancelled")),
      );
    out.upcomingEvents = { count: row?.n ?? 0, days: UPCOMING_DAYS };
  }
  if (access.fees) {
    const overdue = await overdueReport(db, today);
    out.overdueFees = {
      people: overdue.length,
      balanceCents: overdue.reduce((sum, r) => sum + r.balanceCents, 0),
    };
  }
  if (access.equipment) {
    out.lowStock = { count: (await listItems(db, { low: true, includeInactive: false })).length };
    const [row] = await db
      .select({ n: count() })
      .from(equipmentLoans)
      .where(isNull(equipmentLoans.returnedAt));
    out.openLoans = { count: row?.n ?? 0 };
  }
  if (access.incidents) {
    const [row] = await db
      .select({ n: count() })
      .from(incidents)
      .where(ne(incidents.status, "closed"));
    out.openIncidents = { count: row?.n ?? 0 };
  }
  if (access.documents) {
    const docs = await expiringDocuments(db, { today, days: EXPIRY_DAYS });
    out.expiringDocuments = { count: docs.length, days: EXPIRY_DAYS };
  }
  if (access.privacy) {
    const [row] = await db
      .select({ n: count() })
      .from(privacyRequests)
      .where(eq(privacyRequests.status, "open"));
    out.openPrivacyRequests = { count: row?.n ?? 0 };
  }
  return out;
}
