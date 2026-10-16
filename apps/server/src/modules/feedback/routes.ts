import {
  feedbackQuerySchema,
  feedbackToMarkdown,
  submitFeedbackSchema,
  updateFeedbackSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { createFeedback, listFeedback, setFeedbackStatus } from "./service.js";

const param = z.object({ feedbackId: z.uuid() });

/**
 * /api/feedback: testers (`feedback.submit`) post notes from the floating widget; admins
 * (`feedback.read`) list, triage and export them. The export is Markdown for docs/feedback/.
 */
export const feedbackRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .post(
      "/",
      requirePermission("feedback.submit"),
      validate("json", submitFeedbackSchema),
      async (c) => {
        const id = await createFeedback(db, principalOf(c).userId, c.req.valid("json"));
        return c.json({ id }, 201);
      },
    )
    .get(
      "/",
      requirePermission("feedback.read"),
      validate("query", feedbackQuerySchema),
      async (c) => c.json({ entries: await listFeedback(db, c.req.valid("query")) }),
    )
    .get(
      "/export",
      requirePermission("feedback.read"),
      validate("query", feedbackQuerySchema),
      async (c) => {
        const entries = await listFeedback(db, c.req.valid("query"));
        return c.text(feedbackToMarkdown(entries, new Date()), 200, {
          "Content-Type": "text/markdown; charset=utf-8",
        });
      },
    )
    .patch(
      "/:feedbackId",
      requirePermission("feedback.read"),
      validate("param", param),
      validate("json", updateFeedbackSchema),
      async (c) => {
        const ok = await setFeedbackStatus(
          db,
          c.req.valid("param").feedbackId,
          c.req.valid("json").status,
        );
        if (!ok) throw notFound();
        return c.json({ ok: true });
      },
    );
