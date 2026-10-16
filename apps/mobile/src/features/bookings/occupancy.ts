import { type BookingActivity, type BookingStatus, isBlockingStatus, toLisbon } from "@rsc/shared";

/** A booking as GET /api/bookings returns it (times as ISO strings). */
export interface BookingSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  departmentName: string;
  /** The team it is for, and the user who made it (both may be missing on old rows). */
  teamName?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  activity: BookingActivity;
  status: BookingStatus;
  title: string | null;
  startsAt: string;
  endsAt: string;
}

/** A space as GET /api/facilities returns it. */
export interface SpaceSummary {
  id: string;
  name: string;
  kind: string;
  capacity: number | null;
  active: boolean;
  componentIds: string[];
}

export type SpaceState = "free" | "pending" | "busy";

/**
 * The spaces whose bookings occupy `spaceId`: itself, the combinations it is part of (Campo 2+3
 * occupies Campo 2) and its own components (Campo 2 taken means Campo 2+3 is not free).
 */
export function relatedSpaceIds(spaceId: string, spaces: SpaceSummary[]): Set<string> {
  const related = new Set([spaceId]);
  for (const space of spaces) {
    if (space.componentIds.includes(spaceId)) related.add(space.id);
    if (space.id === spaceId) for (const c of space.componentIds) related.add(c);
  }
  return related;
}

/** Bookings that take up `spaceId`, directly or through a combination, earliest first. */
export function bookingsOf<T extends BookingSummary>(
  spaceId: string,
  bookings: T[],
  spaces: SpaceSummary[],
): T[] {
  const related = relatedSpaceIds(spaceId, spaces);
  return bookings
    .filter((b) => related.has(b.spaceId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Whether a space is free at instant `at`: busy when a confirmed (or done) booking covers it,
 * pending when only a request "a confirmar" does. Cancelled and similar statuses never block.
 * `until` is when the current state ends: the booking's end, or the next booking's start
 * (null when nothing else is booked in `bookings`).
 */
export function stateAt(
  spaceId: string,
  at: Date,
  bookings: BookingSummary[],
  spaces: SpaceSummary[],
): { state: SpaceState; booking: BookingSummary | null; until: string | null } {
  const time = at.toISOString();
  const blocking = bookingsOf(spaceId, bookings, spaces).filter((b) => isBlockingStatus(b.status));
  const current = blocking.filter((b) => b.startsAt <= time && time < b.endsAt);
  const confirmed = current.find((b) => b.status !== "to_confirm");
  const booking = confirmed ?? current[0] ?? null;
  if (booking) {
    return { state: confirmed ? "busy" : "pending", booking, until: booking.endsAt };
  }
  const next = blocking.find((b) => b.startsAt > time);
  return { state: "free", booking: null, until: next?.startsAt ?? null };
}

/** Minutes since midnight in Lisbon, e.g. 18:30 → 1110. */
export function lisbonMinutes(iso: string | Date): number {
  const local = toLisbon(typeof iso === "string" ? new Date(iso) : iso);
  return local.hour * 60 + local.minute;
}

/**
 * Side-by-side lanes for overlapping items in a calendar column: each item gets a lane index and
 * the number of lanes in its group of overlapping items, so blocks never cover each other.
 * `group` numbers the groups, for views that summarise a crowded group instead.
 */
export function layoutLanes<T extends { startsAt: string; endsAt: string }>(
  items: T[],
): { item: T; lane: number; lanes: number; group: number }[] {
  const sorted = [...items].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || b.endsAt.localeCompare(a.endsAt),
  );
  const result: { item: T; lane: number; lanes: number; group: number }[] = [];
  let group: { item: T; lane: number; lanes: number; group: number }[] = [];
  let groupIndex = 0;
  let groupEnd = "";
  let laneEnds: string[] = [];
  const close = () => {
    for (const placed of group) placed.lanes = laneEnds.length;
    result.push(...group);
    group = [];
    laneEnds = [];
    groupIndex++;
  };
  for (const item of sorted) {
    if (group.length > 0 && item.startsAt >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= item.startsAt);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endsAt;
    group.push({ item, lane, lanes: 0, group: groupIndex });
    if (item.endsAt > groupEnd || group.length === 1) groupEnd = item.endsAt;
  }
  close();
  return result;
}

/** Who a booking belongs to: its team, else the person who made it, else the department. */
export const whoOf = (b: Pick<BookingSummary, "teamName" | "createdByName" | "departmentName">) =>
  b.teamName ?? b.createdByName ?? b.departmentName;

/** Who made a booking, when it is not the same as `whoOf` (team bookings name their maker). */
export const makerOf = (b: Pick<BookingSummary, "teamName" | "createdByName">) =>
  b.teamName && b.createdByName ? b.createdByName : null;

/**
 * The run of bookings back to back with `booking` in the same space (or one it combines with):
 * each starts when the previous ends (or earlier, if they overlap), so one tap on a taken
 * stretch can show everyone who holds a part of it. Earliest first; includes `booking`.
 */
export function contiguousChain<T extends BookingSummary>(
  booking: T,
  bookings: T[],
  spaces: SpaceSummary[],
): T[] {
  const pool = bookingsOf(booking.spaceId, bookings, spaces).filter((b) =>
    isBlockingStatus(b.status),
  );
  if (!pool.some((b) => b.id === booking.id)) return [booking];
  let from = booking.startsAt;
  let to = booking.endsAt;
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of pool) {
      if (b.startsAt <= to && b.endsAt >= from && (b.startsAt < from || b.endsAt > to)) {
        from = b.startsAt < from ? b.startsAt : from;
        to = b.endsAt > to ? b.endsAt : to;
        grew = true;
      }
    }
  }
  return pool.filter((b) => b.startsAt >= from && b.endsAt <= to);
}
