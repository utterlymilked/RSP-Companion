import { z } from "zod";
import { PROSPECT_STATUSES } from "./domain.ts";

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
  retainUntil: z.iso
    .date()
    .nullish()
    .transform((v) => v ?? null),
});
export type CreateProspectInput = z.infer<typeof createProspectSchema>;

export const updateProspectSchema = createProspectSchema
  .partial()
  .extend({ status: z.enum(PROSPECT_STATUSES).optional() });
export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;

export const listProspectsQuerySchema = z.object({
  status: z.enum(PROSPECT_STATUSES).optional(),
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
  /** Overall rating, 1 (weak) to 5 (excellent). */
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1).max(4000),
});
export type CreateProspectReportInput = z.infer<typeof createProspectReportSchema>;
