import {
  type ArchetypeKey,
  averageHeat,
  averageScores,
  type CreateProspectInput,
  type CreateProspectReportInput,
  groupOfPositions,
  type LinkSuggestion,
  type ListProspectsQuery,
  localDateString,
  nameSimilarity,
  normaliseName,
  overallScore,
  type PositionGroup,
  PROSPECT_RETENTION_MONTHS,
  rankArchetypes,
  type Scores,
  toLisbon,
  type UpdateProspectInput,
} from "@rsc/shared";
import { and, asc, desc, eq, getTableColumns, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { persons } from "../people/schema.js";
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

/** Reports averaged into a profile: the most recent ones, so progress shows. */
const PROFILE_REPORTS = 3;

export interface ProspectProfile {
  group: PositionGroup;
  scores: Scores;
  overall: number | null;
  /** Archetype in use: the manual choice, else the best computed fit. */
  archetype: ArchetypeKey | null;
  archetypes: { archetype: ArchetypeKey; fit: number }[];
  heat: number[] | null;
  reportCount: number;
}

export interface LinkedPerson {
  id: string;
  fullName: string;
  identityCode: string;
}

export type ProspectRow = Prospect & {
  expired: boolean;
  lastRating: number | null;
  profile: ProspectProfile;
  person: LinkedPerson | null;
};

const withExpired = (row: Prospect): Prospect & { expired: boolean } => ({
  ...row,
  expired: row.retainUntil < today(),
});

type ReportFacts = Pick<
  ProspectReport,
  "prospectId" | "observedOn" | "rating" | "scores" | "heat" | "createdAt"
>;

function profileOf(prospect: Prospect, reports: ReportFacts[]): ProspectProfile {
  const group = groupOfPositions(prospect.positions);
  const recent = [...reports]
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn) || +b.createdAt - +a.createdAt)
    .slice(0, PROFILE_REPORTS);
  const scores = averageScores(recent.map((r) => r.scores));
  const archetypes = rankArchetypes(scores, group);
  const grids = recent.map((r) => r.heat).filter((h): h is number[] => Array.isArray(h));
  return {
    group,
    scores,
    overall: overallScore(scores, group),
    archetype: prospect.archetype ?? archetypes[0]?.archetype ?? null,
    archetypes,
    heat: averageHeat(grids),
    reportCount: reports.length,
  };
}

async function rowsFor(db: Db, list: Prospect[]): Promise<ProspectRow[]> {
  if (list.length === 0) return [];
  const ids = list.map((p) => p.id);
  const reports = await db
    .select({
      prospectId: prospectReports.prospectId,
      observedOn: prospectReports.observedOn,
      rating: prospectReports.rating,
      scores: prospectReports.scores,
      heat: prospectReports.heat,
      createdAt: prospectReports.createdAt,
    })
    .from(prospectReports)
    .where(inArray(prospectReports.prospectId, ids));
  const personIds = list.map((p) => p.personId).filter((v): v is string => !!v);
  const people = personIds.length
    ? await db
        .select({ id: persons.id, fullName: persons.fullName, identityCode: persons.identityCode })
        .from(persons)
        .where(inArray(persons.id, personIds))
    : [];
  return list.map((p) => {
    const mine = reports.filter((r) => r.prospectId === p.id);
    const latest = [...mine].sort(
      (a, b) => b.observedOn.localeCompare(a.observedOn) || +b.createdAt - +a.createdAt,
    )[0];
    return {
      ...withExpired(p),
      lastRating: latest?.rating ?? null,
      profile: profileOf(p, mine),
      person: people.find((x) => x.id === p.personId) ?? null,
    };
  });
}

/** The birth year follows a full birth date when one is given. */
const yearOf = (birthDate: string | null | undefined) =>
  birthDate ? Number(birthDate.slice(0, 4)) : undefined;

interface LinkInput {
  nif?: string | null;
  personId?: string | null;
  confirmLink?: boolean;
}

/**
 * Works out the person link for a create or update (ADR 0021). A NIF that belongs to a person
 * forces the link, but only once the caller has confirmed the warning; a chosen person whose
 * NIF differs is refused.
 */
async function resolveLink(
  db: Db,
  input: LinkInput,
  current: Prospect | null,
): Promise<{ personId?: string | null }> {
  const nif = input.nif ?? undefined;
  if (nif) {
    const [match] = await db
      .select({ id: persons.id, fullName: persons.fullName, identityCode: persons.identityCode })
      .from(persons)
      .where(eq(persons.nif, nif));
    if (match) {
      if (input.personId && input.personId !== match.id) throw new ApiError(409, "nif_mismatch");
      if (!input.confirmLink && current?.personId !== match.id) {
        throw new ApiError(409, "link_confirmation_required", { person: match });
      }
      return { personId: match.id };
    }
  }
  if (input.personId) {
    const [person] = await db
      .select({ nif: persons.nif })
      .from(persons)
      .where(eq(persons.id, input.personId));
    if (!person) throw new ApiError(404, "not_found");
    if (person.nif && nif && person.nif !== nif) throw new ApiError(409, "nif_mismatch");
    return { personId: input.personId };
  }
  return input.personId === null ? { personId: null } : {};
}

export async function createProspect(
  db: Db,
  input: CreateProspectInput,
  userId: string,
): Promise<Prospect> {
  const { retainUntil, confirmLink: _confirm, personId: _person, ...fields } = input;
  const link = await resolveLink(db, input, null);
  const [prospect] = await db
    .insert(prospects)
    .values({
      ...fields,
      ...link,
      birthYear: yearOf(fields.birthDate) ?? fields.birthYear,
      retainUntil: retainUntil ?? defaultRetainUntil(),
      createdBy: userId,
    })
    .returning();
  if (!prospect) throw new Error("Insert returned no row");
  return prospect;
}

export async function updateProspect(
  db: Db,
  prospectId: string,
  input: UpdateProspectInput,
): Promise<Prospect | null> {
  const current = await getProspect(db, prospectId);
  if (!current) return null;
  const { confirmLink: _confirm, personId: _person, ...fields } = input;
  const linkTouched = input.nif !== undefined || input.personId !== undefined;
  const link = linkTouched ? await resolveLink(db, input, current) : {};
  const values = Object.fromEntries(
    Object.entries({
      ...fields,
      ...link,
      birthYear: yearOf(input.birthDate) ?? input.birthYear,
    }).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(values).length === 0) return current;
  const [prospect] = await db
    .update(prospects)
    .set(values)
    .where(eq(prospects.id, prospectId))
    .returning();
  return prospect ?? null;
}

export async function listProspects(db: Db, filter: ListProspectsQuery): Promise<ProspectRow[]> {
  const q = filter.q ? normaliseName(filter.q) : null;
  const list = await db
    .select(getTableColumns(prospects))
    .from(prospects)
    .where(
      and(
        filter.status ? eq(prospects.status, filter.status) : undefined,
        filter.escalao ? eq(prospects.targetEscalao, filter.escalao) : undefined,
        filter.expired ? lt(prospects.retainUntil, today()) : undefined,
        filter.link === "linked" ? sql`${prospects.personId} is not null` : undefined,
        filter.link === "unlinked" ? sql`${prospects.personId} is null` : undefined,
      ),
    )
    .orderBy(desc(prospects.updatedAt), asc(prospects.fullName))
    .limit(300);
  const rows = await rowsFor(db, list);
  return rows.filter(
    (r) =>
      (!q || normaliseName(`${r.fullName} ${r.currentClub ?? ""}`).includes(q)) &&
      (!filter.group || r.profile.group === filter.group) &&
      (!filter.archetype || r.profile.archetype === filter.archetype),
  );
}

export async function getProspect(db: Db, prospectId: string): Promise<Prospect | null> {
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
  return prospect ?? null;
}

export async function getProspectRow(db: Db, prospectId: string): Promise<ProspectRow | null> {
  const prospect = await getProspect(db, prospectId);
  return prospect ? ((await rowsFor(db, [prospect]))[0] ?? null) : null;
}

/** Overall rating 1-5 from attribute scores (mean of 1-10, halved, at least 1). */
const ratingFromScores = (scores: Scores): number | null => {
  const vals = Object.values(scores).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.min(5, Math.max(1, Math.round(mean / 2)));
};

export async function addReport(
  db: Db,
  prospectId: string,
  input: CreateProspectReportInput,
  userId: string,
): Promise<ProspectReport> {
  const scores = (input.scores ?? {}) as Scores;
  const rating = input.rating ?? ratingFromScores(scores);
  if (rating === null) throw new ApiError(400, "invalid_request");
  const [report] = await db
    .insert(prospectReports)
    .values({
      prospectId,
      observedOn: input.observedOn,
      text: input.text,
      rating,
      scores,
      positionPlayed: input.positionPlayed ?? null,
      heat: input.heat ?? null,
      authorId: userId,
    })
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

export const presentProspect = async (db: Db, prospect: Prospect): Promise<ProspectRow> =>
  (await rowsFor(db, [prospect]))[0] as ProspectRow;

/**
 * People the prospect may be: those with the same NIF first, then by name similarity (accents
 * and middle names ignored), with a bonus for the same birth year. Only general-tier fields
 * leave the server; the birth year is reported as a match flag, never its value.
 */
export async function linkSuggestions(
  db: Db,
  prospectId: string,
  query?: string,
): Promise<LinkSuggestion[]> {
  const prospect = await getProspect(db, prospectId);
  if (!prospect) throw new ApiError(404, "not_found");
  const name = query?.trim() || prospect.fullName;
  const candidates = await db
    .select({
      id: persons.id,
      fullName: persons.fullName,
      identityCode: persons.identityCode,
      birthDate: persons.birthDate,
      nif: persons.nif,
    })
    .from(persons);
  const out: LinkSuggestion[] = [];
  for (const c of candidates) {
    const byNif = !!prospect.nif && c.nif === prospect.nif;
    const yearMatch =
      !!c.birthDate &&
      !!prospect.birthYear &&
      Number(c.birthDate.slice(0, 4)) === prospect.birthYear;
    const similarity = nameSimilarity(name, c.fullName);
    const score = byNif ? 1 : Math.min(0.99, similarity + (yearMatch && !query ? 0.1 : 0));
    if (!byNif && similarity < 0.5) continue;
    out.push({
      personId: c.id,
      identityCode: c.identityCode,
      fullName: c.fullName,
      birthYearMatch: yearMatch,
      score: Math.round(score * 100) / 100,
      reason: byNif ? "nif" : "name",
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}
