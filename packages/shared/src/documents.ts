import { z } from "zod";
import { DOCUMENT_KINDS } from "./domain.ts";

/** Largest file accepted, in bytes. A phone photo of a page or a scanned PDF fits easily. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** File types accepted: PDF and the two photo formats phones produce when sent as JPEG/PNG. */
export const DOCUMENT_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

/** Days before expiry from which a document counts as "expiring soon" by default. */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalDay = z.iso
  .date()
  .nullish()
  .transform((v) => v ?? null);

/**
 * Query of POST /api/documents/people/:personId. The body is the raw file (its Content-Type
 * must be one of DOCUMENT_CONTENT_TYPES), so the metadata travels in the query string.
 */
export const uploadDocumentQuerySchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    fileName: z.string().trim().min(1).max(200),
    title: optionalText(200),
    issuedOn: optionalDay,
    expiresOn: optionalDay,
  })
  .refine((v) => !v.issuedOn || !v.expiresOn || v.expiresOn >= v.issuedOn, {
    path: ["expiresOn"],
    message: "expiresOn must not be before issuedOn",
  });
export type UploadDocumentQuery = z.infer<typeof uploadDocumentQuerySchema>;

/** Query of GET /api/documents/expiring. */
export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(365).default(DEFAULT_EXPIRY_WARNING_DAYS),
  teamId: z.uuid().optional(),
});
export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;

/** Where a document stands on `today` (`YYYY-MM-DD`): no expiry, valid, expiring soon or expired. */
export function expiryStatus(
  expiresOn: string | null,
  today: string,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
): "none" | "valid" | "expiring" | "expired" {
  if (!expiresOn) return "none";
  if (expiresOn < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + warningDays);
  return expiresOn <= limit.toISOString().slice(0, 10) ? "expiring" : "valid";
}
