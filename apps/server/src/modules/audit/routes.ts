import { auditQuerySchema } from "@rsc/shared";
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { requirePermission } from "../access/middleware.js";
import { listAudit } from "./service.js";

/**
 * GET /api/audit-log (audit.read): newest first, filter by subject person or action, page
 * with `before`. Entries carry the actor's and subject's names for the viewer (general tier).
 */
export const auditRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>().get(
    "/",
    requirePermission("audit.read"),
    validate("query", auditQuerySchema),
    async (c) => {
      const { personId, action, before, limit } = c.req.valid("query");
      const entries = await listAudit(db, {
        subjectPersonId: personId,
        action,
        before: before ? new Date(before) : undefined,
        limit,
      });
      return c.json({ entries });
    },
  );
