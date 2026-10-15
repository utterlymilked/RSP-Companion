/**
 * Wall-clock helpers for Europe/Lisbon. Timestamps are stored in UTC; the club thinks in
 * Lisbon time ("training at 19:00" stays 19:00 across the summer-time change), so recurring
 * bookings and day boundaries are computed here. Pure functions, no dependencies.
 */
export const CLUB_TIME_ZONE = "Europe/Lisbon";

export interface LocalDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** The Lisbon wall-clock reading of an instant. */
export function toLisbon(instant: Date): LocalDateTime {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  );
  return {
    year: parts.year as number,
    month: parts.month as number,
    day: parts.day as number,
    hour: parts.hour as number,
    minute: parts.minute as number,
  };
}

const asUtc = (t: LocalDateTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);

/** The instant at which Lisbon clocks show `local` (the earlier one when a time repeats). */
export function fromLisbon(local: LocalDateTime): Date {
  const wanted = asUtc(local);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    guess = wanted - (asUtc(toLisbon(new Date(guess))) - guess);
  }
  return new Date(guess);
}

/** `local` moved by whole calendar days (the time of day is kept). */
export function addLocalDays(local: LocalDateTime, days: number): LocalDateTime {
  const moved = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    ...local,
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localDateString = (t: LocalDateTime) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
export const localTimeString = (t: LocalDateTime) => `${pad(t.hour)}:${pad(t.minute)}`;

/** `YYYY-MM-DD` + `HH:MM` as Lisbon wall-clock time, or null when either is malformed. */
export function parseLocal(date: string, time = "00:00"): LocalDateTime | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const local = {
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
  };
  if (local.hour > 23 || local.minute > 59) return null;
  const check = new Date(asUtc(local));
  const valid =
    check.getUTCFullYear() === local.year &&
    check.getUTCMonth() + 1 === local.month &&
    check.getUTCDate() === local.day;
  return valid ? local : null;
}

/** Start of the Lisbon day `date` (YYYY-MM-DD) as an instant, or null for a bad date. */
export function startOfLisbonDay(date: string): Date | null {
  const local = parseLocal(date);
  return local ? fromLisbon(local) : null;
}
