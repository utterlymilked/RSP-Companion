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

/**
 * Start times (minutes since midnight) at which `spaceId` is free for `duration` minutes on
 * `day`: every half hour from opening, ending by closing time, after `now` when `day` is
 * today. A request still "a confirmar" blocks too, so two teams never ask for the same slot.
 */
export function freeStarts(
  spaceId: string,
  day: string,
  duration: number,
  bookings: BookingSummary[],
  spaces: SpaceSummary[],
  now = new Date(),
): number[] {
  const taken = bookingsOf(spaceId, bookings, spaces).filter((b) => isBlockingStatus(b.status));
  const nowIso = now.toISOString();
  const starts: number[] = [];
  for (let start = OPEN; start + duration <= CLOSE; start += STEP) {
    const from = instant(day, start);
    const to = instant(day, start + duration);
    if (from < nowIso) continue;
    if (taken.some((b) => b.startsAt < to && from < b.endsAt)) continue;
    starts.push(start);
  }
  return starts;
}

/** Morning, afternoon and evening, as TheFork groups lunch and dinner times. */
export function groupStarts(starts: number[]) {
  return [
    { key: "morning", starts: starts.filter((m) => m < 12 * 60) },
    { key: "afternoon", starts: starts.filter((m) => m >= 12 * 60 && m < 18 * 60) },
    { key: "evening", starts: starts.filter((m) => m >= 18 * 60) },
  ].filter((g) => g.starts.length > 0);
}

/** "1h30" for 90 minutes. */
export const durationLabel = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`;
