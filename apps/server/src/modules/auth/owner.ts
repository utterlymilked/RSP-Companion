import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { userPersons } from "./schema.js";

/**
 * A user's own person is their `owner` link in `user_persons` (ADR 0024); `users.person_id`
 * is gone. A user has at most one owner link and a person at most one owner (unique indexes).
 */
export const isOwnerLink = and(
  eq(userPersons.relationship, "owner"),
  ne(userPersons.status, "revoked"),
);

/** The person this user is, or null. */
export async function ownerPersonOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ personId: userPersons.personId })
    .from(userPersons)
    .where(and(eq(userPersons.userId, userId), isOwnerLink));
  return row?.personId ?? null;
}

/** The user who is this person, or null. */
export async function ownerUserOf(db: Db, personId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userPersons.userId })
    .from(userPersons)
    .where(and(eq(userPersons.personId, personId), isOwnerLink));
  return row?.userId ?? null;
}

/**
 * Makes `personId` this user's own person (null unlinks). Any previous owner link of the user is
 * revoked; a unique violation means the person already has another user.
 */
export async function setOwnerPerson(
  db: Db,
  userId: string,
  personId: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .update(userPersons)
    .set({ status: "revoked", validTo: now, updatedAt: now })
    .where(and(eq(userPersons.userId, userId), isOwnerLink));
  if (!personId) return;
  await db
    .insert(userPersons)
    .values({ userId, personId, relationship: "owner", status: "approved", approvedAt: now })
    .onConflictDoUpdate({
      target: [userPersons.userId, userPersons.personId],
      set: {
        relationship: "owner",
        status: "approved",
        validTo: null,
        approvedAt: now,
        updatedAt: now,
      },
    });
}
