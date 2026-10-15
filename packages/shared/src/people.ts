import { z } from "zod";
import {
  CATEGORIES,
  GUARDIAN_RELATIONSHIPS,
  MEMBERSHIP_STATUSES,
  SEXES,
  STAFF_FUNCTIONS,
} from "./domain.ts";

/** Optional text from a form: trimmed, and empty means "none". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
/** Forms send "" for an empty field: treat it as absent. */
const blankToNull = (v: unknown) => (v === "" ? null : v);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Body of POST /api/people. Personal-tier fields are optional; minors keep contacts empty. */
export const createPersonSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  displayName: optionalText(100),
  sex: z.preprocess(
    blankToNull,
    z
      .enum(SEXES)
      .nullish()
      .transform((v) => v ?? null),
  ),
  birthDate: z.preprocess(
    blankToNull,
    dateString.nullish().transform((v) => v ?? null),
  ),
  email: z.preprocess(
    blankToNull,
    z
      .email()
      .transform((e) => e.toLowerCase())
      .nullish()
      .transform((v) => v ?? null),
  ),
  phone: optionalText(40),
  federationId: optionalText(40),
});
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

/** Body of PATCH /api/people/:id: only the fields sent change. */
export const updatePersonSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    displayName: optionalText(100),
    sex: z.preprocess(blankToNull, z.enum(SEXES).nullable()),
    birthDate: z.preprocess(blankToNull, dateString.nullable()),
    email: z.preprocess(
      blankToNull,
      z
        .email()
        .transform((e) => e.toLowerCase())
        .nullable(),
    ),
    phone: optionalText(40),
    federationId: optionalText(40),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

/** Query of GET /api/people: name search plus team / class filters, paged. */
export const listPeopleQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  teamId: z.uuid().optional(),
  classId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;

export const addGuardianSchema = z.object({
  guardianId: z.uuid(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS),
  isPrimary: z.boolean().default(false),
});
export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export const createMembershipSchema = z.object({
  organisationId: z.uuid(),
  memberNumber: z.string().trim().min(1).max(40),
  startedOn: dateString,
});
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export const updateMembershipSchema = z
  .object({ status: z.enum(MEMBERSHIP_STATUSES), endedOn: dateString.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const createTeamSchema = z.object({
  seasonId: z.uuid(),
  organisationId: z.uuid(),
  ageGroupId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  name: z.string().trim().min(1).max(100),
  category: z.enum(CATEGORIES),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema
  .omit({ seasonId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const listTeamsQuerySchema = z.object({ seasonId: z.uuid().optional() });

export const addTeamMemberSchema = z.object({
  personId: z.uuid(),
  joinedOn: dateString,
  shirtNumber: z
    .number()
    .int()
    .min(1)
    .max(99)
    .nullish()
    .transform((v) => v ?? null),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const leaveSchema = z.object({ leftOn: dateString });

export const addStaffAssignmentSchema = z
  .object({
    personId: z.uuid(),
    seasonId: z.uuid(),
    function: z.enum(STAFF_FUNCTIONS),
    organisationId: z.uuid(),
    departmentId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    teamId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    classId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    startsOn: dateString.nullish().transform((v) => v ?? null),
    endsOn: dateString.nullish().transform((v) => v ?? null),
  })
  .refine((v) => !(v.teamId && v.classId), { message: "a team or a class, not both" });
export type AddStaffAssignmentInput = z.infer<typeof addStaffAssignmentSchema>;
