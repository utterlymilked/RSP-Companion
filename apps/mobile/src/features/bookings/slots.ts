import { fromLisbon, isBlockingStatus, parseLocal } from "@rsc/shared";
import { type BookingSummary, bookingsOf, type SpaceSummary } from "./occupancy";
import { minutesToClock } from "./time";

/** Bookable hours of the complex, in minutes since midnight (Lisbon). */
export const OPEN = 8 * 60;
export const CLOSE = 23 * 60;
/** Lengths offered when booking, like Playtomic's 60 / 90 / 120 (the club's sessions). */
export const DURATIONS = [60, 90, 120, 180] as const;
export const DEFAULT_DURATION = 90;
const STEP = 30;

/** Fields (campos) and rooms (salas, gabinetes, auditório) are booked separately. */
export type SpaceCategory = "fields" | "rooms";
export const categoryOf = (space: Pick<SpaceSummary, "kind">): SpaceCategory =>
  space.kind === "field" ? "fields" : "rooms";

const instant = (day: string, minutes: number) => {
  const local = parseLocal(day, minutesToClock(minutes));
  return local ? fromLisbon(local).toISOString() : "";
};

/** A start time of the day: free, or taken by `booking`. */
export interface Slot {
  start: number;
  booking: BookingSummary | null;
}

/**
 * Every start time (minutes since midnight) at which a session of `duration` minutes fits in
 * `day`: every half hour from opening, ending by closing time, after `now` when `day` is
 * today. A slot overlapping a booking carries it, so the screen can show who has it instead
 * of hiding it. A request still "a confirmar" blocks too, so two teams never ask for the
 * same slot.
 */
export function daySlots(
  spaceId: string,
  day: string,
  duration: number,
  bookings: BookingSummary[],
  spaces: SpaceSummary[],
  now = new Date(),
): Slot[] {
  const taken = bookingsOf(spaceId, bookings, spaces).filter((b) => isBlockingStatus(b.status));
  const nowIso = now.toISOString();
  const slots: Slot[] = [];
  for (let start = OPEN; start + duration <= CLOSE; start += STEP) {
    const from = instant(day, start);
    const to = instant(day, start + duration);
    if (from < nowIso) continue;
    slots.push({ start, booking: taken.find((b) => b.startsAt < to && from < b.endsAt) ?? null });
  }
  return slots;
}

/** The free start times of `daySlots`. */
export const freeStarts = (...args: Parameters<typeof daySlots>): number[] =>
  daySlots(...args)
    .filter((s) => !s.booking)
    .map((s) => s.start);

/** Morning, afternoon and evening, as TheFork groups lunch and dinner times. */
export function groupStarts<T extends number | Slot>(starts: T[]) {
  const minute = (s: T) => (typeof s === "number" ? s : s.start);
  return [
    { key: "morning", starts: starts.filter((s) => minute(s) < 12 * 60) },
    { key: "afternoon", starts: starts.filter((s) => minute(s) >= 12 * 60 && minute(s) < 18 * 60) },
    { key: "evening", starts: starts.filter((s) => minute(s) >= 18 * 60) },
  ].filter((g) => g.starts.length > 0);
}

/** "1h30" for 90 minutes. */
export const durationLabel = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
