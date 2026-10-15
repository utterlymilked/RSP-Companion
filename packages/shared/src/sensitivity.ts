/**
 * Data sensitivity tiers (see docs/adr/0002-core-data-model.md and 0003). Roles map to tiers
 * through permissions.ts; services project columns with personColumns(tier).
 *
 * - general: names, teams, schedules. Anyone with access to the team may see it.
 * - personal: contacts, birth dates, identifiers. Staff with a need, the person, guardians.
 * - health: clinical data (GDPR art. 9). Lives only in M13's own tables, never here.
 */
export const SENSITIVITY_TIERS = ["general", "personal", "health"] as const;
export type SensitivityTier = (typeof SENSITIVITY_TIERS)[number];

/** Tier of every column of `persons`. A new column must be added here (a test enforces it). */
export const PERSON_FIELD_TIERS = {
  id: "general",
  fullName: "general",
  displayName: "general",
  sex: "general",
  birthDate: "personal",
  email: "personal",
  phone: "personal",
  federationId: "personal",
  createdAt: "general",
  updatedAt: "general",
} as const satisfies Record<string, SensitivityTier>;
export type PersonField = keyof typeof PERSON_FIELD_TIERS;

/** Columns of `persons` at or below a tier, e.g. for a projection that a role may read. */
export function personFieldsUpTo(tier: Exclude<SensitivityTier, "health">): PersonField[] {
  const allowed: SensitivityTier[] = tier === "general" ? ["general"] : ["general", "personal"];
  return (Object.keys(PERSON_FIELD_TIERS) as PersonField[]).filter((field) =>
    allowed.includes(PERSON_FIELD_TIERS[field]),
  );
}
