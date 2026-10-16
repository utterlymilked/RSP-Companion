import {
  CONSENT_AGE,
  CONSENT_KINDS,
  type ConsentKind,
  type CreatePrivacyRequestInput,
  type GrantConsentInput,
  type PrivacyRequestStatus,
  type ResolvePrivacyRequestInput,
} from "@rsc/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import type { Principal } from "../access/service.js";
import { audit } from "../audit/service.js";
import { roleAssignments, users } from "../auth/schema.js";
import { ageOn } from "../health/service.js";
import { guardianships, persons } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";
import { consents, type PrivacyRequest, privacyRequests } from "./schema.js";

const grantors = alias(persons, "grantors");

async function getPerson(db: Db, personId: string) {
  const [person] = await db
    .select({ id: persons.id, fullName: persons.fullName, birthDate: persons.birthDate })
    .from(persons)
    .where(eq(persons.id, personId));
  return person ?? null;
}

/** Under CONSENT_AGE on `today`; an unknown birth date counts as adult (as for health). */
const isMinor = (birthDate: string | null, today: string) =>
  birthDate !== null && ageOn(birthDate, today) < CONSENT_AGE;

/** Every consent kind of a person with its active grant (or null), or null without the person. */
export async function consentStatus(db: Db, personId: string, today: string) {
  const person = await getPerson(db, personId);
  if (!person) return null;
  const active = await db
    .select({
      kind: consents.kind,
      grantedOn: consents.grantedOn,
      grantedByPersonId: consents.grantedByPersonId,
      grantedByName: grantors.fullName,
    })
    .from(consents)
    .leftJoin(grantors, eq(grantors.id, consents.grantedByPersonId))
    .where(and(eq(consents.personId, personId), isNull(consents.revokedOn)));
  return {
    personId,
    minor: isMinor(person.birthDate, today),
    consents: CONSENT_KINDS.map((kind) => {
      const row = active.find((a) => a.kind === kind);
      return {
        kind,
        given: Boolean(row),
        grantedOn: row?.grantedOn ?? null,
        grantedByPersonId: row?.grantedByPersonId ?? null,
        grantedByName: row?.grantedByName ?? null,
      };
    }),
  };
}

/**
 * Records a consent. A minor's comes from one of their guardians (409 `not_a_guardian`), an
 * adult's from themself (409 `invalid_grantor`); a second active one of a kind is a 409.
 */
export async function grantConsent(
  db: Db,
  personId: string,
  input: GrantConsentInput,
  userId: string,
  today: string,
) {
  const person = await getPerson(db, personId);
  if (!person) throw new ApiError(404, "not_found");
  if (isMinor(person.birthDate, today)) {
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
  } else if (input.grantedByPersonId !== personId) {
    throw new ApiError(409, "invalid_grantor");
  }
  const [row] = await db
    .insert(consents)
    .values({ personId, ...input, recordedBy: userId })
    .returning();
  return row;
}

/** Withdraws the active consent of a kind; null when there is none. */
export async function revokeConsent(db: Db, personId: string, kind: ConsentKind, today: string) {
  const [row] = await db
    .update(consents)
    .set({ revokedOn: today })
    .where(
      and(eq(consents.personId, personId), eq(consents.kind, kind), isNull(consents.revokedOn)),
    )
    .returning();
  return row ?? null;
}

/** Current roster of a team with the consent kinds each athlete has given. */
export async function teamConsents(db: Db, teamId: string) {
  const roster = await db
    .select({ personId: persons.id, fullName: persons.fullName })
    .from(teamMembers)
    .innerJoin(persons, eq(persons.id, teamMembers.personId))
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftOn)))
    .orderBy(asc(persons.fullName));
  if (roster.length === 0) return [];
  const active = await db
    .select({ personId: consents.personId, kind: consents.kind })
    .from(consents)
    .where(
      and(
        inArray(
          consents.personId,
          roster.map((r) => r.personId),
        ),
        isNull(consents.revokedOn),
      ),
    );
  return roster.map((r) => ({
    ...r,
    given: active.filter((a) => a.personId === r.personId).map((a) => a.kind),
  }));
}

/** The principal's own person and their wards: whose data they can manage in the app. */
export async function subjectsOf(db: Db, principal: Principal) {
  if (!principal.personId) return [];
  const self = await getPerson(db, principal.personId);
  const wards = await db
    .select({ id: persons.id, fullName: persons.fullName })
    .from(guardianships)
    .innerJoin(persons, eq(persons.id, guardianships.childId))
    .where(eq(guardianships.guardianId, principal.personId))
    .orderBy(asc(persons.fullName));
  return [
    ...(self ? [{ id: self.id, fullName: self.fullName, relation: "self" as const }] : []),
    ...wards.map((w) => ({ ...w, relation: "ward" as const })),
  ];
}

export async function createRequest(db: Db, input: CreatePrivacyRequestInput, userId: string) {
  const [row] = await db
    .insert(privacyRequests)
    .values({ ...input, requestedBy: userId })
    .returning();
  return row as PrivacyRequest;
}

/** Requests, open first then newest; only the user's own when `requestedBy` is given. */
export async function listRequests(
  db: Db,
  filter: { status?: PrivacyRequestStatus; requestedBy?: string },
) {
  return db
    .select({
      id: privacyRequests.id,
      personId: privacyRequests.personId,
      personName: persons.fullName,
      kind: privacyRequests.kind,
      status: privacyRequests.status,
      message: privacyRequests.message,
      requestedBy: privacyRequests.requestedBy,
      requestedByName: users.name,
      createdAt: privacyRequests.createdAt,
      resolvedAt: privacyRequests.resolvedAt,
      resolutionNote: privacyRequests.resolutionNote,
    })
    .from(privacyRequests)
    .leftJoin(persons, eq(persons.id, privacyRequests.personId))
    .leftJoin(users, eq(users.id, privacyRequests.requestedBy))
    .where(
      and(
        filter.status ? eq(privacyRequests.status, filter.status) : undefined,
        filter.requestedBy ? eq(privacyRequests.requestedBy, filter.requestedBy) : undefined,
      ),
    )
    .orderBy(desc(eq(privacyRequests.status, "open")), desc(privacyRequests.createdAt))
    .limit(200);
}

/** Closes an open request (404 unknown, 409 already closed). */
export async function resolveRequest(
  db: Db,
  requestId: string,
  input: ResolvePrivacyRequestInput,
  userId: string,
) {
  const [existing] = await db
    .select({ status: privacyRequests.status })
    .from(privacyRequests)
    .where(eq(privacyRequests.id, requestId))
    .for("update");
  if (!existing) throw new ApiError(404, "not_found");
  if (existing.status !== "open") throw new ApiError(409, "conflict");
  const [row] = await db
    .update(privacyRequests)
    .set({
      status: input.status,
      resolutionNote: input.note,
      resolvedAt: new Date(),
      resolvedBy: userId,
    })
    .where(eq(privacyRequests.id, requestId))
    .returning();
  return row as PrivacyRequest;
}

/** Refuses (409 `last_admin`) when the given users hold every admin grant there is. */
export async function assertAdminRemains(db: Db, userIds: readonly string[]) {
  if (userIds.length === 0) return;
  const admins = await db
    .select({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .where(eq(roleAssignments.role, "admin"))
    .for("update");
  const leaving = admins.filter((a) => userIds.includes(a.userId));
  if (leaving.length > 0 && leaving.length === admins.length) {
    throw new ApiError(409, "last_admin");
  }
}

/**
 * Deletes the principal's own login (sessions, roles, inbox and devices go with it). The
 * person record is the club's and stays; with `eraseData` an erasure request for it is left
 * for the office. The last admin cannot leave.
 */
export async function deleteOwnAccount(db: Db, principal: Principal, eraseData: boolean) {
  await assertAdminRemains(db, [principal.userId]);
  const eraseRequested = eraseData && principal.personId !== null;
  if (eraseRequested && principal.personId) {
    await db.insert(privacyRequests).values({ personId: principal.personId, kind: "erasure" });
  }
  await audit(db, {
    actorUserId: null,
    action: "account.deleted",
    subjectPersonId: principal.personId,
    details: { eraseRequested },
  });
  await db.delete(users).where(eq(users.id, principal.userId));
}

/** Logins linked to a person. */
export async function loginsOf(db: Db, personId: string) {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.personId, personId));
  return rows.map((r) => r.id);
}
