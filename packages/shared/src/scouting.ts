import { z } from "zod";
import { PROSPECT_STATUSES } from "./domain.ts";
import {
  ARCHETYPE_KEYS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  HEAT_MAX,
  HEAT_ZONES,
  isValidNif,
  POSITION_GROUPS,
} from "./scouting-model.ts";

/** Target age groups of an observation request (sub-7 to sub-19), as on the club's form. */
export const PROSPECT_ESCALOES = [
  "sub7",
  "sub9",
  "sub11",
  "sub13",
  "sub15",
  "sub17",
  "sub19",
] as const;
export type ProspectEscalao = (typeof PROSPECT_ESCALOES)[number];

/** Where the player plays now: a federated club or a school team. */
export const PROSPECT_CONTEXTS = ["federated_club", "school"] as const;
export type ProspectContext = (typeof PROSPECT_CONTEXTS)[number];

/** Who the guardian is to the player. */
export const GUARDIAN_RELATIONS = ["parent", "step_parent", "family", "tutor", "agent"] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export const PROSPECT_ID_TYPES = ["cc", "passport", "residence_permit", "other"] as const;
export type ProspectIdType = (typeof PROSPECT_ID_TYPES)[number];

/** Playing positions offered on the request form. */
export const PROSPECT_POSITIONS = [
  "gr",
  "dd",
  "dc",
  "de",
  "mdc",
  "mc",
  "mo",
  "md",
  "me",
  "ed",
  "ee",
  "sa",
  "pl",
] as const;
export type ProspectPosition = (typeof PROSPECT_POSITIONS)[number];

const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .nullish()
    .transform((v) => v ?? null);

const optionalDate = z.iso
  .date()
  .nullish()
  .transform((v) => v ?? null);

const optionalInt = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Months a prospect's data is kept after its last update unless a longer date is set. */
export const PROSPECT_RETENTION_MONTHS = 12;

/**
 * Body of POST /api/scouting/prospects. Prospects are external, often minors, and not yet
 * club members: keep to what scouting needs (no contacts, no identifiers) and let
 * `retainUntil` run out (default: PROSPECT_RETENTION_MONTHS after creation).
 */
export const createProspectSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  birthYear: z
    .number()
    .int()
    .min(1980)
    .max(2100)
    .nullish()
    .transform((v) => v ?? null),
  currentClub: optionalText(160),
  position: optionalText(60),
  notes: optionalText(2000),
  /** Full birth date; when set, `birthYear` follows it. */
  birthDate: optionalDate,
  /** Contacts are kept because the club's observation request asks for them (ADR 0007). */
  guardianName: optionalText(160),
  guardianPhone: optionalText(40),
  guardianEmail: z
    .union([z.literal(""), z.email().max(200)])
    .nullish()
    .transform((v) => v || null),
  guardianRelation: optionalEnum(GUARDIAN_RELATIONS),
  /** The player's own phone or email, for adults. */
  ownContact: optionalText(200),
  socialUrl: optionalText(300),
  targetEscalao: optionalEnum(PROSPECT_ESCALOES),
  context: optionalEnum(PROSPECT_CONTEXTS),
  positions: z.array(z.enum(PROSPECT_POSITIONS)).max(PROSPECT_POSITIONS.length).optional(),
  heightCm: optionalInt(80, 230),
  seasonsPlayed: optionalInt(0, 30),
  motive: optionalText(1000),
  goal: optionalText(1000),
  idType: optionalEnum(PROSPECT_ID_TYPES),
  nationality: optionalText(80),
  birthplace: optionalText(120),
  postalCode: optionalText(20),
  area: optionalText(120),
  preferredDate: optionalDate,
  alternativeDate: optionalDate,
  trialDate: optionalDate,
  trialVenue: optionalText(160),
  /** The current club must authorise the trial (federated players). */
  clubAuthorisationNeeded: z.boolean().optional(),
  clubAuthorised: z.boolean().optional(),
  retainUntil: z.iso
    .date()
    .nullish()
    .transform((v) => v ?? null),
  /** NIF (Portuguese tax number), checked for format. When it matches a person, they are linked. */
  nif: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.replace(/\s/g, "") : null))
    .refine((v) => v === null || isValidNif(v), "invalid_nif"),
  /** Person (club member) this prospect is; null clears the link. */
  personId: z.uuid().nullish(),
  /** Set once the user has seen the warning that the prospect will be linked to a person. */
  confirmLink: z.boolean().optional(),
  /** Manually chosen archetype; null (or absent) means the computed one. */
  archetype: optionalEnum(ARCHETYPE_KEYS),
});
export type CreateProspectInput = z.infer<typeof createProspectSchema>;

export const updateProspectSchema = createProspectSchema
  .partial()
  .extend({ status: z.enum(PROSPECT_STATUSES).optional() });
export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;

export const listProspectsQuerySchema = z.object({
  status: z.enum(PROSPECT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  group: z.enum(POSITION_GROUPS).optional(),
  escalao: z.enum(PROSPECT_ESCALOES).optional(),
  archetype: z.enum(ARCHETYPE_KEYS).optional(),
  /** `linked` only prospects tied to a person, `unlinked` only those that are not. */
  link: z.enum(["linked", "unlinked"]).optional(),
  /** `true` lists only prospects past their retention date. */
  expired: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type ListProspectsQuery = z.infer<typeof listProspectsQuerySchema>;

/** Body of POST /api/scouting/prospects/:id/reports: one observation of the prospect. */
export const createProspectReportSchema = z.object({
  observedOn: z.iso.date(),
  /** Overall rating, 1 (weak) to 5 (excellent); derived from `scores` when absent. */
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().trim().min(1).max(4000),
  /** Attribute ratings, 1 to 10 (see ATTRIBUTES). */
  scores: z
    .partialRecord(
      z.enum(ATTRIBUTE_KEYS as [string, ...string[]]),
      z.number().int().min(ATTRIBUTE_MIN).max(ATTRIBUTE_MAX),
    )
    .optional(),
  /** Position actually played in the match observed (a form position code). */
  positionPlayed: z.enum(PROSPECT_POSITIONS).nullish(),
  /** Where the player was active: `HEAT_ZONES` values 0-`HEAT_MAX`, row-major (6x3). */
  heat: z.array(z.number().int().min(0).max(HEAT_MAX)).length(HEAT_ZONES).nullish(),
});
export type CreateProspectReportInput = z.infer<typeof createProspectReportSchema>;

export const linkSuggestionsQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

/** A person the prospect may be, offered by name and birth year (general-tier fields only). */
export interface LinkSuggestion {
  personId: string;
  identityCode: string;
  fullName: string;
  /** The person's birth year equals the prospect's (the year itself is not disclosed). */
  birthYearMatch: boolean;
  /** 0-1; 1 when the NIF matches. */
  score: number;
  reason: "nif" | "name";
}
