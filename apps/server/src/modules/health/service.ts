import {
  type AvailabilityStatus,
  type CreateHealthNoteInput,
  type CreateInjuryInput,
  type GrantHealthConsentInput,
  HEALTH_CONSENT_AGE,
  type HealthDiscipline,
  type UpdateInjuryInput,
} from "@rsc/shared";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { guardianships, persons } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";
import {
  type HealthConsent,
  type HealthNote,
  healthConsents,
  healthNotes,
  type Injury,
  injuries,
} from "./schema.js";

/** Whole years between a `YYYY-MM-DD` birth date and `today`. */
export function ageOn(birthDate: string, today: string): number {
  const [by = 0, bm = 0, bd = 0] = birthDate.split("-").map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * Derived availability from a person's injuries: any open `unavailable` injury wins, then any
 * open `limited` one (including `return_to_play`), otherwise available. The only health
 * information coaches ever receive.
 */
export function deriveAvailability(
  open: readonly Pick<Injury, "status" | "availability">[],
): AvailabilityStatus {
  const current = open.filter((i) => i.status !== "cleared");
  if (current.some((i) => i.status === "active" && i.availability === "unavailable")) {
    return "unavailable";
  }
  return current.length > 0 ? "limited" : "available";
}

export async function getPerson(db: Db, personId: string) {
  const [person] = await db
    .select({ id: persons.id, fullName: persons.fullName, birthDate: persons.birthDate })
    .from(persons)
    .where(eq(persons.id, personId));
  return person ?? null;
}

export async function activeConsent(db: Db, personId: string): Promise<HealthConsent | null> {
  const [row] = await db
    .select()
    .from(healthConsents)
    .where(and(eq(healthConsents.personId, personId), isNull(healthConsents.revokedOn)));
  return row ?? null;
}

/** Whether `personId` is under the consent age on `today` (unknown birth date: not a minor). */
export function isMinor(person: { birthDate: string | null }, today: string): boolean {
  return person.birthDate !== null && ageOn(person.birthDate, today) < HEALTH_CONSENT_AGE;
}

/** Consent state for the screens: whether it is needed and whether it is in place. */
export async function consentStatus(db: Db, personId: string, today: string) {
  const person = await getPerson(db, personId);
  if (!person) return null;
  const consent = await activeConsent(db, personId);
  return {
    required: isMinor(person, today),
    grantedOn: consent?.grantedOn ?? null,
    grantedByPersonId: consent?.grantedByPersonId ?? null,
  };
}

/** Throws 409 `consent_required` when a minor has no active guardian consent. */
async function requireConsent(db: Db, personId: string, today: string) {
  const person = await getPerson(db, personId);
  if (!person) throw new ApiError(404, "not_found");
  if (isMinor(person, today) && !(await activeConsent(db, personId))) {
    throw new ApiError(409, "consent_required");
  }
}

export async function listNotes(
  db: Db,
  personId: string,
  disciplines: readonly HealthDiscipline[],
): Promise<HealthNote[]> {
  return db
    .select()
    .from(healthNotes)
    .where(
      and(eq(healthNotes.personId, personId), inArray(healthNotes.discipline, [...disciplines])),
    )
    .orderBy(desc(healthNotes.recordedOn), desc(healthNotes.createdAt));
}

export async function listInjuries(
  db: Db,
  personId: string,
  disciplines: readonly HealthDiscipline[],
): Promise<Injury[]> {
  return db
    .select()
    .from(injuries)
    .where(and(eq(injuries.personId, personId), inArray(injuries.discipline, [...disciplines])))
    .orderBy(desc(injuries.startedOn), desc(injuries.createdAt));
}

export async function createNote(
  db: Db,
  personId: string,
  input: CreateHealthNoteInput,
  userId: string,
  today: string,
): Promise<HealthNote> {
  await requireConsent(db, personId, today);
  const [row] = await db
    .insert(healthNotes)
    .values({ ...input, personId, authorUserId: userId })
    .returning();
  return row as HealthNote;
}

export async function createInjury(
  db: Db,
  personId: string,
  input: CreateInjuryInput,
  userId: string,
  today: string,
): Promise<Injury> {
  await requireConsent(db, personId, today);
  const [row] = await db
    .insert(injuries)
    .values({ ...input, personId, authorUserId: userId })
    .returning();
  return row as Injury;
}

export async function getInjury(db: Db, injuryId: string): Promise<Injury | null> {
  const [row] = await db.select().from(injuries).where(eq(injuries.id, injuryId));
  return row ?? null;
}

/**
 * Updates an injury. Return to play sets `limited` unless the caller says otherwise;
 * clearing records the date, and a cleared injury cannot be reopened (record a new one).
 */
export async function updateInjury(
  db: Db,
  injury: Injury,
  input: UpdateInjuryInput,
  today: string,
): Promise<Injury> {
  if (injury.status === "cleared") throw new ApiError(409, "conflict");
  const status = input.status ?? injury.status;
  const [row] = await db
    .update(injuries)
    .set({
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.expectedReturnOn !== undefined ? { expectedReturnOn: input.expectedReturnOn } : {}),
      status,
      availability:
        input.availability ?? (status === "return_to_play" ? "limited" : injury.availability),
      clearedOn: status === "cleared" ? today : null,
    })
    .where(eq(injuries.id, injury.id))
    .returning();
  return row as Injury;
}

/** Records guardian consent; the grantor must be a guardian of the person (409 otherwise). */
export async function grantConsent(
  db: Db,
  personId: string,
  input: GrantHealthConsentInput,
  userId: string,
): Promise<HealthConsent> {
  const [link] = await db
    .select({ id: guardianships.id })
    .from(guardianships)
    .where(
      and(
        eq(guardianships.childId, personId),
        eq(guardianships.guardianId, input.grantedByPersonId),
      ),
    );
  if (!link) throw new ApiError(409, "not_a_guardian");
  const [row] = await db
    .insert(healthConsents)
    .values({ personId, ...input, recordedBy: userId })
    .returning();
  return row as HealthConsent;
}

/** Ends the active consent. Existing records stay (retention and erasure are M17); new ones are refused. */
export async function revokeConsent(db: Db, personId: string, today: string) {
  const [row] = await db
    .update(healthConsents)
    .set({ revokedOn: today })
    .where(and(eq(healthConsents.personId, personId), isNull(healthConsents.revokedOn)))
    .returning();
  return row ?? null;
}

/** Availability of people, from their open injuries; people with none are `available`. */
export async function availabilityOf(db: Db, personIds: readonly string[]) {
  if (personIds.length === 0) return new Map<string, AvailabilityStatus>();
  const rows = await db
    .select({
      personId: injuries.personId,
      status: injuries.status,
      availability: injuries.availability,
    })
    .from(injuries)
    .where(and(inArray(injuries.personId, [...personIds]), ne(injuries.status, "cleared")));
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  return new Map(personIds.map((id) => [id, deriveAvailability(byPerson.get(id) ?? [])]));
}

/** Current members of the given teams (all teams when `teamIds` is null) with their status. */
export async function teamAvailability(db: Db, teamIds: readonly string[] | null) {
  const members = await db
    .selectDistinct({ personId: teamMembers.personId, fullName: persons.fullName })
    .from(teamMembers)
    .innerJoin(persons, eq(persons.id, teamMembers.personId))
    .where(
      and(
        isNull(teamMembers.leftOn),
        teamIds ? inArray(teamMembers.teamId, [...teamIds]) : undefined,
      ),
    )
    .orderBy(asc(persons.fullName));
  const status = await availabilityOf(
    db,
    members.map((m) => m.personId),
  );
  return members.map((m) => ({ ...m, status: status.get(m.personId) ?? "available" }));
}
