import {
  APPROVAL_OPEN,
  type ApprovalDecisionInput,
  type ApprovalEntry,
  type ApprovalStatus,
  type ApprovalType,
  permissionsOf,
} from "@rsc/shared";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import type { Mailer } from "../../mail/mailer.js";
import { approvalDecidedMail, approvalsWaitingMail } from "../../mail/templates.js";
import { audit } from "../audit/service.js";
import { roleAssignments, users } from "../auth/schema.js";
import { approvalRequests } from "./schema.js";

const subjects = alias(users, "approval_subjects");
const reviewers = alias(users, "approval_reviewers");

/**
 * What a request type does when it is decided. Types register here as they land (R5 adds the
 * identity claim); `test` only proves the queue.
 */
const HANDLERS: Record<
  ApprovalType,
  (
    db: Db,
    request: { id: string; subjectUserId: string | null },
    outcome: ApprovalStatus,
  ) => Promise<void>
> = {
  test: async () => {},
};

export async function createApproval(
  db: Db,
  input: { type: ApprovalType; subjectUserId: string | null; payload?: Record<string, string> },
) {
  const [row] = await db
    .insert(approvalRequests)
    .values({ type: input.type, subjectUserId: input.subjectUserId, payload: input.payload ?? {} })
    .returning();
  if (!row) throw new Error("approval not created");
  return row;
}

const entrySelect = {
  r: approvalRequests,
  subjectName: subjects.name,
  reviewerName: reviewers.name,
};

const toEntry = (row: {
  r: typeof approvalRequests.$inferSelect;
  subjectName: string | null;
  reviewerName: string | null;
}): ApprovalEntry => ({
  id: row.r.id,
  type: row.r.type,
  status: row.r.status,
  createdAt: row.r.createdAt.toISOString(),
  decidedAt: row.r.decidedAt?.toISOString() ?? null,
  subjectName: row.subjectName,
  reviewerName: row.reviewerName,
  reason: row.r.reason,
});

/** Oldest first for the open queue, newest first for closed ones. */
export async function listApprovals(
  db: Db,
  options: { status: ApprovalStatus | "open"; limit: number },
): Promise<ApprovalEntry[]> {
  const open = options.status === "open";
  const rows = await db
    .select(entrySelect)
    .from(approvalRequests)
    .leftJoin(subjects, eq(subjects.id, approvalRequests.subjectUserId))
    .leftJoin(reviewers, eq(reviewers.id, approvalRequests.reviewerUserId))
    .where(
      open
        ? inArray(approvalRequests.status, [...APPROVAL_OPEN])
        : eq(approvalRequests.status, options.status as ApprovalStatus),
    )
    .orderBy(open ? asc(approvalRequests.createdAt) : desc(approvalRequests.createdAt))
    .limit(options.limit);
  return rows.map(toEntry);
}

export async function listOwnApprovals(db: Db, userId: string): Promise<ApprovalEntry[]> {
  const rows = await db
    .select(entrySelect)
    .from(approvalRequests)
    .leftJoin(subjects, eq(subjects.id, approvalRequests.subjectUserId))
    .leftJoin(reviewers, eq(reviewers.id, approvalRequests.reviewerUserId))
    .where(eq(approvalRequests.subjectUserId, userId))
    .orderBy(desc(approvalRequests.createdAt));
  return rows.map(toEntry);
}

const OUTCOME = { approve: "approved", reject: "rejected", needs_info: "needs_info" } as const;

/**
 * Records a reviewer's decision on an open request, runs the type's handler, audits it and
 * emails the requester. A reviewer never decides their own request.
 */
export async function decideApproval(
  db: Db,
  mailer: Mailer,
  input: { approvalId: string; reviewerUserId: string } & ApprovalDecisionInput,
) {
  const outcome = OUTCOME[input.decision];
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, input.approvalId))
      .for("update");
    if (!current) throw new ApiError(404, "not_found");
    if (current.subjectUserId === input.reviewerUserId) throw new ApiError(403, "forbidden");
    if (!APPROVAL_OPEN.includes(current.status)) throw new ApiError(409, "conflict");
    const [row] = await tx
      .update(approvalRequests)
      .set({
        status: outcome,
        reviewerUserId: input.reviewerUserId,
        reason: input.reason ?? null,
        decidedAt: new Date(),
      })
      .where(eq(approvalRequests.id, input.approvalId))
      .returning();
    if (!row) throw new ApiError(404, "not_found");
    await HANDLERS[row.type](tx, row, outcome);
    await audit(tx, {
      actorUserId: input.reviewerUserId,
      subjectUserId: row.subjectUserId,
      action: "approval.decided",
      details: { type: row.type, outcome },
    });
    return row;
  });
  if (updated.subjectUserId) {
    const [subject] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, updated.subjectUserId));
    if (subject) {
      await mailer.send(approvalDecidedMail(subject.email, outcome, updated.reason ?? undefined));
    }
  }
  return updated;
}

/** The requester takes their own open request back. */
export async function withdrawApproval(db: Db, input: { approvalId: string; userId: string }) {
  const [row] = await db
    .update(approvalRequests)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(
      and(
        eq(approvalRequests.id, input.approvalId),
        eq(approvalRequests.subjectUserId, input.userId),
        inArray(approvalRequests.status, [...APPROVAL_OPEN]),
      ),
    )
    .returning({ id: approvalRequests.id });
  if (!row) throw new ApiError(404, "not_found");
}

const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Emails the reviewers once a day while requests sit `pending` for more than a day. Returns
 * how many requests were reminded about.
 */
export async function remindReviewers(db: Db, mailer: Mailer, appUrl: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - REMINDER_AFTER_MS);
  const due = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.status, "pending"),
        lt(approvalRequests.createdAt, cutoff),
        or(isNull(approvalRequests.remindedAt), lt(approvalRequests.remindedAt, cutoff)),
      ),
    );
  if (due.length === 0) return 0;
  const holders = await db
    .select({ email: users.email, role: roleAssignments.role })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(inArray(roleAssignments.role, ["admin", "hr"]));
  const emails = [
    ...new Set(
      holders
        .filter((h) =>
          permissionsOf([{ role: h.role, teamId: null, classId: null }]).includes(
            "identity.review",
          ),
        )
        .map((h) => h.email),
    ),
  ];
  for (const to of emails) await mailer.send(approvalsWaitingMail(to, due.length, appUrl));
  await db
    .update(approvalRequests)
    .set({ remindedAt: now })
    .where(
      inArray(
        approvalRequests.id,
        due.map((d) => d.id),
      ),
    );
  return due.length;
}
