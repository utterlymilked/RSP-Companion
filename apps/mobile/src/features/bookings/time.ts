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
