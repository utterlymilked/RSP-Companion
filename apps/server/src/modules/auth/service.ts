import { createHash, randomBytes } from "node:crypto";
import type { CreateInvitationInput, RoleGrantInput } from "@rsc/shared";
import { hashPassword } from "better-auth/crypto";
import { and, asc, count, eq, gt, isNull, ne } from "drizzle-orm";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgCode } from "../../db/errors.js";
import type { Db } from "../../db/index.js";
import { ApiError, notFound } from "../../http/errors.js";
import { audit } from "../audit/service.js";
import { accounts, invitations, roleAssignments, type User, users } from "./schema.js";

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
      personId: input.personId ?? null,
    })
    .returning();
  if (!user) throw new Error("Insert returned no row");
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
    if (row.role === "admin") {
      // Lock every admin row so two concurrent revocations cannot remove the last two admins.
      const others = await tx
        .select({ id: roleAssignments.id })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.role, "admin"), ne(roleAssignments.id, row.id)))
        .for("update");
      if (others.length === 0) throw new ApiError(409, "last_admin");
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

/** Links a user to the person they are (or unlinks with null); a person has at most one user. */
export async function linkPerson(
  db: Db,
  input: { userId: string; personId: string | null; linkedBy: string | null },
) {
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ personId: input.personId })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id });
      if (updated.length === 0) throw notFound();
      await audit(tx, {
        actorUserId: input.linkedBy,
        action: "user.person_linked",
        subjectUserId: input.userId,
        subjectPersonId: input.personId,
      });
    });
  } catch (error) {
    if (pgCode(error) === PG_UNIQUE_VIOLATION) throw new ApiError(409, "conflict");
    if (pgCode(error) === PG_FOREIGN_KEY_VIOLATION) throw notFound();
    throw error;
  }
}

/** Every user with their roles, by name. */
export async function listUsers(db: Db) {
  const rows = await db.query.users.findMany({
    columns: { id: true, email: true, name: true, personId: true, createdAt: true },
    with: {
      roles: { columns: { id: true, role: true, teamId: true, classId: true } },
    },
    orderBy: [asc(users.name)],
  });
  return rows;
}

/**
 * Creates an invitation and returns it with the one-time token (to be emailed, never stored).
 * 409 `user_exists` when the email already has a login: grant roles to that user instead.
 */
export async function createInvitation(
  db: Db,
  input: CreateInvitationInput & { invitedBy: string | null },
) {
  const [existing] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.email, input.email));
  if (existing && existing.n > 0) throw new ApiError(409, "user_exists");
  if (input.personId) {
    const [linked] = await db
      .select({ n: count() })
      .from(users)
      .where(eq(users.personId, input.personId));
    if (linked && linked.n > 0) throw new ApiError(409, "conflict");
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

/**
 * Accepts an invitation: creates the user with the invited email, roles and person link.
 * 400 `invitation_invalid` for an unknown, used or expired token.
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
    if (!invitation) throw new ApiError(400, "invitation_invalid");
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
      subjectPersonId: user.personId,
      details: { invitationId: invitation.id },
    });
    return user;
  });
}
