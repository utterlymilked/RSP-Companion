import { startOfLisbonDay } from "@rsc/shared";
import { and, eq, gte, inArray } from "drizzle-orm";
import { roleAssignments } from "../auth/schema.js";
import { expiringDocuments } from "../documents/service.js";
import { todayInLisbon } from "../fees/service.js";
import { notifications } from "./schema.js";
import { type Channels, notifyUsers, usersForPeople } from "./service.js";

/** Days before expiry on which a reminder goes out, plus the day it expires. */
export const REMINDER_DAYS = [30, 7, 0] as const;

const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Reminds about documents whose expiry falls exactly 30 or 7 days ahead, or today. The person
 * and their guardians get a generic line; admin and staff get one too, except for medical
 * exams, whose existence is health tier. Returns how many reminders were created. Safe to
 * call once a day; `runDailyReminders` guards against a second run on the same day.
 */
export async function remindExpiringDocuments(channels: Channels, today = todayInLisbon()) {
  const rows = await expiringDocuments(channels.db, { today, days: Math.max(...REMINDER_DAYS) });
  const due = new Set(REMINDER_DAYS.map((d) => addDays(today, d)));
  const hits = rows.filter((r) => due.has(r.expiresOn));
  if (hits.length === 0) return 0;
  const office = (
    await channels.db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(inArray(roleAssignments.role, ["admin", "staff"]))
  ).map((r) => r.userId);
  let created = 0;
  for (const hit of hits) {
    const recipients = await usersForPeople(channels.db, [hit.personId]);
    if (hit.kind !== "medical_exam") recipients.push(...office);
    created += await notifyUsers(channels, recipients, {
      kind: "document_expiry",
      title: "Documento a expirar",
      link: `/documents/${hit.personId}`,
    });
  }
  return created;
}

/** Runs the daily reminders once per Lisbon day, even across restarts. */
export async function runDailyReminders(channels: Channels) {
  const today = todayInLisbon();
  const start = startOfLisbonDay(today);
  if (start) {
    const [already] = await channels.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.kind, "document_expiry"), gte(notifications.createdAt, start)))
      .limit(1);
    if (already) return 0;
  }
  return remindExpiringDocuments(channels, today);
}

/** Checks every 15 minutes and sends the reminders after 08:00 Lisbon time. */
export function startReminderJob(channels: Channels) {
  const tick = async () => {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
    if (hour < 8) return;
    try {
      await runDailyReminders(channels);
    } catch (error) {
      console.error("reminder job failed", error);
    }
  };
  void tick();
  return setInterval(tick, 15 * 60_000).unref();
}
