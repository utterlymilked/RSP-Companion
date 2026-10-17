import { randomBytes } from "node:crypto";
import {
  addLocalDays,
  BLOCKING_BOOKING_STATUSES,
  type BookingStatus,
  type CreateBookingInput,
  type CreateSpaceInput,
  type CreateVenueInput,
  fromLisbon,
  isBlockingStatus,
  localDateString,
  MAX_OCCURRENCES,
  overlappingSpaceIds,
  partName,
  toLisbon,
  type UpdateBookingInput,
  type UpdateSpaceInput,
} from "@rsc/shared";
import { and, asc, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { users } from "../auth/schema.js";
import { departments, organisations } from "../organisations/schema.js";
import { teams } from "../teams/schema.js";
import {
  bookingSeries,
  bookings,
  calendarFeeds,
  spaceComponents,
  spaces,
  venues,
} from "./schema.js";

/** Advisory-lock key that serialises every write that can create a conflict. */
const BOOKINGS_LOCK = 7_001;

// ---------------------------------------------------------------------------------------
// Venues and spaces
// ---------------------------------------------------------------------------------------

/** Everything a booking form needs: venues, spaces with their components, departments. */
export async function listFacilities(db: Db) {
  const [venueRows, spaceRows, componentRows, departmentRows] = await Promise.all([
    db.select().from(venues).orderBy(asc(venues.kind), asc(venues.name)),
    db.select().from(spaces).orderBy(asc(spaces.name)),
    db.select().from(spaceComponents),
    db
      .select({
        id: departments.id,
        name: departments.name,
        organisationId: departments.organisationId,
        organisationName: organisations.name,
      })
      .from(departments)
      .innerJoin(organisations, eq(organisations.id, departments.organisationId))
      .where(eq(departments.active, true))
      .orderBy(asc(organisations.name), asc(departments.name)),
  ]);
  return {
    venues: venueRows,
    spaces: spaceRows.map((s) => ({
      ...s,
      componentIds: componentRows.filter((c) => c.spaceId === s.id).map((c) => c.componentId),
    })),
    departments: departmentRows,
  };
}

export async function createVenue(db: Db, input: CreateVenueInput) {
  const [venue] = await db.insert(venues).values(input).returning();
  if (!venue) throw new Error("Insert returned no row");
  return venue;
}

/** Components must be plain spaces of the same venue, and a component cannot be combined. */
async function checkComponents(db: Db, spaceId: string | null, venueId: string, ids: string[]) {
  if (ids.length === 0) return;
  if (spaceId && ids.includes(spaceId)) throw new ApiError(400, "invalid_request");
  const rows = await db.select().from(spaces).where(inArray(spaces.id, ids));
  if (rows.length !== new Set(ids).size) throw new ApiError(404, "not_found");
  if (rows.some((s) => s.venueId !== venueId || s.parentId)) {
    throw new ApiError(400, "invalid_request");
  }
  const nested = await db
    .select({ id: spaceComponents.spaceId })
    .from(spaceComponents)
    .where(inArray(spaceComponents.spaceId, ids));
  if (nested.length > 0) throw new ApiError(400, "invalid_request");
  if (spaceId) {
    const [partOfOther] = await db
      .select({ id: spaceComponents.spaceId })
      .from(spaceComponents)
      .where(eq(spaceComponents.componentId, spaceId));
    if (partOfOther) throw new ApiError(400, "invalid_request");
  }
}

/**
 * Makes the parts of a whole pitch match its `divisions`: creates the missing ones, names them
 * after the pitch, and switches parts of removed divisions off (they keep their bookings).
 * Parts follow the pitch's name, capacity and active flag.
 */
export async function syncParts(db: Db, pitchId: string) {
  const [pitch] = await db.select().from(spaces).where(eq(spaces.id, pitchId));
  if (!pitch || pitch.parentId) return;
  const existing = await db.select().from(spaces).where(eq(spaces.parentId, pitchId));
  const wanted = new Set(pitch.divisions);
  for (const count of pitch.divisions) {
    for (let index = 1; index <= count; index++) {
      const part = existing.find((p) => p.partCount === count && p.partIndex === index);
      const shared = {
        name: partName(pitch.name, count, index),
        capacity: pitch.capacity,
        active: pitch.active,
      };
      if (part) await db.update(spaces).set(shared).where(eq(spaces.id, part.id));
      else {
        await db.insert(spaces).values({
          ...shared,
          venueId: pitch.venueId,
          kind: pitch.kind,
          parentId: pitchId,
          partCount: count,
          partIndex: index,
        });
      }
    }
  }
  const removed = existing.filter((p) => p.partCount && !wanted.has(p.partCount));
  if (removed.length > 0) {
    await db
      .update(spaces)
      .set({ active: false })
      .where(
        inArray(
          spaces.id,
          removed.map((p) => p.id),
        ),
      );
  }
}

export async function createSpace(db: Db, input: CreateSpaceInput) {
  const { componentIds, ...values } = input;
  if (componentIds.length > 0 && values.divisions.length > 0) {
    throw new ApiError(400, "invalid_request");
  }
  await checkComponents(db, null, values.venueId, componentIds);
  const [space] = await db.insert(spaces).values(values).returning();
  if (!space) throw new Error("Insert returned no row");
  if (componentIds.length > 0) {
    await db
      .insert(spaceComponents)
      .values(componentIds.map((componentId) => ({ spaceId: space.id, componentId })));
  }
  await syncParts(db, space.id);
  return { ...space, componentIds };
}

/** Returns null when the space does not exist. */
export async function updateSpace(db: Db, spaceId: string, input: UpdateSpaceInput) {
  const { componentIds, ...values } = input;
  const [current] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (!current) return null;
  // A part is configured through its pitch: only its pitch's name and divisions are editable.
  if (current.parentId) throw new ApiError(400, "invalid_request");
  const nextComponents = componentIds ?? (await componentsOf(db, spaceId));
  if (nextComponents.length > 0 && (values.divisions ?? current.divisions).length > 0) {
    throw new ApiError(400, "invalid_request");
  }
  if (componentIds) {
    await checkComponents(db, spaceId, current.venueId, componentIds);
    await db.delete(spaceComponents).where(eq(spaceComponents.spaceId, spaceId));
    if (componentIds.length > 0) {
      await db
        .insert(spaceComponents)
        .values(componentIds.map((componentId) => ({ spaceId, componentId })));
    }
  }
  const [space] =
    Object.keys(values).length > 0
      ? await db.update(spaces).set(values).where(eq(spaces.id, spaceId)).returning()
      : [current];
  if (!space) return null;
  await syncParts(db, spaceId);
  return { ...space, componentIds: await componentsOf(db, spaceId) };
}

async function componentsOf(db: Db, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ id: spaceComponents.componentId })
    .from(spaceComponents)
    .where(eq(spaceComponents.spaceId, spaceId));
  return rows.map((c) => c.id);
}

// ---------------------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------------------

/**
 * The spaces that cannot be used at the same time as `spaceId`: itself and every space whose
 * footprint overlaps its own (see `overlappingSpaceIds` in @rsc/shared). Campo 2 whole
 * conflicts with all its halves and thirds; a half with the whole and the thirds it touches,
 * but not with the other half; campo 2 never conflicts with campo 3.
 */
export async function conflictingSpaceIds(db: Db, spaceId: string): Promise<string[]> {
  const [rows, components] = await Promise.all([
    db
      .select({
        id: spaces.id,
        parentId: spaces.parentId,
        partCount: spaces.partCount,
        partIndex: spaces.partIndex,
      })
      .from(spaces),
    db.select().from(spaceComponents),
  ]);
  const geometry = rows.map((s) => ({
    ...s,
    componentIds: components.filter((c) => c.spaceId === s.id).map((c) => c.componentId),
  }));
  return [...overlappingSpaceIds(spaceId, geometry)];
}

export interface BookingConflict {
  id: string;
  spaceId: string;
  startsAt: Date;
  endsAt: Date;
  title: string | null;
}

/** Blocking bookings that overlap the range in `spaceId` or a space that overlaps it. */
export async function findConflicts(
  db: Db,
  input: { spaceId: string; startsAt: Date; endsAt: Date; excludeIds?: string[] },
): Promise<BookingConflict[]> {
  const spaceIds = await conflictingSpaceIds(db, input.spaceId);
  return db
    .select({
      id: bookings.id,
      spaceId: bookings.spaceId,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      title: bookings.title,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.spaceId, spaceIds),
        inArray(bookings.status, [...BLOCKING_BOOKING_STATUSES]),
        lt(bookings.startsAt, input.endsAt),
        gt(bookings.endsAt, input.startsAt),
        input.excludeIds?.length ? notInArray(bookings.id, input.excludeIds) : undefined,
      ),
    )
    .orderBy(asc(bookings.startsAt));
}

const lockBookings = (db: Db) => db.execute(sql`select pg_advisory_xact_lock(${BOOKINGS_LOCK})`);

async function requireBookableSpace(db: Db, spaceId: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (!space) throw new ApiError(404, "not_found");
  if (!space.active) throw new ApiError(400, "invalid_request");
}

// ---------------------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------------------

export interface Occurrence {
  startsAt: Date;
  endsAt: Date;
}

/**
 * The time ranges of a booking: one, or one per `everyWeeks` weeks until `repeat.until`, at
 * the same Lisbon wall-clock time (so 19:00 stays 19:00 across the summer-time change).
 */
export function occurrences(
  range: Occurrence,
  repeat: { everyWeeks: number; until: string } | null,
): Occurrence[] {
  if (!repeat) return [range];
  const start = toLisbon(range.startsAt);
  const end = toLisbon(range.endsAt);
  if (repeat.until < localDateString(start)) throw new ApiError(400, "invalid_request");
  const result: Occurrence[] = [];
  for (let week = 0; ; week += repeat.everyWeeks) {
    const s = addLocalDays(start, week * 7);
    if (localDateString(s) > repeat.until) break;
    if (result.length >= MAX_OCCURRENCES) throw new ApiError(400, "invalid_request");
    result.push({ startsAt: fromLisbon(s), endsAt: fromLisbon(addLocalDays(end, week * 7)) });
  }
  return result;
}

function conflictError(found: { startsAt: Date; conflicts: BookingConflict[] }[]) {
  return new ApiError(409, "booking_conflict", found);
}

/**
 * Creates one booking, or all occurrences of a recurring one. Blocking statuses are checked
 * against the space (and its combinations) under an advisory lock, all or nothing: a single
 * conflict rejects the whole series with 409 `booking_conflict` listing the clashes. Must run
 * in a transaction.
 */
export async function createBookings(db: Db, input: CreateBookingInput, createdBy: string | null) {
  const { repeat, startsAt, endsAt, ...fields } = input;
  const times = occurrences({ startsAt, endsAt }, repeat);
  await requireBookableSpace(db, fields.spaceId);
  if (isBlockingStatus(fields.status)) {
    await lockBookings(db);
    const clashes = [];
    for (const time of times) {
      const conflicts = await findConflicts(db, { spaceId: fields.spaceId, ...time });
      if (conflicts.length > 0) clashes.push({ startsAt: time.startsAt, conflicts });
    }
    if (clashes.length > 0) throw conflictError(clashes);
  }
  let seriesId: string | null = null;
  if (repeat && times.length > 1) {
    const [series] = await db
      .insert(bookingSeries)
      .values({ everyWeeks: repeat.everyWeeks, untilOn: repeat.until })
      .returning();
    seriesId = series?.id ?? null;
  }
  return db
    .insert(bookings)
    .values(times.map((time) => ({ ...fields, ...time, seriesId, createdBy })))
    .returning();
}

type BookingPatch = Partial<Omit<UpdateBookingInput, "applyTo">>;

/**
 * Updates a booking, or it and the later ones of its series (`applyTo: "following"`, which
 * cannot move them in space or time). Changes that occupy a space are conflict-checked.
 * Returns null when the booking does not exist. Must run in a transaction.
 */
export async function updateBooking(
  db: Db,
  bookingId: string,
  input: UpdateBookingInput,
  allow: { teamIds: string[] | "all"; ownedBy?: string } = { teamIds: "all" },
) {
  const { applyTo, ...rawPatch } = input;
  const patch = Object.fromEntries(
    Object.entries(rawPatch).filter(([, v]) => v !== undefined),
  ) as BookingPatch;
  const [current] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!current) return null;
  if (allow.ownedBy) {
    // Own bookings only, and never handed to a team.
    if (current.createdBy !== allow.ownedBy || patch.teamId) throw new ApiError(403, "forbidden");
  } else if (
    allow.teamIds !== "all" &&
    (!current.teamId || !allow.teamIds.includes(current.teamId))
  ) {
    throw new ApiError(403, "forbidden");
  }
  if (
    !allow.ownedBy &&
    allow.teamIds !== "all" &&
    patch.teamId !== undefined &&
    (patch.teamId === null || !allow.teamIds.includes(patch.teamId))
  ) {
    throw new ApiError(403, "forbidden");
  }
  const moves = patch.startsAt || patch.endsAt || patch.spaceId;
  if (applyTo === "following" && moves) throw new ApiError(400, "invalid_request");

  await lockBookings(db);
  const targets =
    applyTo === "following" && current.seriesId
      ? await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.seriesId, current.seriesId),
              sql`${bookings.startsAt} >= ${current.startsAt}`,
            ),
          )
          .orderBy(asc(bookings.startsAt))
      : [current];
  if (patch.spaceId) await requireBookableSpace(db, patch.spaceId);

  const next = targets.map((t) => ({ ...t, ...patch }));
  for (const n of next) {
    if (n.endsAt <= n.startsAt) throw new ApiError(400, "invalid_request");
  }
  const clashes = [];
  for (const [i, n] of next.entries()) {
    const before = targets[i];
    const occupies =
      isBlockingStatus(n.status) &&
      (moves !== undefined || (before && !isBlockingStatus(before.status)));
    if (!occupies) continue;
    const conflicts = await findConflicts(db, {
      spaceId: n.spaceId,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      excludeIds: targets.map((t) => t.id),
    });
    if (conflicts.length > 0) clashes.push({ startsAt: n.startsAt, conflicts });
  }
  if (clashes.length > 0) throw conflictError(clashes);

  return db
    .update(bookings)
    .set(patch)
    .where(
      inArray(
        bookings.id,
        targets.map((t) => t.id),
      ),
    )
    .returning();
}

const bookingView = {
  id: bookings.id,
  spaceId: bookings.spaceId,
  spaceName: spaces.name,
  venueName: venues.name,
  departmentId: bookings.departmentId,
  departmentName: departments.name,
  teamId: bookings.teamId,
  teamName: teams.name,
  createdById: bookings.createdBy,
  createdByName: users.name,
  seriesId: bookings.seriesId,
  activity: bookings.activity,
  status: bookings.status,
  title: bookings.title,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  targetGroup: bookings.targetGroup,
  expectedAttendance: bookings.expectedAttendance,
  actualAttendance: bookings.actualAttendance,
  notes: bookings.notes,
  updatedAt: bookings.updatedAt,
};

const bookingQuery = (db: Db) =>
  db
    .select(bookingView)
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(venues, eq(venues.id, spaces.venueId))
    .innerJoin(departments, eq(departments.id, bookings.departmentId))
    .leftJoin(teams, eq(teams.id, bookings.teamId))
    .leftJoin(users, eq(users.id, bookings.createdBy));

/** Bookings that overlap [from, to), earliest first. */
export function listBookings(
  db: Db,
  filter: {
    from: Date;
    to: Date;
    spaceId?: string;
    departmentId?: string;
    status?: BookingStatus;
    statuses?: readonly BookingStatus[];
  },
) {
  return bookingQuery(db)
    .where(
      and(
        lt(bookings.startsAt, filter.to),
        gt(bookings.endsAt, filter.from),
        filter.spaceId ? eq(bookings.spaceId, filter.spaceId) : undefined,
        filter.departmentId ? eq(bookings.departmentId, filter.departmentId) : undefined,
        filter.status ? eq(bookings.status, filter.status) : undefined,
        filter.statuses ? inArray(bookings.status, [...filter.statuses]) : undefined,
      ),
    )
    .orderBy(asc(bookings.startsAt), asc(spaces.name));
}

/** Bookings `userId` made, upcoming first and then the past (newest first). */
export async function listBookingsBy(db: Db, userId: string, now = new Date()) {
  const rows = await bookingQuery(db)
    .where(eq(bookings.createdBy, userId))
    .orderBy(asc(bookings.startsAt))
    .limit(500);
  const upcoming = rows.filter((b) => b.endsAt > now);
  const past = rows.filter((b) => b.endsAt <= now).reverse();
  return { upcoming, past };
}

export async function getBooking(db: Db, bookingId: string) {
  const [booking] = await bookingQuery(db).where(eq(bookings.id, bookingId));
  return booking ?? null;
}

// ---------------------------------------------------------------------------------------
// Calendar feed (iCal)
// ---------------------------------------------------------------------------------------

const newToken = () => randomBytes(24).toString("base64url");

/** The user's feed token, created on first use. `rotate` replaces it (old links stop working). */
export async function feedToken(db: Db, userId: string, rotate = false): Promise<string> {
  const [existing] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  if (existing && !rotate) return existing.token;
  const token = newToken();
  await db
    .insert(calendarFeeds)
    .values({ userId, token })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { token } });
  return token;
}

/** The user a feed token belongs to, or null. */
export async function feedUser(db: Db, token: string): Promise<string | null> {
  const [feed] = await db
    .select({ userId: calendarFeeds.userId })
    .from(calendarFeeds)
    .innerJoin(users, eq(users.id, calendarFeeds.userId))
    .where(eq(calendarFeeds.token, token));
  return feed?.userId ?? null;
}

const ACTIVITY_LABELS_PT: Record<string, string> = {
  training: "Treino",
  match: "Jogo",
  formation: "Formação",
  game_analysis: "Análise de jogo",
  meeting: "Reunião",
  recruitment: "Recrutamento",
  rental: "Aluguer",
  other: "Reserva",
};

const icsEscape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, ";").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (date: Date) => `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

/** Folds a content line at 75 octets, never inside a multi-byte character (RFC 5545). */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

type FeedBooking = Awaited<ReturnType<typeof listBookings>>[number];

/** An iCalendar document (UTC times) for bookings, e.g. for a calendar subscription. */
export function buildIcs(items: readonly FeedBooking[], calendarName = "SFF RSC"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Real Sport Clube Massama//SFF RSC//PT",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    "X-WR-TIMEZONE:Europe/Lisbon",
  ];
  for (const b of items) {
    const summary = `${b.title ?? ACTIVITY_LABELS_PT[b.activity] ?? "Reserva"} (${b.departmentName})`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@rsc-companion`,
      `DTSTAMP:${icsDate(b.updatedAt)}`,
      `DTSTART:${icsDate(b.startsAt)}`,
      `DTEND:${icsDate(b.endsAt)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(`${b.spaceName}, ${b.venueName}`)}`,
      `STATUS:${b.status === "to_confirm" ? "TENTATIVE" : "CONFIRMED"}`,
    );
    if (b.targetGroup) lines.push(`DESCRIPTION:${icsEscape(b.targetGroup)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
