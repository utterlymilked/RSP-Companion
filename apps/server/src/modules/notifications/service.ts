import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationKind,
  type NotificationPreferences,
  SCOPED_ROLE_FUNCTIONS,
} from "@rsc/shared";
import { and, desc, eq, inArray, isNull, or, type SQLWrapper, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import type { Mailer } from "../../mail/mailer.js";
import type { PushSender } from "../../push/index.js";
import { isOwnerLink } from "../auth/owner.js";
import { roleAssignments, userPersons, users } from "../auth/schema.js";
import { guardianships } from "../people/schema.js";
import { staffAssignments, teamMembers } from "../teams/schema.js";
import { announcements, notificationPreferences, notifications, pushDevices } from "./schema.js";

/** Users whose own person is one of `people` (ids or a subquery). */
const usersOf = (db: Db, people: string[] | SQLWrapper) =>
  db
    .select({ userId: userPersons.userId })
    .from(userPersons)
    .where(and(isOwnerLink, inArray(userPersons.personId, people as never)));

export interface Notice {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** In-app path the notification opens. */
  link?: string | null;
  announcementId?: string | null;
}

/** What delivering needs from the outside world. */
export interface Channels {
  db: Db;
  mailer: Mailer;
  push: PushSender;
  appUrl: string;
}

/** Push text per kind: generic on purpose, the details are read in the app after signing in. */
const PUSH_TITLE: Record<NotificationKind, string> = {
  announcement: "Novo aviso do clube",
  callup: "Nova convocatória",
  document_expiry: "Documento a expirar",
  booking: "Atualização de reserva",
};

/**
 * Users who receive an announcement: everyone for the whole club; for a team, its current
 * members, their guardians and the staff with a role on that team. Users without a login
 * cannot be reached, so they are simply not in the list.
 */
export async function announcementRecipients(db: Db, teamId: string | null): Promise<string[]> {
  if (!teamId) {
    const all = await db.select({ id: users.id }).from(users);
    return all.map((u) => u.id);
  }
  const roster = db
    .select({ personId: teamMembers.personId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftOn)));
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .where(
      or(
        inArray(users.id, usersOf(db, roster)),
        inArray(
          users.id,
          usersOf(
            db,
            db
              .select({ guardianId: guardianships.guardianId })
              .from(guardianships)
              .where(inArray(guardianships.childId, roster)),
          ),
        ),
        inArray(
          users.id,
          usersOf(
            db,
            db
              .select({ personId: staffAssignments.personId })
              .from(staffAssignments)
              .where(
                and(
                  eq(staffAssignments.teamId, teamId),
                  inArray(staffAssignments.function, [
                    ...SCOPED_ROLE_FUNCTIONS.coach,
                    ...SCOPED_ROLE_FUNCTIONS.team_manager,
                  ]),
                ),
              ),
          ),
        ),
      ),
    );
  return rows.map((r) => r.id);
}

/** Users who can act for the given people: the people themselves and their guardians. */
export async function usersForPeople(db: Db, personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) return [];
  const guardians = db
    .select({ guardianId: guardianships.guardianId })
    .from(guardianships)
    .where(inArray(guardianships.childId, personIds));
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      or(inArray(users.id, usersOf(db, personIds)), inArray(users.id, usersOf(db, guardians))),
    );
  return rows.map((r) => r.id);
}

export async function getPreferences(db: Db, userId: string): Promise<NotificationPreferences> {
  const [row] = await db
    .select({ push: notificationPreferences.push, email: notificationPreferences.email })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return row ?? DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function setPreferences(db: Db, userId: string, prefs: NotificationPreferences) {
  await db
    .insert(notificationPreferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: prefs });
}

/**
 * Puts `notice` in each user's inbox, then pushes and emails according to their preferences.
 * The inbox write is the source of truth; push and email are best effort and never fail the
 * caller. Dead push tokens reported by the push service are deleted.
 */
export async function notifyUsers(channels: Channels, userIds: string[], notice: Notice) {
  const { db, mailer, push } = channels;
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const created = await db
    .insert(notifications)
    .values(
      ids.map((userId) => ({
        userId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body ?? null,
        link: notice.link ?? null,
        announcementId: notice.announcementId ?? null,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });

  try {
    const [prefRows, deviceRows, userRows] = await Promise.all([
      db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, ids)),
      db.select().from(pushDevices).where(inArray(pushDevices.userId, ids)),
      db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids)),
    ]);
    const prefs = new Map(prefRows.map((p) => [p.userId, p]));
    const wants = (userId: string, channel: "push" | "email") =>
      (prefs.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES)[channel];
    const notificationOf = new Map(created.map((n) => [n.userId, n.id]));

    const messages = deviceRows
      .filter((d) => wants(d.userId, "push"))
      .map((d) => ({
        to: d.token,
        title: PUSH_TITLE[notice.kind],
        body: "Abra a app para ver.",
        data: { notificationId: notificationOf.get(d.userId) ?? "", kind: notice.kind },
      }));
    if (messages.length > 0) {
      const { invalidTokens } = await push.send(messages);
      if (invalidTokens.length > 0) {
        await db.delete(pushDevices).where(inArray(pushDevices.token, invalidTokens));
      }
    }

    for (const user of userRows.filter((u) => wants(u.id, "email"))) {
      await mailer.send({
        to: user.email,
        subject: notice.title,
        text: `${notice.body ?? PUSH_TITLE[notice.kind]}\n\n${channels.appUrl}`,
      });
    }
  } catch (error) {
    console.error("notification delivery failed", error);
  }
  return created.length;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  teamId: string | null;
}

/** Stores an announcement and delivers it to its audience, the author excluded. */
export async function publishAnnouncement(
  channels: Channels,
  input: AnnouncementInput,
  authorId: string,
) {
  const [announcement] = await channels.db
    .insert(announcements)
    .values({ ...input, createdBy: authorId })
    .returning();
  if (!announcement) throw new Error("announcement not created");
  const audience = await announcementRecipients(channels.db, input.teamId);
  const delivered = await notifyUsers(
    channels,
    audience.filter((id) => id !== authorId),
    {
      kind: "announcement",
      title: input.title,
      body: input.body,
      announcementId: announcement.id,
    },
  );
  // The author sees their own aviso in the inbox too, already read and without push or email.
  await channels.db.insert(notifications).values({
    userId: authorId,
    kind: "announcement",
    title: input.title,
    body: input.body,
    announcementId: announcement.id,
    readAt: new Date(),
  });
  return { announcement, delivered };
}

/** Announcements newest first; `teamIds` limits the list to those teams, `undefined` is all. */
export async function listAnnouncements(db: Db, teamIds: string[] | undefined, limit = 50) {
  const where =
    teamIds === undefined
      ? undefined
      : teamIds.length === 0
        ? sql`false`
        : inArray(announcements.teamId, teamIds);
  return db
    .select({
      id: announcements.id,
      teamId: announcements.teamId,
      title: announcements.title,
      body: announcements.body,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .where(where)
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
}

export async function getAnnouncement(db: Db, announcementId: string) {
  const [row] = await db.select().from(announcements).where(eq(announcements.id, announcementId));
  return row ?? null;
}

export async function deleteAnnouncement(db: Db, announcementId: string) {
  const rows = await db
    .delete(announcements)
    .where(eq(announcements.id, announcementId))
    .returning({ id: announcements.id });
  return rows.length > 0;
}

const inboxColumns = {
  id: notifications.id,
  kind: notifications.kind,
  title: notifications.title,
  body: notifications.body,
  link: notifications.link,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

export async function listInbox(db: Db, userId: string, limit: number) {
  const [items, [unread]] = await Promise.all([
    db
      .select(inboxColumns)
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return { notifications: items, unread: unread?.count ?? 0 };
}

/** Marks one entry (or all, when `notificationId` is null) read. */
export async function markRead(db: Db, userId: string, notificationId: string | null) {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        notificationId ? eq(notifications.id, notificationId) : undefined,
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

export async function ownsNotification(db: Db, userId: string, notificationId: string) {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return Boolean(row);
}

/** Registers a token for the user; a token that belonged to someone else moves to them. */
export async function registerDevice(
  db: Db,
  userId: string,
  device: { token: string; platform: "ios" | "android" },
) {
  await db
    .insert(pushDevices)
    .values({ userId, ...device })
    .onConflictDoUpdate({ target: pushDevices.token, set: { userId, platform: device.platform } });
}

export async function unregisterDevice(db: Db, userId: string, token: string) {
  await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
}
