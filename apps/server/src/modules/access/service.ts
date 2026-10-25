import {
  type AccessScope,
  type HealthDiscipline,
  hasPermission,
  healthPermission,
  type Permission,
  ROLE_PERMISSIONS,
  type RoleGrant,
} from "@rsc/shared";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { notFound } from "../../http/errors.js";
import { athletes } from "../athletes/schema.js";
import { audit } from "../audit/service.js";
import { ownerPersonOf } from "../auth/owner.js";
import { roleAssignments, users } from "../auth/schema.js";
import { guardianships } from "../people/schema.js";
import { classMembers, teamMembers } from "../teams/schema.js";

/** The signed-in user as authorization sees it: who they are and which roles they hold. */
export interface Principal {
  userId: string;
  email: string;
  name: string;
  personId: string | null;
  grants: RoleGrant[];
}

/** Loads the principal for a user id, or null when the user does not exist or is deactivated. */
export async function loadPrincipal(db: Db, userId: string): Promise<Principal | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deactivatedAt)));
  if (!user) return null;
  const grants = await db
    .select({
      role: roleAssignments.role,
      teamId: roleAssignments.teamId,
      classId: roleAssignments.classId,
    })
    .from(roleAssignments)
    .where(eq(roleAssignments.userId, userId));
  const personId = await ownerPersonOf(db, userId);
  return { userId: user.id, email: user.email, name: user.name, personId, grants };
}

/** Teams and classes a person currently belongs to, for checks by scoped roles. */
export async function personScope(db: Db, personId: string): Promise<AccessScope> {
  const [teamRows, classRows] = await Promise.all([
    db
      .select({ id: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.personId, personId), isNull(teamMembers.leftOn))),
    db
      .select({ id: classMembers.classId })
      .from(classMembers)
      .where(and(eq(classMembers.personId, personId), isNull(classMembers.leftOn))),
  ]);
  return { teamIds: teamRows.map((r) => r.id), classIds: classRows.map((r) => r.id) };
}

/**
 * Where an athlete plays: the teams and classes of the person behind them. An athlete with no
 * person (scouted, not registered) has no scope, so only club-wide grants reach them.
 */
export async function athleteScope(db: Db, athleteId: string): Promise<AccessScope> {
  const [athlete] = await db
    .select({ personId: athletes.personId })
    .from(athletes)
    .where(eq(athletes.id, athleteId));
  if (!athlete) throw notFound();
  return athlete.personId ? personScope(db, athlete.personId) : { teamIds: [], classIds: [] };
}

/**
 * Ids of the athletes the principal may see through a scoped grant of `permission`: those whose
 * person is currently in one of the grant's teams or classes. Club-wide grants are not handled
 * here (callers check those first).
 */
export async function athleteIdsInScope(
  db: Db,
  grants: readonly RoleGrant[],
  permission: Permission,
): Promise<string[]> {
  const held = grants.filter((g) => ROLE_PERMISSIONS[g.role].includes(permission));
  const teamIds = held.flatMap((g) => (g.teamId ? [g.teamId] : []));
  const classIds = held.flatMap((g) => (g.classId ? [g.classId] : []));
  if (teamIds.length === 0 && classIds.length === 0) return [];
  const rows = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(
        isNull(athletes.deletedAt),
        or(
          teamIds.length > 0
            ? inArray(
                athletes.personId,
                db
                  .select({ p: teamMembers.personId })
                  .from(teamMembers)
                  .where(and(inArray(teamMembers.teamId, teamIds), isNull(teamMembers.leftOn))),
              )
            : undefined,
          classIds.length > 0
            ? inArray(
                athletes.personId,
                db
                  .select({ p: classMembers.personId })
                  .from(classMembers)
                  .where(and(inArray(classMembers.classId, classIds), isNull(classMembers.leftOn))),
              )
            : undefined,
        ),
      ),
    );
  return rows.map((r) => r.id);
}

/** True when the person is the principal themself or a child they are guardian of. */
export async function isSelfOrWard(db: Db, principal: Principal, personId: string) {
  if (!principal.personId) return false;
  if (principal.personId === personId) return true;
  const [link] = await db
    .select({ id: guardianships.id })
    .from(guardianships)
    .where(
      and(eq(guardianships.guardianId, principal.personId), eq(guardianships.childId, personId)),
    )
    .limit(1);
  return Boolean(link);
}

/**
 * Highest tier of a person's record the principal may read, or null for none:
 * - personal: themself, their wards, or `people.read_personal` over the person's team/class;
 * - general: `people.read` over the person's team/class.
 * `viaRelationship` tells whether access comes from being the person or their guardian
 * (such reads are not audited).
 */
export async function personTierFor(
  db: Db,
  principal: Principal,
  personId: string,
): Promise<{ tier: "general" | "personal"; viaRelationship: boolean } | null> {
  if (await isSelfOrWard(db, principal, personId)) {
    return { tier: "personal", viaRelationship: true };
  }
  const scope = await personScope(db, personId);
  if (hasPermission(principal.grants, "people.read_personal", scope)) {
    return { tier: "personal", viaRelationship: false };
  }
  if (hasPermission(principal.grants, "people.read", scope)) {
    return { tier: "general", viaRelationship: false };
  }
  return null;
}

/**
 * Gate for every read of health data (M13 calls it before returning a record). Allowed only
 * for the clinical roles of that discipline; every allowed read is written to the audit log.
 */
export async function authorizeHealthRead(
  db: Db,
  principal: Principal,
  input: { personId: string; discipline: HealthDiscipline },
): Promise<boolean> {
  const scope = await personScope(db, input.personId);
  if (!hasPermission(principal.grants, healthPermission(input.discipline, "read"), scope)) {
    return false;
  }
  await audit(db, {
    actorUserId: principal.userId,
    action: "health.read",
    tier: "health",
    subjectPersonId: input.personId,
    details: { discipline: input.discipline },
  });
  return true;
}

/**
 * Gate for every write of health data: the clinical role of that discipline, and the entry
 * goes to the audit log (ids and discipline only, never content).
 */
export async function authorizeHealthWrite(
  db: Db,
  principal: Principal,
  input: { personId: string; discipline: HealthDiscipline },
): Promise<boolean> {
  const scope = await personScope(db, input.personId);
  if (!hasPermission(principal.grants, healthPermission(input.discipline, "write"), scope)) {
    return false;
  }
  await audit(db, {
    actorUserId: principal.userId,
    action: "health.write",
    tier: "health",
    subjectPersonId: input.personId,
    details: { discipline: input.discipline },
  });
  return true;
}

/**
 * Where `principal` holds `permission`: `"all"` for a club-wide grant, otherwise the teams and
 * classes of its scoped grants (both empty when the permission is not held at all). Lists
 * use it to return only the rows a coach or team manager may see.
 */
export function readScope(
  principal: Principal,
  permission: Permission,
): "all" | { teamIds: string[]; classIds: string[] } {
  const grants = principal.grants.filter((g) => ROLE_PERMISSIONS[g.role].includes(permission));
  if (grants.some((g) => g.teamId === null && g.classId === null)) return "all";
  return {
    teamIds: grants.flatMap((g) => (g.teamId ? [g.teamId] : [])),
    classIds: grants.flatMap((g) => (g.classId ? [g.classId] : [])),
  };
}
