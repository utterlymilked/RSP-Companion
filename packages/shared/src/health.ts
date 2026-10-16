import { z } from "zod";
import { INJURY_AVAILABILITIES, INJURY_STATUSES } from "./domain.ts";
import { HEALTH_DISCIPLINES } from "./roles.ts";

const day = z.iso.date();
const optionalDay = day.nullish().transform((v) => v ?? null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Body of POST /api/health/people/:personId/notes: a clinical note in one discipline. */
export const createHealthNoteSchema = z.object({
  discipline: z.enum(HEALTH_DISCIPLINES),
  recordedOn: day,
  summary: z.string().trim().min(1).max(8000),
});
export type CreateHealthNoteInput = z.infer<typeof createHealthNoteSchema>;

/** Body of POST /api/health/people/:personId/injuries. */
export const createInjurySchema = z.object({
  discipline: z.enum(HEALTH_DISCIPLINES),
  bodyPart: z.string().trim().min(1).max(200),
  description: optionalText(4000),
  startedOn: day,
  availability: z.enum(INJURY_AVAILABILITIES).default("unavailable"),
  expectedReturnOn: optionalDay,
});
export type CreateInjuryInput = z.infer<typeof createInjurySchema>;

/**
 * Body of PATCH /api/health/injuries/:injuryId. Moving to `return_to_play` makes the athlete
 * "limited"; `cleared` ends the injury and makes them available again.
 */
export const updateInjurySchema = z
  .object({
    status: z.enum(INJURY_STATUSES),
    availability: z.enum(INJURY_AVAILABILITIES),
    description: optionalText(4000),
    expectedReturnOn: optionalDay,
  })
  .partial();
export type UpdateInjuryInput = z.infer<typeof updateInjurySchema>;

/** Body of POST /api/health/people/:personId/consent: a guardian agrees to health records. */
export const grantHealthConsentSchema = z.object({
  grantedByPersonId: z.uuid(),
  grantedOn: day,
});
export type GrantHealthConsentInput = z.infer<typeof grantHealthConsentSchema>;

export const availabilityQuerySchema = z.object({ teamId: z.uuid().optional() });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** Under this age (the age of majority) the club keeps health records only with guardian consent. */
export const HEALTH_CONSENT_AGE = 18;
