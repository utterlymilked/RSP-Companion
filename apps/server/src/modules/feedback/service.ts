import type { FeedbackEntry, FeedbackStatus, SubmitFeedbackInput } from "@rsc/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { users } from "../auth/schema.js";
import { feedback } from "./schema.js";

export async function createFeedback(db: Db, authorUserId: string, input: SubmitFeedbackInput) {
  const [row] = await db
    .insert(feedback)
    .values({
      authorUserId,
      kind: input.kind,
      message: input.message,
      route: input.route,
      screenTitle: input.screenTitle,
      platform: input.platform,
      appVersion: input.appVersion,
      viewportWidth: input.viewport.width,
      viewportHeight: input.viewport.height,
      position: input.position,
    })
    .returning({ id: feedback.id });
  return row?.id ?? "";
}

/** Newest first; `open` means `new` and `seen`. */
export async function listFeedback(
  db: Db,
  options: { status: FeedbackStatus | "open"; limit: number },
): Promise<FeedbackEntry[]> {
  const statuses: FeedbackStatus[] = options.status === "open" ? ["new", "seen"] : [options.status];
  const rows = await db
    .select({ f: feedback, authorName: users.name })
    .from(feedback)
    .leftJoin(users, eq(users.id, feedback.authorUserId))
    .where(inArray(feedback.status, statuses))
    .orderBy(desc(feedback.createdAt))
    .limit(options.limit);
  return rows.map(({ f, authorName }) => ({
    id: f.id,
    createdAt: f.createdAt.toISOString(),
    kind: f.kind,
    status: f.status,
    message: f.message,
    route: f.route,
    screenTitle: f.screenTitle,
    platform: f.platform,
    appVersion: f.appVersion,
    viewport: { width: f.viewportWidth, height: f.viewportHeight },
    position: f.position,
    authorName,
  }));
}

export async function setFeedbackStatus(db: Db, feedbackId: string, status: FeedbackStatus) {
  const [row] = await db
    .update(feedback)
    .set({ status })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
  return row !== undefined;
}
