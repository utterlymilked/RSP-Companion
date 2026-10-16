import {
  createEvaluationSchema,
  createEvaluationTemplateSchema,
  hasPermission,
  listEvaluationsQuerySchema,
  permissionsOf,
  updateEvaluationTemplateSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { personScope } from "../access/service.js";
import {
  createEvaluation,
  createTemplate,
  listEvaluations,
  listTemplates,
  updateTemplate,
} from "./service.js";

const templateParam = z.object({ templateId: z.uuid() });
const includeInactiveQuery = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

/** Templates hold no personal data: anyone who can read or write evaluations may list them. */
const canUseTemplates = createMiddleware<AppEnv>(async (c, next) => {
  const held = permissionsOf(principalOf(c).grants);
  if (!held.includes("evaluations.read") && !held.includes("evaluations.write")) {
    throw forbidden();
  }
  await next();
});

/**
 * /api/evaluations: templates (office) and evaluations of athletes. Evaluations are
 * personal-tier performance data: read and write are checked against the athlete's own
 * teams and classes, so a coach reaches only their athletes. Nothing is audited as health
 * data, and athletes do not see evaluations yet (club decision pending).
 */
export const evaluationsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/templates", canUseTemplates, validate("query", includeInactiveQuery), async (c) =>
      c.json({ templates: await listTemplates(db, c.req.valid("query")) }),
    )
    .post(
      "/templates",
      requirePermission("evaluations.manage"),
      validate("json", createEvaluationTemplateSchema),
      async (c) => {
        const template = await writeOrApiError(db, (tx) => createTemplate(tx, c.req.valid("json")));
        return c.json({ template }, 201);
      },
    )
    .patch(
      "/templates/:templateId",
      requirePermission("evaluations.manage"),
      validate("param", templateParam),
      validate("json", updateEvaluationTemplateSchema),
      async (c) => {
        const { templateId } = c.req.valid("param");
        const found = await writeOrApiError(db, (tx) =>
          updateTemplate(tx, templateId, c.req.valid("json")),
        );
        if (!found) throw notFound();
        const template = (await listTemplates(db, { includeInactive: true })).find(
          (t) => t.id === templateId,
        );
        return c.json({ template });
      },
    )
    .get("/", canUseTemplates, validate("query", listEvaluationsQuerySchema), async (c) => {
      const { personId } = c.req.valid("query");
      const scope = await personScope(db, personId);
      if (!hasPermission(principalOf(c).grants, "evaluations.read", scope)) throw forbidden();
      return c.json({ evaluations: await listEvaluations(db, personId) });
    })
    .post("/", canUseTemplates, validate("json", createEvaluationSchema), async (c) => {
      const principal = principalOf(c);
      const input = c.req.valid("json");
      const scope = await personScope(db, input.personId);
      if (!hasPermission(principal.grants, "evaluations.write", scope)) throw forbidden();
      const evaluation = await writeOrApiError(db, (tx) =>
        createEvaluation(tx, input, principal.userId),
      );
      return c.json({ evaluation }, 201);
    });
