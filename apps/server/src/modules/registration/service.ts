import { createHmac } from "node:crypto";
import { resolveModules, type Stack } from "@rsc/shared";
import { and, eq, gte, like, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { getModuleOverrides } from "../catalogue/service.js";
import { abuseCounters } from "./schema.js";

/** Starting limits of ADR 0026 section 1; one window each, tunable here. */
export const LIMITS = {
  signUpIp: { window: 3600, max: 5 },
  signUpDomainIp: { window: 86400, max: 3 },
  mailMinute: { window: 60, max: 1 },
  mailHour: { window: 3600, max: 3 },
  mailDay: { window: 86400, max: 6 },
  loginEmail: { window: 600, max: 5 },
  challengeIp: { window: 3600, max: 60 },
} as const;
export type Limit = { window: number; max: number };

/** Keeps counters from holding raw addresses: HMAC of the value with a server secret. */
export const hashKey = (secret: string, rule: string, value: string) =>
  `${rule}:${createHmac("sha256", `abuse:${secret}`).update(value).digest("hex").slice(0, 32)}`;

/**
 * Counts one hit on `key` in a fixed window; true while the count is within `limit.max`. Atomic,
 * so concurrent requests cannot slip past the cap.
 */
export async function hit(db: Db, key: string, limit: Limit): Promise<boolean> {
  const window = sql`make_interval(secs => ${limit.window})`;
  const [row] = await db
    .insert(abuseCounters)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: abuseCounters.key,
      set: {
        count: sql`CASE WHEN ${abuseCounters.windowStart} < now() - ${window} THEN 1 ELSE ${abuseCounters.count} + 1 END`,
        windowStart: sql`CASE WHEN ${abuseCounters.windowStart} < now() - ${window} THEN now() ELSE ${abuseCounters.windowStart} END`,
      },
    })
    .returning({ count: abuseCounters.count });
  return (row?.count ?? 0) <= limit.max;
}

/** Counts a hit that was refused, by reason and day, for the Ops status (no personal data). */
export async function countRejection(db: Db, reason: string) {
  await hit(db, `rejected:${reason}:${today()}`, { window: 86400, max: Number.MAX_SAFE_INTEGER });
}

const today = () => new Date().toISOString().slice(0, 10);
const budgetKey = () => `budget:${today()}`;

/** Takes one registration email from today's budget; false when the cap is reached. */
export async function takeEmailBudget(db: Db, dailyLimit: number): Promise<boolean> {
  return hit(db, budgetKey(), { window: 86400, max: dailyLimit });
}

export async function emailBudgetUsed(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: abuseCounters.count })
    .from(abuseCounters)
    .where(eq(abuseCounters.key, budgetKey()));
  return row?.count ?? 0;
}

/** Deletes counters older than 14 days. */
export async function purgeCounters(db: Db) {
  await db
    .delete(abuseCounters)
    .where(lt(abuseCounters.windowStart, sql`now() - interval '14 days'`));
}

/** Last 24 hours of refused attempts by reason, plus the email budget: the Ops status line. */
export async function registrationStatus(db: Db, dailyLimit: number) {
  const rows = await db
    .select({ key: abuseCounters.key, count: abuseCounters.count })
    .from(abuseCounters)
    .where(
      and(
        like(abuseCounters.key, "rejected:%"),
        gte(abuseCounters.windowStart, sql`now() - interval '24 hours'`),
      ),
    );
  const rejected: Record<string, number> = {};
  for (const { key, count } of rows) {
    const reason = key.split(":")[1] ?? "unknown";
    rejected[reason] = (rejected[reason] ?? 0) + count;
  }
  return { emailsToday: await emailBudgetUsed(db), emailLimit: dailyLimit, rejected };
}

export interface RegistrationDeps {
  /** `SELF_REGISTRATION` switch of this stack. */
  enabled: boolean;
  /** Staging only: the rotating key testers must send (ADR 0026); undefined = no key needed. */
  key?: string;
  /** Registration emails per day before the circuit breaker pauses them. */
  emailDailyLimit: number;
  /** Server secret for HMAC'd counters and challenges. */
  secret: string;
  /** Apply request limits (tests switch them off, as for Better Auth's limiter). */
  limits: boolean;
}

/** Registration is open when the stack switch is on and the `registration` module is enabled. */
export async function isOpen(db: Db, stack: Stack, deps: RegistrationDeps): Promise<boolean> {
  if (!deps.enabled) return false;
  return resolveModules(stack, await getModuleOverrides(db)).registration;
}
