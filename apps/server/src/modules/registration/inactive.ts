import { INACTIVITY } from "@rsc/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import type { Mailer } from "../../mail/mailer.js";
import { inactivityWarningMail } from "../../mail/templates.js";
import { audit } from "../audit/service.js";
import { isOwnerLink } from "../auth/owner.js";
import { roleAssignments, sessions, userPersons, users } from "../auth/schema.js";
import { evidenceFiles } from "../evidence/schema.js";
import { type EvidenceStore, purgeEvidence } from "../evidence/service.js";
import { accountNotices } from "./schema.js";

const DAY = 86_400_000;
const SELF_REGISTERED_ROLES = new Set(["anonymous", "external"]);

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

export interface InactiveRun {
  dryRun: boolean;
  /** Logins that were (or, in a dry run, would be) emailed a notice. */
  warned: number;
  deleted: number;
  deactivated: number;
  /** True when the cap per run stopped the job before every due login was handled. */
  capped: boolean;
}

/**
 * The inactive-user job (ADR 0026 section 9). It acts on logins, never on persons:
 * - verified, self-registered (only `anonymous`/`external`), no person: deleted 12 months after
 *   the last sign-in;
 * - a login that belongs to a person: deactivated (never deleted) after 24 months;
 * - a login holding any other role is never touched.
 * Notices go out 30 and 7 days before; nothing is acted on until a notice has been out for a day.
 * A dry run changes and sends nothing and only counts.
 */
export async function runInactiveUsers(
  db: Db,
  options: {
    now?: Date;
    dryRun: boolean;
    mailer: Mailer;
    appUrl: string;
    evidence: EvidenceStore | null;
    cap?: number;
  },
): Promise<InactiveRun> {
  const now = options.now ?? new Date();
  const cap = options.cap ?? INACTIVITY.maxActionsPerRun;
  const result: InactiveRun = {
    dryRun: options.dryRun,
    warned: 0,
    deleted: 0,
    deactivated: 0,
    capped: false,
  };

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      personId: userPersons.personId,
      createdAt: users.createdAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .leftJoin(userPersons, and(eq(userPersons.userId, users.id), isOwnerLink))
    .where(and(eq(users.emailVerified, true), isNull(users.deactivatedAt)));
  const held = new Map<string, string[]>();
  for (const r of await db
    .select({ userId: roleAssignments.userId, role: roleAssignments.role })
    .from(roleAssignments)) {
    held.set(r.userId, [...(held.get(r.userId) ?? []), r.role]);
  }
  const notices = new Map<string, { daysBefore: number; sentAt: Date }[]>();
  for (const n of await db.select().from(accountNotices)) {
    notices.set(n.userId, [...(notices.get(n.userId) ?? []), n]);
  }

  // Signing in again resets the clock: forget notices older than the last sign-in.
  const stale = rows
    .filter(
      (u) => u.lastSignInAt && (notices.get(u.id) ?? []).some((n) => n.sentAt < u.lastSignInAt!),
    )
    .map((u) => u.id);
  if (stale.length > 0 && !options.dryRun) {
    await db.delete(accountNotices).where(inArray(accountNotices.userId, stale));
    for (const id of stale) notices.delete(id);
  }

  for (const user of rows) {
    const roles = held.get(user.id) ?? [];
    if (roles.some((role) => !SELF_REGISTERED_ROLES.has(role))) continue;
    const action = user.personId ? "deactivate" : "delete";
    const months =
      action === "delete" ? INACTIVITY.anonymousDeleteMonths : INACTIVITY.personDeactivateMonths;
    const deadline = addMonths(user.lastSignInAt ?? user.createdAt, months);
    const sent = notices.get(user.id) ?? [];

    if (now >= deadline) {
      // Never act without a notice that has been out for a day.
      if (!sent.some((n) => now.getTime() - n.sentAt.getTime() >= DAY)) {
        if (sent.length === 0) await warn(user, action, deadline);
        continue;
      }
      if (result.deleted + result.deactivated >= cap) {
        result.capped = true;
        continue;
      }
      if (options.dryRun) {
        result[action === "delete" ? "deleted" : "deactivated"]++;
        continue;
      }
      if (action === "delete") {
        if (!(await removeUser(user.id))) continue;
        result.deleted++;
      } else {
        await db.update(users).set({ deactivatedAt: now }).where(eq(users.id, user.id));
        await db.delete(sessions).where(eq(sessions.userId, user.id));
        await audit(db, {
          actorUserId: null,
          action: "account.deactivated",
          subjectUserId: user.id,
          details: { reason: "inactive" },
        });
        result.deactivated++;
      }
      continue;
    }
    await warn(user, action, deadline);
  }

  /** Emails the most urgent notice that has come due and not been sent yet. */
  async function warn(
    user: { id: string; email: string },
    action: "delete" | "deactivate",
    deadline: Date,
  ) {
    const sent = new Set((notices.get(user.id) ?? []).map((n) => n.daysBefore));
    const due = INACTIVITY.noticeDays
      .filter((d) => now.getTime() >= deadline.getTime() - d * DAY && !sent.has(d))
      .sort((a, b) => a - b);
    const next = due[0];
    if (next === undefined) return;
    result.warned++;
    if (options.dryRun) return;
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY));
    try {
      await options.mailer.send(
        inactivityWarningMail(user.email, action, daysLeft, options.appUrl),
      );
    } catch (error) {
      console.error("inactivity notice failed", error);
      result.warned--;
      return;
    }
    // Marks every notice up to this one as sent so a late first warning is not followed by another.
    await db
      .insert(accountNotices)
      .values(due.map((daysBefore) => ({ userId: user.id, daysBefore, sentAt: now })))
      .onConflictDoNothing();
  }

  /** Files first (ADR 0026), then the login; sessions, accounts and requests cascade. */
  async function removeUser(userId: string) {
    const files = await db
      .select({ id: evidenceFiles.id })
      .from(evidenceFiles)
      .where(eq(evidenceFiles.ownerUserId, userId));
    if (files.length > 0) {
      if (!options.evidence) return false;
      await purgeEvidence(
        db,
        options.evidence,
        files.map((f) => f.id),
      );
    }
    await audit(db, {
      actorUserId: null,
      action: "account.purged",
      details: { userId, reason: "inactive" },
    });
    await db.delete(users).where(eq(users.id, userId));
    return true;
  }

  return result;
}
