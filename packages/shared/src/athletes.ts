import { z } from "zod";

/**
 * Catalogue of athlete attribute types (ADR 0024). Values live in `athlete_attributes` as
 * append-only rows; this file says what each type means, so queries and the sensitivity
 * tiers do not depend on free text. Add types, never rename keys.
 */
export const ATHLETE_ATTRIBUTES = {
  name: { kind: "text", tier: "general", multiple: false, scope: "identity" },
  nickname: { kind: "text", tier: "general", multiple: false, scope: "sporting" },
  date_of_birth: { kind: "date", tier: "personal", multiple: false, scope: "identity" },
  height_cm: { kind: "num", tier: "personal", multiple: false, scope: "sporting" },
  weight_kg: { kind: "num", tier: "personal", multiple: false, scope: "sporting" },
  position: { kind: "text", tier: "general", multiple: true, scope: "sporting" },
  dominant_foot: { kind: "text", tier: "general", multiple: false, scope: "sporting" },
  nationality: { kind: "text", tier: "personal", multiple: false, scope: "identity" },
  birthplace: { kind: "text", tier: "personal", multiple: false, scope: "identity" },
  social_url: { kind: "text", tier: "personal", multiple: false, scope: "sporting" },
  media_url: { kind: "text", tier: "personal", multiple: false, scope: "sporting" },
  federation_number: { kind: "text", tier: "personal", multiple: false, scope: "identity" },
} as const;
export type AthleteAttributeType = keyof typeof ATHLETE_ATTRIBUTES;
export const ATHLETE_ATTRIBUTE_TYPES = Object.keys(ATHLETE_ATTRIBUTES) as AthleteAttributeType[];

/** How reliable an attribute value is: seen by a scout, said by the athlete or family, or from a document. */
export const ATTRIBUTE_SOURCES = ["observed", "declared", "document", "legacy_sync"] as const;
export type AttributeSource = (typeof ATTRIBUTE_SOURCES)[number];

/** Date precision: scouts often only know the birth year. */
export const DATE_PRECISIONS = ["year", "day"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/**
 * An athlete's name or nickname: 2 to 80 characters, letters and digits (any script) plus
 * space, hyphen, apostrophe and full stop, with at least one letter or digit. Plain
 * alphanumerics would reject "D'Ávila" and "João-Pedro".
 */
export const athleteNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .'’-]*$/u, "invalid_athlete_name");
