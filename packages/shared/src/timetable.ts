/**
 * The weekly timetable of the pitches and rooms ("horário semanal"): for each bookable space,
 * seven days of time rows, with a pitch that can be booked in parts split into side-by-side
 * columns. One layout feeds the app's grid and the Excel and PDF exports, so they never differ.
 */
import { type BookingStatus, isBlockingStatus } from "./domain.ts";
import { localDateString, toLisbon } from "./lisbon.ts";
import {
  overlappingSpaceIds,
  PITCH_UNITS,
  partMark,
  partSpan,
  type SpaceGeometry,
} from "./pitch.ts";

/** The hours a timetable shows unless asked otherwise: the club's evening training slots. */
export const TIMETABLE_DEFAULT_RANGE = { from: 17, to: 22 } as const;
/** The widest range a timetable offers, as whole hours of the day. */
export const TIMETABLE_HOURS = { min: 8, max: 23 } as const;
/** Rows of the timetable are this many minutes. */
export const TIMETABLE_STEP = 30;

export type TimetableCategory = "fields" | "rooms";

/** A space as the timetable needs it (GET /api/facilities returns more). */
export interface TimetableSpace extends SpaceGeometry {
  name: string;
  kind: string;
  active: boolean;
  /** Ways this whole pitch can also be booked in parts (2 = halves, 3 = thirds, 4 = quarters). */
  divisions: number[];
}

/** The part of a booking the layout looks at. */
export interface TimetableBooking {
  id: string;
  spaceId: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
}

/** One booking drawn in one day of one space's grid. Times are minutes since Lisbon midnight. */
export interface TimetableBlock<T extends TimetableBooking> {
  booking: T;
  startMin: number;
  endMin: number;
  /** Stretch of the pitch it covers, in `PITCH_UNITS` (the whole width unless it is a part). */
  fromUnit: number;
  toUnit: number;
  /** Side-by-side lane among blocks that overlap it in time and width, and how many there are. */
  lane: number;
  lanes: number;
  /** Booked through another space (a whole pitch or a combination), not this one or a part. */
  via: boolean;
}

export interface TimetableSheet<T extends TimetableBooking> {
  space: TimetableSpace;
  /** Columns per day: 1, or the finest way the pitch splits (3 for thirds). */
  columns: number;
  /** "A", "B" for halves, "1".."4" otherwise; empty when the pitch has no parts. */
  columnMarks: string[];
  days: { date: string; blocks: TimetableBlock<T>[] }[];
}

/** Whether `space` is booked as a field or as a room. */
export const timetableCategory = (space: Pick<TimetableSpace, "kind">): TimetableCategory =>
  space.kind === "field" ? "fields" : "rooms";

/** Columns a pitch is drawn with per day: its finest division, or 1. */
export const timetableColumns = (space: Pick<TimetableSpace, "divisions">): number =>
  Math.max(1, ...space.divisions);

/**
 * The part of `pitch` that column `column` (0-based) of its grid books, or the pitch itself
 * when it has no such part.
 */
export function columnSpace<S extends TimetableSpace>(
  pitch: S,
  spaces: S[],
  column: number,
  columns = timetableColumns(pitch),
): S {
  if (columns <= 1) return pitch;
  return (
    spaces.find(
      (s) => s.parentId === pitch.id && s.partCount === columns && s.partIndex === column + 1,
    ) ?? pitch
  );
}

/** Minutes since Lisbon midnight of `iso` on `day`: 0 when it started on an earlier day. */
function minutesOn(iso: string, day: string, edge: "start" | "end"): number {
  const local = toLisbon(new Date(iso));
  const date = localDateString(local);
  if (date < day) return 0;
  if (date > day) return 24 * 60;
  const minutes = local.hour * 60 + local.minute;
  return edge === "end" && minutes === 0 ? 24 * 60 : minutes;
}

/** The blocking bookings that occupy `pitch` on `day`, laid out in lanes, clipped to `range`. */
export function dayBlocks<T extends TimetableBooking, S extends TimetableSpace>(
  pitch: S,
  spaces: S[],
  bookings: T[],
  day: string,
  range: { from: number; to: number } = TIMETABLE_DEFAULT_RANGE,
): TimetableBlock<T>[] {
  const related = overlappingSpaceIds(pitch.id, spaces);
  const from = range.from * 60;
  const to = range.to * 60;
  const blocks: TimetableBlock<T>[] = [];
  for (const booking of [...bookings].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  )) {
    if (!related.has(booking.spaceId) || !isBlockingStatus(booking.status)) continue;
    const startMin = Math.max(minutesOn(booking.startsAt, day, "start"), from);
    const endMin = Math.min(minutesOn(booking.endsAt, day, "end"), to);
    if (endMin <= startMin) continue;
    const own = spaces.find((s) => s.id === booking.spaceId);
    const isPart = own?.parentId === pitch.id && own.partCount && own.partIndex;
    const span = isPart
      ? partSpan(own.partCount as number, own.partIndex as number)
      : { from: 0, to: PITCH_UNITS };
    const clash = blocks.filter(
      (b) =>
        b.startMin < endMin && startMin < b.endMin && b.fromUnit < span.to && span.from < b.toUnit,
    );
    let lane = 0;
    while (clash.some((b) => b.lane === lane)) lane++;
    blocks.push({
      booking,
      startMin,
      endMin,
      fromUnit: span.from,
      toUnit: span.to,
      lane,
      lanes: lane + 1,
      via: !isPart && booking.spaceId !== pitch.id,
    });
  }
  // A block is as wide as the busiest moment it takes part in.
  for (const block of blocks) {
    const crowd = blocks.filter(
      (b) =>
        b.startMin < block.endMin &&
        block.startMin < b.endMin &&
        b.fromUnit < block.toUnit &&
        block.fromUnit < b.toUnit,
    );
    block.lanes = Math.max(...crowd.map((b) => b.lane + 1));
  }
  return blocks;
}

/**
 * One sheet per pitch (or room) of `category`, a week at a time: `days` are the YYYY-MM-DD
 * dates of the columns. Combined spaces and spaces that are parts of a pitch get no sheet of
 * their own; their bookings appear on the pitch they occupy.
 */
export function buildTimetable<T extends TimetableBooking, S extends TimetableSpace>(
  spaces: S[],
  bookings: T[],
  days: string[],
  category: TimetableCategory,
  range: { from: number; to: number } = TIMETABLE_DEFAULT_RANGE,
): TimetableSheet<T>[] {
  return spaces
    .filter(
      (s) =>
        s.active && !s.parentId && s.componentIds.length === 0 && timetableCategory(s) === category,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { numeric: true }))
    .map((space) => {
      const columns = timetableColumns(space);
      return {
        space,
        columns,
        columnMarks:
          columns > 1 ? Array.from({ length: columns }, (_, i) => partMark(columns, i + 1)) : [],
        days: days.map((date) => ({
          date,
          blocks: dayBlocks(space, spaces, bookings, date, range),
        })),
      };
    });
}
