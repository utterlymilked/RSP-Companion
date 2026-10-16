import { z } from "zod";
import { ATTENDANCE_STATUSES, RSVP_STATUSES } from "./domain.ts";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** Most people one attendance sync or call-up may carry (a squad is far smaller). */
export const MAX_CALLUP_BATCH = 100;

/** Body of POST /api/callups/events/:id. Without `personIds` the whole current roster is called up. */
export const callUpSchema = z.object({
  personIds: z.array(z.uuid()).min(1).max(MAX_CALLUP_BATCH).optional(),
});
export type CallUpInput = z.infer<typeof callUpSchema>;

/**
 * Body of PUT /api/callups/events/:id/attendance. Each mark carries the time it was taken
 * on the device, so replaying a queue after being offline is safe: a mark never overwrites a
 * newer one, and `status: null` clears it. People not yet called up are added.
 */
export const attendanceSyncSchema = z.object({
  marks: z
    .array(
      z.object({
        personId: z.uuid(),
        status: z.enum(ATTENDANCE_STATUSES).nullable(),
        markedAt: instant,
      }),
    )
    .min(1)
    .max(MAX_CALLUP_BATCH),
});
export type AttendanceSyncInput = z.infer<typeof attendanceSyncSchema>;

/** Body of PUT /api/callups/events/:id/people/:personId/rsvp. */
export const rsvpSchema = z.object({
  rsvp: z.enum(RSVP_STATUSES),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type RsvpInput = z.infer<typeof rsvpSchema>;

/** Query of GET /api/callups/stats: one team over Lisbon calendar days, both inclusive. */
export const attendanceStatsQuerySchema = z.object({
  teamId: z.uuid(),
  from: dateString,
  to: dateString,
});
export type AttendanceStatsQuery = z.infer<typeof attendanceStatsQuerySchema>;
