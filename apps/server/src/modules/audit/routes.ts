import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { requirePermission } from "../access/middleware.js";
import { listAudit } from "./service.js";

const auditQuery = z.object({
  personId: z.uuid().optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/audit-log (audit.read): newest first, filter by subject person, page with `before`. */
export const auditRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>().get(
    "/",
    requirePermission("audit.read"),
    validate("query", auditQuery),
    async (c) => {
      const { personId, before, limit } = c.req.valid("query");
      const entries = await listAudit(db, {
        subjectPersonId: personId,
        before: before ? new Date(before) : undefined,
        limit,
      });
      return c.json({ entries });
    },
  );
