import { z } from "zod";

/**
 * Approvals: a generic queue of requests that a human reviewer (admin or HR) decides
 * (ADR 0026 section 6). Request types register themselves here; the queue knows nothing about
 * what a type means. `test` only proves the queue; `identity_claim` arrives with R5.
 */
export const APPROVAL_TYPES = ["test"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "needs_info",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Statuses a reviewer can still act on. */
export const APPROVAL_OPEN: readonly ApprovalStatus[] = ["pending", "needs_info"];

export const approvalDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "needs_info"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.decision === "approve" || !!d.reason, {
    message: "a reason is required to reject or ask for more information",
    path: ["reason"],
  });
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const approvalQuerySchema = z.object({
  status: z.enum([...APPROVAL_STATUSES, "open"]).default("open"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** A request as the queue shows it: ids and a short label, never the evidence itself. */
export interface ApprovalEntry {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  subjectName: string | null;
  reviewerName: string | null;
  reason: string | null;
}
