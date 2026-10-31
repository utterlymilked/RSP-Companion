import { fromLisbon, isBlockingStatus, parseLocal } from "@rsc/shared";
import { type BookingSummary, bookingsOf, type SpaceSummary } from "./occupancy";
import { minutesToClock } from "./time";

/** Bookable hours of the complex, in minutes since midnight (Lisbon). */
export const OPEN = 8 * 60;
export const CLOSE = 23 * 60;
/** Lengths offered when booking, like Playtomic's 60 / 90 / 120 (the club's sessions). */
export const DURATIONS = [30, 60, 90, 120, 180] as const;
export const DEFAULT_DURATION = 90;
const STEP = 15;

/** Fields (campos) and rooms (salas, gabinetes, auditório) are booked separately. */
export type SpaceCategory = "fields" | "rooms";
export const categoryOf = (space: Pick<SpaceSummary, "kind">): SpaceCategory =>
  space.kind === "field" ? "fields" : "rooms";

const instant = (day: string, minutes: number) => {
  const local = parseLocal(day, minutesToClock(minutes));
  return local ? fromLisbon(local).toISOString() : "";
};

/**
 * A start time of the day: free, or taken by `booking`. `maxDuration` is how long a session
 * starting here can last before the next booking or closing time.
 */
export interface Slot {
  start: number;
  booking: BookingSummary | null;
  maxDuration: number;
}

/**
 * Every quarter hour of `day` from opening to closing, after `now` when `day` is today. A start
 * is taken only when it falls inside a booking (so 19:00–20:00 greys out 19:00 to 19:45, not
 * 18:45). A start just before a booking stays free; its `maxDuration` says how long fits, and
 * the screen caps the session to it. A request still "a confirmar" blocks too, so two teams
 * never ask for the same slot.
 */
export function daySlots(
  spaceId: string,
  day: string,
  bookings: BookingSummary[],
  spaces: SpaceSummary[],
  now = new Date(),
): Slot[] {
  const taken = bookingsOf(spaceId, bookings, spaces).filter((b) => isBlockingStatus(b.status));
  const nowIso = now.toISOString();
  const slots: Slot[] = [];
  for (let start = OPEN; start + STEP <= CLOSE; start += STEP) {
    const from = instant(day, start);
    if (from < nowIso) continue;
    const inside = taken.find((b) => b.startsAt <= from && from < b.endsAt);
    const next = taken
      .filter((b) => b.startsAt > from)
      .sort((x, y) => x.startsAt.localeCompare(y.startsAt))[0];
    const untilNext = next ? (Date.parse(next.startsAt) - Date.parse(from)) / 60000 : Infinity;
    const maxDuration = Math.min(CLOSE - start, untilNext);
    // A gap shorter than the smallest session is as good as taken.
    const booking = inside ?? (maxDuration < STEP ? (next ?? null) : null);
    slots.push({ start, booking, maxDuration });
  }
  return slots;
}

/** The session length for a pick: the wanted `duration`, shortened to fit before the next booking. */
export const fitDuration = (slot: Pick<Slot, "maxDuration">, duration: number) =>
  Math.max(STEP, Math.min(duration, Math.floor(slot.maxDuration / STEP) * STEP));

/** The free start times of `daySlots` where a session of `duration` fits whole. */
export const freeStarts = (
  spaceId: string,
  day: string,
  duration: number,
  ...rest: [BookingSummary[], SpaceSummary[], Date?]
): number[] =>
  daySlots(spaceId, day, ...rest)
    .filter((s) => !s.booking && s.maxDuration >= duration)
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

/** "1h30" for 90 minutes, "30min" below an hour. */
export const durationLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes}min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
