import {
  type CreateProspectInput,
  type CreateProspectReportInput,
  type ListProspectsQuery,
  localDateString,
  PROSPECT_RETENTION_MONTHS,
  toLisbon,
  type UpdateProspectInput,
} from "@rsc/shared";
import { and, asc, desc, eq, getTableColumns, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { type Prospect, type ProspectReport, prospectReports, prospects } from "./schema.js";

/** Today's date in Lisbon, `YYYY-MM-DD`. */
export const today = (now = new Date()) => localDateString(toLisbon(now));

/** The default retention date: PROSPECT_RETENTION_MONTHS after `from`. */
export function defaultRetainUntil(from = new Date()): string {
  const d = toLisbon(from);
  const index = d.year * 12 + (d.month - 1) + PROSPECT_RETENTION_MONTHS;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return localDateString({ ...d, year, month, day: Math.min(d.day, lastDay) });
}

export type ProspectRow = Prospect & { expired: boolean; lastRating: number | null };

const withExpired = (row: Prospect & { lastRating: number | null }): ProspectRow => ({
  ...row,
  expired: row.retainUntil < today(),
});

export async function createProspect(
  db: Db,
  input: CreateProspectInput,
  userId: string,
): Promise<Prospect> {
  const { retainUntil, ...fields } = input;
  const [prospect] = await db
    .insert(prospects)
    .values({ ...fields, retainUntil: retainUntil ?? defaultRetainUntil(), createdBy: userId })
    .returning();
  if (!prospect) throw new Error("Insert returned no row");
  return prospect;
}

export async function updateProspect(
  db: Db,
  prospectId: string,
  input: UpdateProspectInput,
): Promise<Prospect | null> {
  const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) return getProspect(db, prospectId);
  const [prospect] = await db
    .update(prospects)
    .set(values)
    .where(eq(prospects.id, prospectId))
    .returning();
  return prospect ?? null;
}

const lastRatingSql = sql<
  number | null
>`(select r.rating from ${prospectReports} r where r.prospect_id = "prospects"."id" order by r.observed_on desc, r.created_at desc limit 1)`;

export async function listProspects(db: Db, filter: ListProspectsQuery): Promise<ProspectRow[]> {
  const rows = await db
    .select({ ...getTableColumns(prospects), lastRating: lastRatingSql })
    .from(prospects)
    .where(
      and(
        filter.status ? eq(prospects.status, filter.status) : undefined,
        filter.expired ? lt(prospects.retainUntil, today()) : undefined,
      ),
    )
    .orderBy(desc(prospects.updatedAt), asc(prospects.fullName))
    .limit(300);
  return rows.map(withExpired);
}

export async function getProspect(db: Db, prospectId: string): Promise<Prospect | null> {
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
  return prospect ?? null;
}

export async function addReport(
  db: Db,
  prospectId: string,
  input: CreateProspectReportInput,
  userId: string,
): Promise<ProspectReport> {
  const [report] = await db
    .insert(prospectReports)
    .values({ ...input, prospectId, authorId: userId })
    .returning();
  if (!report) throw new Error("Insert returned no row");
  return report;
}

export async function listReports(db: Db, prospectId: string): Promise<ProspectReport[]> {
  return db
    .select()
    .from(prospectReports)
    .where(eq(prospectReports.prospectId, prospectId))
    .orderBy(desc(prospectReports.observedOn), desc(prospectReports.createdAt));
}

export const presentProspect = (prospect: Prospect): ProspectRow =>
  withExpired({ ...prospect, lastRating: null });
