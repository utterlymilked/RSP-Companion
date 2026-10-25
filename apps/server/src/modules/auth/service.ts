import { createHash, randomBytes } from "node:crypto";
import type {
  CreateInvitationInput,
  PendingInvitation,
  RoleGrantInput,
  UserDetail,
  UserRole,
  UserSummary,
} from "@rsc/shared";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgCode } from "../../db/errors.js";
import type { Db } from "../../db/index.js";
import { ApiError, notFound } from "../../http/errors.js";
import { audit } from "../audit/service.js";
import { persons } from "../people/schema.js";
import { classes, teams } from "../teams/schema.js";
import { isOwnerLink, ownerUserOf, setOwnerPerson } from "./owner.js";
import {
  accounts,
  invitations,
  roleAssignments,
  sessions,
  type User,
  userPersons,
  users,
} from "./schema.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a user who signs in with email and password (Better Auth's "credential" account).
 * Used by invitation acceptance and the create-admin script; there is no public sign-up.
 */
export async function createUserWithPassword(
  db: Db,
  input: { email: string; name: string; password: string; personId?: string | null },
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      emailVerified: true, // proven by the invitation link, or by the admin running the script
    })
    .returning();
  if (!user) throw new Error("Insert returned no row");
  if (input.personId) await setOwnerPerson(db, user.id, input.personId);
  await db.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(input.password),
  });
  return user;
}

/** Grants a role; 409 when the user already holds it, 404 when the user/team/class is unknown. */
export async function grantRole(
  db: Db,
  input: { userId: string; grant: RoleGrantInput; grantedBy: string | null },
) {
  if (input.grant.role === "developer") throw new ApiError(403, "forbidden"); // Ops task only (ADR 0019)
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(roleAssignments)
        .values({ userId: input.userId, ...input.grant, grantedBy: input.grantedBy })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      await audit(tx, {
        actorUserId: input.grantedBy,
        action: "role.granted",
        subjectUserId: input.userId,
        details: { role: row.role, teamId: row.teamId, classId: row.classId },
      });
      return row;
    });
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) throw new ApiError(409, "conflict");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) throw notFound();
    throw error;
  }
}

/** Revokes a role assignment of a user. The last admin of the club cannot lose the role. */
export async function revokeRole(
  db: Db,
  input: { userId: string; assignmentId: string; revokedBy: string | null },
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(roleAssignments)
      .where(
        and(eq(roleAssignments.id, input.assignmentId), eq(roleAssignments.userId, input.userId)),
      )
      .for("update");
    if (!row) throw notFound();
    if (row.role === "developer") throw new ApiError(403, "forbidden");
    if (row.role === "admin" && (await otherActiveAdmins(tx, input.userId)) === 0) {
      throw new ApiError(409, "last_admin");
    }
    await tx.delete(roleAssignments).where(eq(roleAssignments.id, row.id));
    await audit(tx, {
      actorUserId: input.revokedBy,
      action: "role.revoked",
      subjectUserId: input.userId,
      details: { role: row.role, teamId: row.teamId, classId: row.classId },
    });
  });
}

/**
 * Active users other than `userId` who hold admin. Locks every admin assignment first, so
 * concurrent revocations and deactivations cannot remove the last two admins.
 */
async function otherActiveAdmins(tx: Db, userId: string) {
  await tx
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(eq(roleAssignments.role, "admin"))
    .for("update");
  const [row] = await tx
    .select({ n: count() })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(
      and(
        eq(roleAssignments.role, "admin"),
        ne(roleAssignments.userId, userId),
        isNull(users.deactivatedAt),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Deactivates a login (ends its sessions; auth.ts refuses new ones) or reactivates it. Roles
 * and the person link stay, so reactivating restores access as it was. Nobody deactivates
 * themself, and the last active admin cannot be deactivated.
 */
export async function setUserActive(
  db: Db,
  input: { userId: string; active: boolean; changedBy: string },
) {
  if (!input.active && input.userId === input.changedBy) {
    throw new ApiError(409, "self_deactivation");
  }
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ deactivatedAt: users.deactivatedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    if (!user) throw notFound();
    if (input.active === (user.deactivatedAt === null)) return; // already in that state
    if (!input.active) {
      const [isDeveloper] = await tx
        .select({ n: count() })
        .from(roleAssignments)
        .where(
          and(eq(roleAssignments.userId, input.userId), eq(roleAssignments.role, "developer")),
        );
      if (isDeveloper && isDeveloper.n > 0) throw new ApiError(403, "forbidden");
      const [isAdmin] = await tx
        .select({ n: count() })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.userId, input.userId), eq(roleAssignments.role, "admin")));
      if (isAdmin && isAdmin.n > 0 && (await otherActiveAdmins(tx, input.userId)) === 0) {
        throw new ApiError(409, "last_admin");
      }
    }
    await tx
      .update(users)
      .set({ deactivatedAt: input.active ? null : new Date() })
      .where(eq(users.id, input.userId));
    if (!input.active) await tx.delete(sessions).where(eq(sessions.userId, input.userId));
    await audit(tx, {
      actorUserId: input.changedBy,
      action: input.active ? "user.reactivated" : "user.deactivated",
      subjectUserId: input.userId,
    });
  });
}

/** Links a user to the person they are (or unlinks with null); a person has at most one user. */
export async function linkPerson(
  db: Db,
  input: { userId: string; personId: string | null; linkedBy: string | null },
) {
  try {
    await db.transaction(async (tx) => {
      const [found] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!found) throw notFound();
      await setOwnerPerson(tx, input.userId, input.personId);
      await audit(tx, {
        actorUserId: input.linkedBy,
        action: "user.person_linked",
        subjectUserId: input.userId,
        subjectPersonId: input.personId,
      });
    });
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) throw new ApiError(409, "person_has_user");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) throw notFound();
    throw error;
  }
}

/** Roles of the given users, with the name of the team or class of scoped ones. */
async function rolesOf(db: Db, userIds: string[]): Promise<Map<string, UserRole[]>> {
  const byUser = new Map<string, UserRole[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({
      userId: roleAssignments.userId,
      id: roleAssignments.id,
      role: roleAssignments.role,
      teamId: roleAssignments.teamId,
      classId: roleAssignments.classId,
      scopeName: sql<string | null>`coalesce(${teams.name}, ${classes.name}, ${classes.code})`,
    })
    .from(roleAssignments)
    .leftJoin(teams, eq(teams.id, roleAssignments.teamId))
    .leftJoin(classes, eq(classes.id, roleAssignments.classId))
    .where(inArray(roleAssignments.userId, userIds))
    .orderBy(asc(roleAssignments.createdAt));
  for (const { userId, ...role } of rows) {
    byUser.set(userId, [...(byUser.get(userId) ?? []), role]);
  }
  return byUser;
}

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  personId: userPersons.personId,
  personName: persons.fullName,
  createdAt: users.createdAt,
  deactivatedAt: users.deactivatedAt,
};

/** Every user with their roles and linked person, by name. */
export async function listUsers(db: Db): Promise<UserSummary[]> {
  const rows = await db
    .select(userColumns)
    .from(users)
    .leftJoin(userPersons, and(eq(userPersons.userId, users.id), isOwnerLink))
    .leftJoin(persons, eq(persons.id, userPersons.personId))
    .orderBy(asc(users.name));
  const roles = await rolesOf(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    deactivatedAt: r.deactivatedAt?.toISOString() ?? null,
    roles: roles.get(r.id) ?? [],
  }));
}

/** One user for the management screen; 404 when unknown. */
export async function getUser(db: Db, userId: string): Promise<UserDetail> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(userPersons, and(eq(userPersons.userId, users.id), isOwnerLink))
    .leftJoin(persons, eq(persons.id, userPersons.personId))
    .where(eq(users.id, userId));
  if (!row) throw notFound();
  const [seen] = await db
    .select({ at: max(sessions.updatedAt) })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  const roles = await rolesOf(db, [userId]);
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    lastSeenAt: seen?.at ? new Date(seen.at).toISOString() : null,
    roles: roles.get(userId) ?? [],
  };
}

/**
 * Creates an invitation and returns it with the one-time token (to be emailed, never stored).
 * 409 `user_exists` when the email already has a login: grant roles to that user instead.
 */
export async function createInvitation(
  db: Db,
  input: CreateInvitationInput & { invitedBy: string | null },
) {
  if (input.roles.some((r) => r.role === "developer")) throw new ApiError(403, "forbidden");
  const [existing] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.email, input.email));
  if (existing && existing.n > 0) throw new ApiError(409, "user_exists");
  if (input.personId) {
    if (await ownerUserOf(db, input.personId)) throw new ApiError(409, "person_has_user");
  }
  const token = randomBytes(32).toString("base64url");
  try {
    return await db.transaction(async (tx) => {
      const [invitation] = await tx
        .insert(invitations)
        .values({
          email: input.email,
          tokenHash: hashToken(token),
          personId: input.personId ?? null,
          roles: input.roles,
          invitedBy: input.invitedBy,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        })
        .returning();
      if (!invitation) throw new Error("Insert returned no row");
      await audit(tx, {
        actorUserId: input.invitedBy,
        action: "invitation.created",
        subjectPersonId: invitation.personId,
        details: { invitationId: invitation.id, roles: input.roles.map((r) => r.role).join(",") },
      });
      return { invitation, token };
    });
  } catch (error) {
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) throw notFound();
    throw error;
  }
}

const inviters = alias(users, "inviters");

/** Invitations not accepted yet, newest first; expired ones are flagged so they can be resent. */
export async function listPendingInvitations(db: Db): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      personId: invitations.personId,
      personName: persons.fullName,
      roles: invitations.roles,
      invitedByName: inviters.name,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .leftJoin(persons, eq(persons.id, invitations.personId))
    .leftJoin(inviters, eq(inviters.id, invitations.invitedBy))
    .where(isNull(invitations.acceptedAt))
    .orderBy(desc(invitations.createdAt));
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    expired: r.expiresAt.getTime() <= now,
  }));
}

/** A pending invitation, locked for update; 404 when unknown or already accepted. */
async function pendingInvitation(tx: Db, invitationId: string) {
  const [row] = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
    .for("update");
  if (!row) throw notFound();
  return row;
}

/**
 * Sends a pending invitation again: a new token (the old link stops working) and a fresh
 * 7-day expiry. Returns the invitation with the token to email. 409 `user_exists` when the
 * email got a login meanwhile.
 */
export async function resendInvitation(
  db: Db,
  input: { invitationId: string; resentBy: string | null },
) {
  const token = randomBytes(32).toString("base64url");
  return db.transaction(async (tx) => {
    const invitation = await pendingInvitation(tx, input.invitationId);
    const [existing] = await tx
      .select({ n: count() })
      .from(users)
      .where(eq(users.email, invitation.email));
    if (existing && existing.n > 0) throw new ApiError(409, "user_exists");
    const [updated] = await tx
      .update(invitations)
      .set({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
      .where(eq(invitations.id, invitation.id))
      .returning();
    if (!updated) throw new Error("Update returned no row");
    await audit(tx, {
      actorUserId: input.resentBy,
      action: "invitation.resent",
      subjectPersonId: invitation.personId,
      details: { invitationId: invitation.id },
    });
    return { invitation: updated, token };
  });
}

/** Cancels a pending invitation: its link stops working. */
export async function revokeInvitation(
  db: Db,
  input: { invitationId: string; revokedBy: string | null },
) {
  await db.transaction(async (tx) => {
    const invitation = await pendingInvitation(tx, input.invitationId);
    await tx.delete(invitations).where(eq(invitations.id, invitation.id));
    await audit(tx, {
      actorUserId: input.revokedBy,
      action: "invitation.revoked",
      subjectPersonId: invitation.personId,
      details: { invitationId: invitation.id },
    });
  });
}

/** How long after acceptance the same token and password still answer with the account. */
const ACCEPT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Accepts an invitation: creates the user with the invited email, roles and person link, all
 * in one transaction (any failure leaves no user and the invitation still pending).
 * Retrying with the same token and password after a success (a double click, or a lost
 * response) returns the account created the first time. 400 `invitation_invalid` for an
 * unknown, used or expired token.
 */
export async function acceptInvitation(
  db: Db,
  input: { token: string; name: string; password: string },
): Promise<User> {
  try {
    return await acceptInTransaction(db, input);
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) throw new ApiError(409, "user_exists");
    // A team or class named in the invitation was deleted since it was sent.
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) throw new ApiError(400, "invitation_invalid");
    throw error;
  }
}

/**
 * The account a recently used invitation created, when `password` is that account's password:
 * proof that this is the same person retrying, not someone holding a leaked link.
 */
async function acceptedEarlier(tx: Db, input: { token: string; password: string }) {
  const [used] = await tx
    .select({ user: users, password: accounts.password, acceptedAt: invitations.acceptedAt })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.acceptedUserId))
    .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, "credential")))
    .where(eq(invitations.tokenHash, hashToken(input.token)));
  if (!used?.password || !used.acceptedAt) return null;
  if (Date.now() - used.acceptedAt.getTime() > ACCEPT_RETRY_WINDOW_MS) return null;
  const same = await verifyPassword({ hash: used.password, password: input.password });
  return same ? used.user : null;
}

function acceptInTransaction(db: Db, input: { token: string; name: string; password: string }) {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(input.token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .for("update");
    if (!invitation) {
      const user = await acceptedEarlier(tx, input);
      if (user) return user;
      throw new ApiError(400, "invitation_invalid");
    }
    const [existing] = await tx
      .select({ n: count() })
      .from(users)
      .where(eq(users.email, invitation.email));
    if (existing && existing.n > 0) throw new ApiError(409, "user_exists");

    const user = await createUserWithPassword(tx, {
      email: invitation.email,
      name: input.name,
      password: input.password,
      personId: invitation.personId,
    });
    if (invitation.roles.length > 0) {
      await tx.insert(roleAssignments).values(
        invitation.roles.map((grant) => ({
          userId: user.id,
          ...grant,
          grantedBy: invitation.invitedBy,
        })),
      );
    }
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedUserId: user.id })
      .where(eq(invitations.id, invitation.id));
    await audit(tx, {
      actorUserId: user.id,
      action: "invitation.accepted",
      subjectUserId: user.id,
      subjectPersonId: invitation.personId,
      details: { invitationId: invitation.id },
    });
    return user;
  });
}
