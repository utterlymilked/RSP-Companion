import {
  addLocalDays,
  CLUB_TIME_ZONE,
  type LocalDateTime,
  localDateString,
  localTimeString,
  parseLocal,
  toLisbon,
} from "@rsc/shared";

/** Today's date in Lisbon (YYYY-MM-DD). */
export const todayLisbon = (now = new Date()) => localDateString(toLisbon(now));

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const local = parseLocal(date);
  return local ? localDateString(addLocalDays(local, days)) : date;
}

/** The Monday of the week that contains `date`. */
export function mondayOf(date: string): string {
  const local = parseLocal(date);
  if (!local) return date;
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** Lisbon clock time of an instant, "HH:MM". */
export const clockTime = (iso: string) => localTimeString(toLisbon(new Date(iso)));

/** Lisbon calendar day of an instant, "YYYY-MM-DD". */
export const dayOf = (iso: string) => localDateString(toLisbon(new Date(iso)));

/** "terça-feira, 20 de outubro" for a YYYY-MM-DD date, in the app language. */
export function dayHeading(date: string, locale: string): string {
  const local = parseLocal(date, "12:00") as LocalDateTime;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: CLUB_TIME_ZONE,
  }).format(new Date(Date.UTC(local.year, local.month - 1, local.day, 12)));
}

/** Short parts of a YYYY-MM-DD date for date badges: { weekday: "ter.", day: "20", month: "out." }. */
export function dateParts(date: string, locale: string) {
  const local = parseLocal(date, "12:00") as LocalDateTime;
  const at = new Date(Date.UTC(local.year, local.month - 1, local.day, 12));
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: CLUB_TIME_ZONE }).format(at);
  return {
    weekday: part({ weekday: "short" }),
    day: String(local.day),
    month: part({ month: "short" }),
  };
}

/** Sorts names the way people read them: "Sub-7" before "Sub-11". */
export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt", { numeric: true });

/** The first day of the month `months` away from the month of `date`. */
export function addMonths(date: string, months: number): string {
  const local = parseLocal(date);
  if (!local) return date;
  const first = new Date(Date.UTC(local.year, local.month - 1 + months, 1));
  return first.toISOString().slice(0, 10);
}

/** The six weeks (Monday first) a month calendar shows for the month of `date`. */
export function monthGrid(date: string): string[] {
  const start = mondayOf(addMonths(date, 0));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** "Outubro de 2026" for the month of `date`. */
export function monthTitle(date: string, locale: string): string {
  const local = parseLocal(date, "12:00") as LocalDateTime;
  return capitalise(
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(local.year, local.month - 1, 15, 12)),
    ),
  );
}

/** "12 – 18 out." for the week starting `monday`. */
export function weekTitle(monday: string, locale: string): string {
  const first = dateParts(monday, locale);
  const last = dateParts(addDays(monday, 6), locale);
  return first.month === last.month
    ? `${first.day} – ${last.day} ${last.month}`
    : `${first.day} ${first.month} – ${last.day} ${last.month}`;
}

export const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** "18:30" for minutes since midnight. */
export const minutesToClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "Sex. 16 out." for a YYYY-MM-DD date: fits the date bar on a phone. */
export function shortDayTitle(date: string, locale: string): string {
  const parts = dateParts(date, locale);
  return `${capitalise(parts.weekday)} ${parts.day} ${parts.month}`;
}
