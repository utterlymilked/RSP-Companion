import { approvalDecisionSchema, approvalQuerySchema } from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requireAuth, requirePermission } from "../access/middleware.js";
import { decideApproval, listApprovals, listOwnApprovals, withdrawApproval } from "./service.js";

const param = z.object({ approvalId: z.uuid() });

/**
 * /api/approvals: the review queue (`identity.review`: admin and HR) and the requester's own
 * requests. Creating requests is the job of the request types, not of a public route.
 */
export const approvalsRoutes = ({ db, mailer }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/mine", requireAuth, async (c) =>
      c.json({ entries: await listOwnApprovals(db, principalOf(c).userId) }),
    )
    .get(
      "/",
      requirePermission("identity.review"),
      validate("query", approvalQuerySchema),
      async (c) => c.json({ entries: await listApprovals(db, c.req.valid("query")) }),
    )
    .post(
      "/:approvalId/decision",
      requirePermission("identity.review"),
      validate("param", param),
      validate("json", approvalDecisionSchema),
      async (c) => {
        await decideApproval(db, mailer, {
          approvalId: c.req.valid("param").approvalId,
          reviewerUserId: principalOf(c).userId,
          ...c.req.valid("json"),
        });
        return c.body(null, 204);
      },
    )
    .post("/:approvalId/withdraw", requireAuth, validate("param", param), async (c) => {
      await withdrawApproval(db, {
        approvalId: c.req.valid("param").approvalId,
        userId: principalOf(c).userId,
      });
      return c.body(null, 204);
    });
