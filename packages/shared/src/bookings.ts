import { z } from "zod";
import { BOOKING_ACTIVITIES, BOOKING_STATUSES, SPACE_KINDS, VENUE_KINDS } from "./domain.ts";

const blankToNull = (v: unknown) => (v === "" ? null : v);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalCount = z.preprocess(
  blankToNull,
  z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .nullish()
    .transform((v) => v ?? null),
);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** Most occurrences one recurring booking may create (a season is about 40 weeks). */
export const MAX_OCCURRENCES = 60;

export const createVenueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(VENUE_KINDS),
  address: optionalText(300),
});
export type CreateVenueInput = z.infer<typeof createVenueSchema>;

/** A space; `componentIds` makes it a combination of other spaces of the same venue. */
export const createSpaceSchema = z.object({
  venueId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(SPACE_KINDS),
  capacity: optionalCount,
  componentIds: z.array(z.uuid()).max(6).default([]),
});
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

export const updateSpaceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(SPACE_KINDS),
    capacity: optionalCount,
    active: z.boolean(),
    componentIds: z.array(z.uuid()).max(6),
  })
  .partial();
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

/** Weekly recurrence: the same Lisbon wall-clock time every `everyWeeks` weeks until a date. */
export const repeatSchema = z.object({
  everyWeeks: z.coerce.number().int().min(1).max(8).default(1),
  until: dateString,
});

const bookingFields = {
  spaceId: z.uuid(),
  departmentId: z.uuid(),
  teamId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  activity: z.enum(BOOKING_ACTIVITIES),
  title: optionalText(200),
  targetGroup: optionalText(200),
  expectedAttendance: optionalCount,
  notes: optionalText(2000),
};

/** Body of POST /api/bookings. Users limited to a team always create `to_confirm` requests. */
export const createBookingSchema = z
  .object({
    ...bookingFields,
    startsAt: instant,
    endsAt: instant,
    status: z.enum(BOOKING_STATUSES).default("to_confirm"),
    repeat: repeatSchema.nullish().transform((v) => v ?? null),
  })
  .refine((b) => b.endsAt > b.startsAt, { path: ["endsAt"], message: "must be after startsAt" });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Body of PATCH /api/bookings/:id. Space and time changes apply to one booking; the other
 * fields can apply to the rest of a series too (`applyTo: "following"`).
 */
export const updateBookingSchema = z
  .object({
    ...bookingFields,
    startsAt: instant,
    endsAt: instant,
    status: z.enum(BOOKING_STATUSES),
    actualAttendance: optionalCount,
    applyTo: z.enum(["one", "following"]).default("one"),
  })
  .partial()
  .refine((b) => !b.startsAt || !b.endsAt || b.endsAt > b.startsAt, {
    path: ["endsAt"],
    message: "must be after startsAt",
  });
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

/** Query of GET /api/bookings: Lisbon calendar days, both inclusive. */
export const listBookingsQuerySchema = z.object({
  from: dateString,
  to: dateString,
  spaceId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
