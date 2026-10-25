import {
  type ArchetypeKey,
  averageHeat,
  averageScores,
  type CreateProspectInput,
  type CreateProspectReportInput,
  groupOfPositions,
  type LinkProspectInput,
  type LinkSuggestion,
  type ListProspectsQuery,
  localDateString,
  type MergeField,
  type MergeRow,
  nameSimilarity,
  normaliseName,
  overallScore,
  type PositionGroup,
  PROSPECT_RETENTION_MONTHS,
  rankArchetypes,
  type Scores,
  type TrialRequestInput,
  toLisbon,
  type UpdateProspectInput,
} from "@rsc/shared";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { athletes } from "../athletes/schema.js";
import {
  type AthleteFacts,
  cleanName,
  createAthlete,
  type FactsPatch,
  loadFacts,
  saveFacts,
} from "../athletes/service.js";
import { ensureClub } from "../clubs/service.js";
import {
  findPersonByIdentity,
  normaliseIdentity,
  type PersonalFacts,
  personalFactsOf,
  savePersonalFacts,
} from "../people/facts.js";
import { persons } from "../people/schema.js";
import { type ProspectCase, type ProspectReport, prospectReports, prospects } from "./schema.js";

/** A scouting case together with the athlete's current facts (ADR 0024). */
export type Prospect = ProspectCase & AthleteFacts;

/** The case columns of a prospect request body; everything else is athlete facts. */
const FACT_KEYS = [
  "fullName",
  "nickname",
  "birthDate",
  "birthYear",
  "heightCm",
  "dominantFoot",
  "nationality",
  "birthplace",
  "socialUrl",
  "mediaUrl",
  "nif",
  "positions",
  "position",
  "currentClub",
  "guardianPhone",
  "guardianEmail",
  "ownPhone",
  "ownEmail",
  "personId",
] as const;

/** Splits a request body into athlete facts and scouting-case columns. */
function split<T extends Record<string, unknown>>(input: T) {
  const facts: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const target = (FACT_KEYS as readonly string[]).includes(k) ? facts : rest;
    target[k] = v;
  }
  return { facts: facts as FactsPatch, rest };
}

/**
 * Scouting covers every athlete (ADR 0024): a club athlete has no pipeline case, so it gets a
 * neutral one that is never stored. Retention does not apply to it (`retainUntil` far away).
 */
function clubCase(a: { id: string; createdAt: Date; updatedAt: Date }): ProspectCase {
  return {
    id: a.id,
    status: "signed",
    notes: null,
    guardianName: null,
    guardianRelation: null,
    ownContact: null,
    targetEscalao: null,
    context: null,
    seasonsPlayed: null,
    motive: null,
    goal: null,
    idType: null,
    postalCode: null,
    area: null,
    preferredDate: null,
    alternativeDate: null,
    trialDate: null,
    trialVenue: null,
    clubAuthorisationNeeded: false,
    clubAuthorised: false,
    retainUntil: "9999-12-31",
    source: "scout",
    consentAt: null,
    archetype: null,
    createdBy: null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** Attaches the athlete facts to case rows (one query set for all of them). */
async function withFacts(db: Db, list: ProspectCase[]): Promise<Prospect[]> {
  const facts = await loadFacts(
    db,
    list.map((p) => p.id),
  );
  return list.flatMap((p) => {
    const f = facts.get(p.id);
    return f ? [{ ...p, ...f }] : [];
  });
}

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
  /** An athlete of the club with no scouting case: reports and evaluations only. */
  club: boolean;
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
  const caseIds = new Set(
    (await db.select({ id: prospects.id }).from(prospects).where(inArray(prospects.id, ids))).map(
      (r) => r.id,
    ),
  );
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
      club: !caseIds.has(p.id),
      lastRating: latest?.rating ?? null,
      profile: profileOf(p, mine),
      person: people.find((x) => x.id === p.personId) ?? null,
    };
  });
}

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
    const matchId = await findPersonByIdentity(db, "nif", nif);
    const [match] = matchId
      ? await db
          .select({
            id: persons.id,
            fullName: persons.fullName,
            identityCode: persons.identityCode,
          })
          .from(persons)
          .where(eq(persons.id, matchId))
      : [];
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
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, input.personId));
    if (!person) throw new ApiError(404, "not_found");
    const held = (await personalFactsOf(db, person.id)).nif;
    if (held && nif && normaliseIdentity(held) !== normaliseIdentity(nif)) {
      throw new ApiError(409, "nif_mismatch");
    }
    return { personId: input.personId };
  }
  return input.personId === null ? { personId: null } : {};
}

/**
 * Creates the athlete (same id) and its scouting case. The one place a prospect starts life:
 * the API, the public trial form and the demo data all come through here.
 */
export async function insertProspect(
  db: Db,
  input: {
    facts: FactsPatch;
    values: Record<string, unknown> & { retainUntil: string };
    source: "scout" | "request";
    createdBy: string | null;
  },
): Promise<Prospect> {
  if (!cleanName(input.facts.fullName)) throw new ApiError(400, "invalid_request");
  const [row] = await db
    .insert(prospects)
    .values({
      ...input.values,
      source: input.source,
      createdBy: input.createdBy,
    } as typeof prospects.$inferInsert)
    .returning();
  if (!row) throw new Error("Insert returned no row");
  await createAthlete(db, {
    id: row.id,
    source: input.source === "request" ? "public_form" : "scouting",
    retainUntil: row.retainUntil,
    createdBy: input.createdBy,
  });
  await saveFacts(db, row.id, input.facts);
  const [prospect] = await withFacts(db, [row]);
  if (!prospect) throw new Error("Athlete missing after insert");
  if (prospect.currentClub) await ensureClub(db, prospect.currentClub);
  return prospect;
}

export async function createProspect(
  db: Db,
  input: CreateProspectInput,
  userId: string,
): Promise<Prospect> {
  const { retainUntil, confirmLink: _confirm, personId: _person, ...fields } = input;
  const link = await resolveLink(db, input, null);
  const { facts, rest } = split(fields);
  return insertProspect(db, {
    facts: { ...facts, ...link },
    values: { ...rest, retainUntil: retainUntil ?? defaultRetainUntil() },
    source: "scout",
    createdBy: userId,
  });
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
  const { facts, rest } = split(fields);
  if (
    Object.keys(facts).length === 0 &&
    Object.keys(link).length === 0 &&
    Object.keys(rest).length === 0
  ) {
    return current;
  }
  if (facts.fullName !== undefined && !cleanName(facts.fullName)) {
    throw new ApiError(400, "invalid_request");
  }
  await saveFacts(db, prospectId, { ...facts, ...link });
  await db
    .update(prospects)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));
  if (typeof rest.retainUntil === "string") {
    await db
      .update(athletes)
      .set({ retainUntil: rest.retainUntil })
      .where(eq(athletes.id, prospectId));
  }
  const prospect = await getProspect(db, prospectId);
  if (prospect?.currentClub && input.currentClub) await ensureClub(db, prospect.currentClub);
  return prospect;
}

export async function listProspects(db: Db, filter: ListProspectsQuery): Promise<ProspectRow[]> {
  const q = filter.q ? normaliseName(filter.q) : null;
  const onlyCases =
    filter.source === "scout" ||
    filter.source === "request" ||
    filter.expired ||
    !!filter.escalao ||
    (!!filter.status && filter.status !== "signed");
  const cases =
    filter.source === "club"
      ? []
      : await db
          .select()
          .from(prospects)
          .where(
            and(
              filter.status ? eq(prospects.status, filter.status) : undefined,
              filter.escalao ? eq(prospects.targetEscalao, filter.escalao) : undefined,
              filter.source ? eq(prospects.source, filter.source) : undefined,
              filter.expired ? lt(prospects.retainUntil, today()) : undefined,
              filter.link === "linked"
                ? sql`exists (select 1 from athletes a where a.id = ${prospects.id} and a.person_id is not null)`
                : undefined,
              filter.link === "unlinked"
                ? sql`not exists (select 1 from athletes a where a.id = ${prospects.id} and a.person_id is not null)`
                : undefined,
            ),
          )
          .orderBy(desc(prospects.updatedAt))
          .limit(300);
  const clubOnes =
    onlyCases || filter.link === "unlinked"
      ? []
      : await db
          .select({ id: athletes.id, createdAt: athletes.createdAt, updatedAt: athletes.updatedAt })
          .from(athletes)
          .where(
            and(
              sql`${athletes.deletedAt} is null`,
              eq(athletes.status, "active"),
              sql`not exists (select 1 from prospects p where p.id = ${athletes.id})`,
            ),
          )
          .orderBy(desc(athletes.updatedAt))
          .limit(300);
  const list = (await withFacts(db, [...cases, ...clubOnes.map(clubCase)])).sort(
    (a, b) => +b.updatedAt - +a.updatedAt || a.fullName.localeCompare(b.fullName),
  );
  const rows = await rowsFor(db, list);
  return rows.filter(
    (r) =>
      (!q || normaliseName(`${r.fullName} ${r.currentClub ?? ""}`).includes(q)) &&
      (!filter.group || r.profile.group === filter.group) &&
      (!filter.archetype || r.profile.archetype === filter.archetype),
  );
}

export async function getProspect(db: Db, prospectId: string): Promise<Prospect | null> {
  const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
  if (row) return (await withFacts(db, [row]))[0] ?? null;
  const [athlete] = await db
    .select({ id: athletes.id, createdAt: athletes.createdAt, updatedAt: athletes.updatedAt })
    .from(athletes)
    .where(and(eq(athletes.id, prospectId), sql`${athletes.deletedAt} is null`));
  return athlete ? ((await withFacts(db, [clubCase(athlete)]))[0] ?? null) : null;
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
      kind: input.kind,
      recommendation: input.recommendation ?? null,
      details: input.details ?? {},
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
    })
    .from(persons);
  const nifHolder = prospect.nif ? await findPersonByIdentity(db, "nif", prospect.nif) : null;
  const out: LinkSuggestion[] = [];
  for (const c of candidates) {
    const byNif = nifHolder === c.id;
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

const EMAIL = /[^\s,;]+@[^\s,;]+\.[^\s,;]+/;
const PHONE = /\+?\d[\d ]{7,}\d/;

/** What each side holds for the fields they share; the prospect's contact line feeds both. */
function mergeValues(
  prospect: Prospect,
  person: typeof persons.$inferSelect,
  personFacts: PersonalFacts,
) {
  const contact = prospect.ownContact ?? "";
  const mine: Record<MergeField, string | null> = {
    fullName: prospect.fullName,
    birthDate: prospect.birthDate,
    nif: prospect.nif,
    email: prospect.ownEmail ?? contact.match(EMAIL)?.[0] ?? null,
    phone: prospect.ownPhone ?? contact.replace(EMAIL, "").match(PHONE)?.[0].trim() ?? null,
  };
  const theirs: Record<MergeField, string | null> = {
    fullName: person.fullName,
    birthDate: person.birthDate,
    nif: personFacts.nif,
    email: personFacts.email,
    phone: personFacts.phone,
  };
  return { mine, theirs };
}

const MERGE_ORDER: MergeField[] = ["fullName", "birthDate", "nif", "email", "phone"];

/** The fields where the prospect has a value the person lacks or holds differently. */
export async function mergePreview(
  db: Db,
  prospectId: string,
  personId: string,
): Promise<MergeRow[]> {
  const prospect = await getProspect(db, prospectId);
  if (!prospect) throw new ApiError(404, "not_found");
  const [person] = await db.select().from(persons).where(eq(persons.id, personId));
  if (!person) throw new ApiError(404, "not_found");
  const { mine, theirs } = mergeValues(prospect, person, await personalFactsOf(db, personId));
  return MERGE_ORDER.filter((f) => mine[f] && mine[f] !== theirs[f]).map((field) => ({
    field,
    prospect: mine[field],
    person: theirs[field],
  }));
}

/**
 * Links the prospect to a person and applies the merge: per field, the chosen side's value is
 * written to both records. Fields the user did not decide stay as they are. Writing to the
 * person is the caller's to authorise (`people.write`).
 */
export async function linkProspect(
  db: Db,
  prospectId: string,
  input: LinkProspectInput,
): Promise<Prospect> {
  const prospect = await getProspect(db, prospectId);
  if (!prospect) throw new ApiError(404, "not_found");
  const [person] = await db.select().from(persons).where(eq(persons.id, input.personId));
  if (!person) throw new ApiError(404, "not_found");
  const personFacts = await personalFactsOf(db, person.id);
  const { mine, theirs } = mergeValues(prospect, person, personFacts);

  const toPerson: Partial<Record<MergeField, string>> = {};
  const toProspect: { fullName?: string; birthDate?: string | null; nif?: string | null } = {};
  for (const field of MERGE_ORDER) {
    const choice = input.choices[field];
    if (!choice) continue;
    if (choice === "prospect" && mine[field]) toPerson[field] = mine[field];
    if (choice === "person") {
      if (field === "fullName" && theirs.fullName) toProspect.fullName = theirs.fullName;
      if (field === "birthDate") toProspect.birthDate = theirs.birthDate;
      if (field === "nif") toProspect.nif = theirs.nif;
    }
  }
  // A NIF the person gets must be free, and a person holding another one is a mismatch.
  const nif = toPerson.nif ?? toProspect.nif ?? prospect.nif;
  if (toPerson.nif) {
    const taken = await findPersonByIdentity(db, "nif", toPerson.nif);
    if (taken && taken !== person.id) throw new ApiError(409, "nif_in_use");
  }
  if (
    !input.confirmLink &&
    prospect.personId !== person.id &&
    nif &&
    personFacts.nif &&
    normaliseIdentity(personFacts.nif) === normaliseIdentity(nif)
  ) {
    throw new ApiError(409, "link_confirmation_required", {
      person: { fullName: person.fullName, identityCode: person.identityCode },
    });
  }
  const {
    nif: nifToPerson,
    email: emailToPerson,
    phone: phoneToPerson,
    ...columnsToPerson
  } = toPerson;
  if (Object.keys(columnsToPerson).length > 0) {
    await db.update(persons).set(columnsToPerson).where(eq(persons.id, person.id));
  }
  await savePersonalFacts(db, person.id, {
    ...(nifToPerson ? { nif: nifToPerson } : {}),
    ...(emailToPerson ? { email: emailToPerson } : {}),
    ...(phoneToPerson ? { phone: phoneToPerson } : {}),
  });
  const [holder] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(eq(athletes.personId, person.id));
  if (holder && holder.id !== prospectId) throw new ApiError(409, "person_already_linked");
  await saveFacts(db, prospectId, {
    personId: person.id,
    ...toProspect,
    ...(toPerson.birthDate ? { birthDate: toPerson.birthDate } : {}),
  });
  await db.update(prospects).set({ updatedAt: new Date() }).where(eq(prospects.id, prospectId));
  const linked = await getProspect(db, prospectId);
  if (!linked) throw new ApiError(404, "not_found");
  return linked;
}

/**
 * Stores a public trial request as a prospect with source `request`. Existing prospects are
 * never touched, so a stranger cannot change what the club already holds.
 */
export async function createTrialRequest(db: Db, input: TrialRequestInput): Promise<Prospect> {
  const { consent: _consent, website: _website, ...fields } = input;
  const { facts, rest } = split(fields);
  return insertProspect(db, {
    facts,
    values: {
      ...rest,
      status: "identified",
      consentAt: new Date(),
      retainUntil: defaultRetainUntil(),
    },
    source: "request",
    createdBy: null,
  });
}
