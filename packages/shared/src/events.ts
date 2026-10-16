import { z } from "zod";
import { EVENT_KINDS, EVENT_STATUSES, HOME_AWAY, MATCH_FORMATS, MATCH_TYPES } from "./domain.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const uuidOrNull = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

/** Most sessions one recurring training may create (a season is about 40 weeks). */
export const MAX_EVENT_OCCURRENCES = 60;

/** What only a match has: competition, round, format, opponent, kit, transport, cover. */
export const matchDetailsSchema = z.object({
  matchType: z.enum(MATCH_TYPES),
  competition: optionalText(200),
  round: optionalText(60),
  format: z
    .enum(MATCH_FORMATS)
    .nullish()
    .transform((v) => v ?? null),
  opponent: z.string().trim().min(1).max(200),
  homeAway: z.enum(HOME_AWAY),
  kit: optionalText(200),
  transport: optionalText(300),
  medicalCover: optionalText(300),
});
export type MatchDetailsInput = z.infer<typeof matchDetailsSchema>;

/**
 * Body of POST /api/events. With `spaceId` (and `departmentId`) the event also reserves the
 * space through a booking; away matches name an external `venueId` or a free-text `location`.
 * Only trainings repeat. Users limited to a team create events of that team.
 */
export const createEventSchema = z
  .object({
    kind: z.enum(EVENT_KINDS),
    teamId: uuidOrNull,
    title: optionalText(200),
    startsAt: instant,
    endsAt: instant,
    spaceId: uuidOrNull,
    departmentId: uuidOrNull,
    venueId: uuidOrNull,
    location: optionalText(300),
    notes: optionalText(2000),
    match: matchDetailsSchema.nullish().transform((v) => v ?? null),
    repeat: z
      .object({
        everyWeeks: z.coerce.number().int().min(1).max(8).default(1),
        until: dateString,
      })
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((e) => e.endsAt > e.startsAt, { path: ["endsAt"], message: "must be after startsAt" })
  .refine((e) => (e.kind === "match") === (e.match !== null), {
    path: ["match"],
    message: "match details are required for matches and only for matches",
  })
  .refine((e) => !e.spaceId || e.departmentId, {
    path: ["departmentId"],
    message: "required with a space",
  })
  .refine((e) => !e.repeat || e.kind === "training", {
    path: ["repeat"],
    message: "only trainings repeat",
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Body of PATCH /api/events/:id. Time and status changes carry over to the booking. */
export const updateEventSchema = z
  .object({
    title: optionalText(200),
    startsAt: instant,
    endsAt: instant,
    status: z.enum(EVENT_STATUSES),
    venueId: uuidOrNull,
    location: optionalText(300),
    notes: optionalText(2000),
    match: matchDetailsSchema.partial(),
  })
  .partial()
  .refine((e) => !e.startsAt || !e.endsAt || e.endsAt > e.startsAt, {
    path: ["endsAt"],
    message: "must be after startsAt",
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Query of GET /api/events: Lisbon calendar days, both inclusive. */
export const listEventsQuerySchema = z.object({
  from: dateString,
  to: dateString,
  teamId: z.uuid().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
