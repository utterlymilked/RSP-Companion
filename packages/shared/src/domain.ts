/**
 * Fixed value sets of the core data model (M1). The server builds its Postgres enums from
 * these arrays, so client and server always agree. Adding a value needs a migration;
 * removing one needs a data migration first (see .claude/skills/db-migration).
 */

/** Legal or organisational entities that share people and spaces with the club. */
export const ORGANISATION_KINDS = [
  "club", // Real Sport Clube Massamá itself
  "sad", // Real SC SAD (professional senior side)
  "football_school", // Escola de Futebol
  "partner", // e.g. GP Sport Academy
  "external", // renters and other outside parties
] as const;
export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];

/** Sex as used by federation competitions (feminino / masculino). */
export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

/** Competition category of an age group or team: feminino, masculino or misto. */
export const CATEGORIES = ["female", "male", "mixed"] as const;
export type Category = (typeof CATEGORIES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  "mother",
  "father",
  "legal_guardian",
  "grandparent",
  "sibling",
  "other",
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** Club membership (sócio) status. */
export const MEMBERSHIP_STATUSES = ["active", "suspended", "ended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * What a person does for the club in a season. Descriptive (who coaches which team, who
 * works in which gabinete); access rights come from roles, added in M2.
 */
export const STAFF_FUNCTIONS = [
  "director",
  "coordinator",
  "head_coach",
  "assistant_coach",
  "goalkeeper_coach",
  "fitness_coach",
  "team_manager",
  "analyst",
  "scout",
  "recruiter",
  "doctor",
  "nurse",
  "physio",
  "nutritionist",
  "psychologist",
  "sociologist",
  "stores",
  "administrative",
  "other",
] as const;
export type StaffFunction = (typeof STAFF_FUNCTIONS)[number];

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];
