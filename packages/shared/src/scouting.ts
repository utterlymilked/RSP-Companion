import { z } from "zod";
import { DOMINANT_FEET, PROSPECT_STATUSES } from "./domain.ts";
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
export const GUARDIAN_RELATIONS = [
  "parent",
  "father",
  "mother",
  "step_parent",
  "family",
  "tutor",
  "agent",
] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export const PROSPECT_ID_TYPES = ["cc", "passport", "residence_permit", "other"] as const;
export type ProspectIdType = (typeof PROSPECT_ID_TYPES)[number];

/** Playing positions offered on the request form. */
export const PROSPECT_POSITIONS = [
  "gr",
  "dd",
  "dc",
  "dce",
  "dcd",
  "de",
  "tr",
  "mdc",
  "mt",
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

/** The form's context of the observed player's team: registered with a federation, or not. */
export const FRAMINGS = ["official", "unofficial", "other"] as const;
export const ORG_TYPES = ["club", "football_school", "selection", "school", "other"] as const;
/** First-hand (watched on the spot) or second-hand (heard from others). */
export const OBSERVATION_SOURCES = ["direct", "indirect"] as const;
export const OBSERVATION_SETTINGS = [
  "league",
  "training",
  "tournament",
  "district_match",
  "national_match",
  "recruitment_day",
  "meeting",
  "friendly",
  "school",
  "other",
] as const;
/** Who is filing the report, as the club's scouting form asks. */
export const SUBMITTER_ROLES = [
  "scouting",
  "club_coach",
  "official",
  "agent",
  "parent",
  "supporter",
  "member",
  "friend",
  "other",
] as const;
export const CONTACT_WITH = [
  "athlete",
  "guardian",
  "friend",
  "coach",
  "representative",
  "family",
  "prospector",
  "other",
] as const;
export const CONTACT_VIA = ["direct", "phone", "email", "digital", "indirect", "other"] as const;
export const AGREEMENTS = ["train", "sign", "meet", "none", "other"] as const;

/** What a report is about: a match watched, or the observation training the club invited the player to. */
export const REPORT_KINDS = ["match", "observation_training"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Recruitment opinion: sign now (para vincular), try out in a training (para treinar), keep
 * following (para acompanhar), or drop.
 */
export const REPORT_RECOMMENDATIONS = ["sign", "train", "follow", "discard"] as const;
export type ReportRecommendation = (typeof REPORT_RECOMMENDATIONS)[number];

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
  /** Nickname ("nome por que é conhecido"), when it differs from the name. */
  nickname: optionalText(80),
  dominantFoot: optionalEnum(DOMINANT_FEET),
  /** The player's own phone and email (adults, or minors with the guardian's knowledge). */
  ownPhone: optionalText(40),
  ownEmail: z
    .union([z.literal(""), z.email().max(200)])
    .nullish()
    .transform((v) => v || null),
  /** Link to a photo or video of the player (public sources only). */
  mediaUrl: optionalText(300),
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

const grade = (min: number, max: number) => z.number().int().min(min).max(max).nullish();

/**
 * Form fields of a report that are context or club-specific grades, kept together in one
 * JSON column (docs/SCOUTING_MODEL.md, "The club's scouting form"). All optional.
 */
export const reportDetailsSchema = z.object({
  observedTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
  framing: z.enum(FRAMINGS).nullish(),
  orgType: z.enum(ORG_TYPES).nullish(),
  /** Club or institution the player was playing for that day ("NÃO IDENTIFICADO" if unknown). */
  orgName: z.string().trim().max(160).nullish(),
  escalao: z.enum(PROSPECT_ESCALOES).nullish(),
  source: z.enum(OBSERVATION_SOURCES).nullish(),
  setting: z.enum(OBSERVATION_SETTINGS).nullish(),
  submitterRole: z.enum(SUBMITTER_ROLES).nullish(),
  /** Height for the age group, 1 (low) to 5 (high); 3 is the norm. */
  relativeHeight: grade(1, 5),
  /** Goals scored or scoring index, 0 to 5. */
  goalIndex: grade(0, 5),
  /** Potential to stand out, 1 (above the age group) to 5 (far above). */
  differentiation: grade(1, 5),
  contactMade: z.boolean().nullish(),
  contactWith: z.array(z.enum(CONTACT_WITH)).max(CONTACT_WITH.length).nullish(),
  contactVia: z.array(z.enum(CONTACT_VIA)).max(CONTACT_VIA.length).nullish(),
  /** Interest shown by the player or guardian, or by others, 1 (none) to 5 (a lot). */
  reactionLevel: grade(1, 5),
  agreement: z.enum(AGREEMENTS).nullish(),
});
export type ReportDetails = z.infer<typeof reportDetailsSchema>;

/** Body of POST /api/scouting/prospects/:id/reports: one observation of the prospect. */
export const createProspectReportSchema = z.object({
  kind: z.enum(REPORT_KINDS).default("match"),
  recommendation: z.enum(REPORT_RECOMMENDATIONS).nullish(),
  /** The rest of the club's scouting form: observation context, extra grades, contact made. */
  details: reportDetailsSchema.optional(),
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

/** Identity fields a prospect and a person both hold; merged when the two are linked (ADR 0022). */
export const MERGE_FIELDS = ["fullName", "birthDate", "nif", "email", "phone"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const mergePreviewQuerySchema = z.object({ personId: z.uuid() });

/** One field in the merge: both values, so the user picks which one the person keeps. */
export interface MergeRow {
  field: MergeField;
  prospect: string | null;
  person: string | null;
}

/** Body of POST /scouting/prospects/:id/link: link to a person, applying the chosen values. */
export const linkProspectSchema = z.object({
  personId: z.uuid(),
  confirmLink: z.boolean().optional(),
  /** Per field, whose value both records end up with; fields left out stay as they are. */
  choices: z.partialRecord(z.enum(MERGE_FIELDS), z.enum(["prospect", "person"])).default({}),
});
export type LinkProspectInput = z.infer<typeof linkProspectSchema>;

export const clubsQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export const createClubSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => v || null),
});

/** A club offered when picking where a player plays (public list plus clubs added by hand). */
export interface ClubOption {
  id: string;
  name: string;
  city: string | null;
}
