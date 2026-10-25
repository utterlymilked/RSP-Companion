import {
  type CreatePersonInput,
  type ListPeopleQuery,
  type PersonField,
  personFieldsUpTo,
  type UpdatePersonInput,
} from "@rsc/shared";
import { and, asc, eq, exists, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ownerUserOf } from "../auth/owner.js";
import { classMembers, teamMembers } from "../teams/schema.js";
import { loadPersonalFacts, personalFactsOf, savePersonalFacts } from "./facts.js";
import {
  type Guardianship,
  guardianships,
  type Membership,
  memberships,
  type NewGuardianship,
  persons,
} from "./schema.js";

type PersonColumns = { [K in PersonField]: (typeof persons)[K] };

/**
 * Select object for the columns of `persons` a reader of `tier` may see, e.g.
 * `db.select(personColumns("general")).from(persons)`. Keeps personal data out of queries
 * that do not need it; M2 picks the tier from the caller's role.
 */
export function personColumns(tier: "general" | "personal"): Partial<PersonColumns> {
  const columns: Partial<Record<PersonField, unknown>> = {};
  for (const field of personFieldsUpTo(tier)) columns[field] = persons[field];
  return columns as Partial<PersonColumns>;
}

/**
 * Links a guardian to a child. When `isPrimary` is set, the child's previous primary
 * guardian (encarregado de educação) stops being primary.
 */
export async function addGuardian(db: Db, input: NewGuardianship): Promise<Guardianship> {
  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(guardianships)
        .set({ isPrimary: false })
        .where(and(eq(guardianships.childId, input.childId), eq(guardianships.isPrimary, true)));
    }
    const [row] = await tx.insert(guardianships).values(input).returning();
    if (!row) throw new Error("Insert returned no row");
    return row;
  });
}

/**
 * Guardians of a child with the columns of `tier` for each guardian (general: names;
 * personal: plus contacts), primary first.
 */
export async function guardiansOf(
  db: Db,
  childId: string,
  tier: "general" | "personal" = "general",
) {
  const rows = await db.query.guardianships.findMany({
    where: eq(guardianships.childId, childId),
    with: {
      guardian: { columns: Object.fromEntries(personFieldsUpTo(tier).map((f) => [f, true])) },
    },
  });
  const facts =
    tier === "personal"
      ? await loadPersonalFacts(
          db,
          rows.map((r) => r.guardian.id),
        )
      : null;
  return rows
    .map((r) => ({ ...r, guardian: { ...r.guardian, ...facts?.get(r.guardian.id) } }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

/** One person with only the columns of `tier`, or undefined when there is no such person. */
export async function getPerson(db: Db, personId: string, tier: "general" | "personal") {
  const [row] = await db.select(personColumns(tier)).from(persons).where(eq(persons.id, personId));
  if (!row) return row;
  return tier === "personal" ? { ...row, ...(await personalFactsOf(db, personId)) } : row;
}

/** Escapes `%`, `_` and `\\` so user input matches literally in ILIKE. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Lists people (general tier only), by name. `scope` limits the list to people on the given
 * teams and classes (for scoped roles); `null` means everyone.
 */
export async function listPeople(
  db: Db,
  query: ListPeopleQuery,
  scope: { teamIds: readonly string[]; classIds: readonly string[] } | null,
) {
  const onTeam = (teamIds: readonly string[]) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.personId, persons.id),
            isNull(teamMembers.leftOn),
            inArray(teamMembers.teamId, [...teamIds]),
          ),
        ),
    );
  const inClass = (classIds: readonly string[]) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(classMembers)
        .where(
          and(
            eq(classMembers.personId, persons.id),
            isNull(classMembers.leftOn),
            inArray(classMembers.classId, [...classIds]),
          ),
        ),
    );
  const filters: (SQL | undefined)[] = [];
  if (scope) {
    const parts = [
      scope.teamIds.length > 0 ? onTeam(scope.teamIds) : undefined,
      scope.classIds.length > 0 ? inClass(scope.classIds) : undefined,
    ].filter((p): p is SQL => p !== undefined);
    // A scoped reader with no teams or classes sees nobody.
    filters.push(parts.length > 0 ? or(...parts) : sql`false`);
  }
  if (query.teamId) filters.push(onTeam([query.teamId]));
  if (query.classId) filters.push(inClass([query.classId]));
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(or(ilike(persons.fullName, pattern), ilike(persons.displayName, pattern)));
  }
  return db
    .select({
      id: persons.id,
      fullName: persons.fullName,
      displayName: persons.displayName,
      sex: persons.sex,
    }) // general tier only; the list test fails if a personal field slips in
    .from(persons)
    .where(and(...filters))
    .orderBy(asc(persons.fullName), asc(persons.id))
    .limit(query.limit)
    .offset(query.offset);
}

export async function createPerson(db: Db, input: CreatePersonInput) {
  const { email, phone, federationId, nif, ...columns } = input;
  const [row] = await db.insert(persons).values(columns).returning();
  if (!row) throw new Error("Insert returned no row");
  await savePersonalFacts(db, row.id, { email, phone, federationId, nif });
  return { ...row, ...(await personalFactsOf(db, row.id)) };
}

/** Updates the fields given; returns the new row, or undefined when there is no such person. */
export async function updatePerson(db: Db, personId: string, input: UpdatePersonInput) {
  // Giving a pseudonymous player a real name claims the identity: same code, no longer an alias.
  const { email, phone, federationId, nif, ...columns } = input;
  const values = input.fullName ? { ...columns, isPseudonymous: false } : columns;
  const [row] =
    Object.keys(values).length > 0
      ? await db.update(persons).set(values).where(eq(persons.id, personId)).returning()
      : await db.select().from(persons).where(eq(persons.id, personId));
  if (!row) return row;
  await savePersonalFacts(db, personId, { email, phone, federationId, nif });
  return { ...row, ...(await personalFactsOf(db, personId)) };
}

/** Removes the guardian link; returns false when there was none. */
export async function removeGuardian(db: Db, childId: string, guardianId: string) {
  const rows = await db
    .delete(guardianships)
    .where(and(eq(guardianships.childId, childId), eq(guardianships.guardianId, guardianId)))
    .returning({ id: guardianships.id });
  return rows.length > 0;
}

export async function membershipsOf(db: Db, personId: string): Promise<Membership[]> {
  return db
    .select()
    .from(memberships)
    .where(eq(memberships.personId, personId))
    .orderBy(asc(memberships.startedOn));
}

/**
 * The facets of one identity (ADR 0015): its code, whether it is an alias, the player profile,
 * current teams and whether a login is linked. General tier only: no contact or health data.
 */
export async function identityOf(db: Db, personId: string) {
  const person = await db.query.persons.findFirst({
    where: eq(persons.id, personId),
    columns: { id: true, identityCode: true, isPseudonymous: true },
    with: {
      player: { columns: { position: true, dominantFoot: true } },
      teamMemberships: {
        where: (t, { isNull }) => isNull(t.leftOn),
        columns: { teamId: true, shirtNumber: true },
      },
      staffAssignments: { columns: { function: true, teamId: true, classId: true } },
    },
  });
  if (!person) return undefined;
  const loginId = await ownerUserOf(db, personId);
  const { player, teamMemberships, staffAssignments, ...identity } = person;
  return {
    ...identity,
    player: player ?? null,
    teams: teamMemberships,
    staff: staffAssignments,
    hasLogin: Boolean(loginId),
  };
}
