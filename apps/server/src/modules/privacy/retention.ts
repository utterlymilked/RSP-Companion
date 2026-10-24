import { RETENTION } from "@rsc/shared";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { auditLog } from "../audit/schema.js";
import { audit } from "../audit/service.js";
import { invitations, sessions, users, verifications } from "../auth/schema.js";
import { todayInLisbon } from "../fees/service.js";
import { notifications } from "../notifications/schema.js";
import { prospects } from "../scouting/schema.js";
import { privacyRequests } from "./schema.js";

const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/**
 * Deletes data whose retention has run out: prospects past `retainUntil` (ADR 0007), audit
 * entries, inbox notifications and closed privacy requests older than RETENTION, unaccepted
 * invitations long expired, and expired sessions and sign-in tokens. Idempotent; writes one
 * `retention.purged` audit entry with the counts when it deleted anything.
 */
export async function runRetention(db: Db, now = new Date()) {
  const counted = async (rows: Promise<unknown[]>) => (await rows).length;
  const purged = {
    prospects: await counted(
      db
        .delete(prospects)
        .where(lt(prospects.retainUntil, todayInLisbon(now)))
        .returning({ id: prospects.id }),
    ),
    auditEntries: await counted(
      db
        .delete(auditLog)
        .where(lt(auditLog.occurredAt, monthsBefore(now, RETENTION.auditLogMonths)))
        .returning({ id: auditLog.id }),
    ),
    notifications: await counted(
      db
        .delete(notifications)
        .where(lt(notifications.createdAt, monthsBefore(now, RETENTION.notificationMonths)))
        .returning({ id: notifications.id }),
    ),
    privacyRequests: await counted(
      db
        .delete(privacyRequests)
        .where(
          and(
            ne(privacyRequests.status, "open"),
            lt(privacyRequests.resolvedAt, monthsBefore(now, RETENTION.closedRequestMonths)),
          ),
        )
        .returning({ id: privacyRequests.id }),
    ),
    invitations: await counted(
      db
        .delete(invitations)
        .where(
          and(
            isNull(invitations.acceptedAt),
            lt(invitations.expiresAt, daysBefore(now, RETENTION.expiredInvitationDays)),
          ),
        )
        .returning({ id: invitations.id }),
    ),
    unverifiedUsers: await counted(
      db
        .delete(users)
        .where(
          and(
            eq(users.emailVerified, false),
            lt(users.createdAt, daysBefore(now, RETENTION.unverifiedUserDays)),
          ),
        )
        .returning({ id: users.id }),
    ),
    sessions: await counted(
      db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    ),
    verifications: await counted(
      db
        .delete(verifications)
        .where(lt(verifications.expiresAt, now))
        .returning({ id: verifications.id }),
    ),
  };
  if (Object.values(purged).some((n) => n > 0)) {
    await audit(db, { actorUserId: null, action: "retention.purged", details: purged });
  }
  return purged;
}

/** Runs the retention job at start-up and then every six hours. */
export function startRetentionJob(db: Db) {
  const tick = async () => {
    try {
      await runRetention(db);
    } catch (error) {
      console.error("retention job failed", error);
    }
  };
  void tick();
  return setInterval(tick, 6 * 60 * 60_000).unref();
}
