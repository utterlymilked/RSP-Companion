import {
  createProspectReportSchema,
  createProspectSchema,
  hasPermission,
  linkProspectSchema,
  linkSuggestionsQuerySchema,
  listProspectsQuerySchema,
  mergePreviewQuerySchema,
  updateProspectSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import {
  addReport,
  createProspect,
  getProspect,
  getProspectRow,
  linkProspect,
  linkSuggestions,
  listProspects,
  listReports,
  mergePreview,
  presentProspect,
  updateProspect,
} from "./service.js";

const prospectParam = z.object({ prospectId: z.uuid() });

/**
 * /api/scouting: external prospects and the reports on them. Club-wide: `scouting.read` to
 * look, `scouting.write` to change (scouts, recruiters and the office). Prospects are not
 * people-registry records and carry no contacts; see ADR 0007 for retention.
 */
export const scoutingRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get(
      "/prospects",
      requirePermission("scouting.read"),
      validate("query", listProspectsQuerySchema),
      async (c) => c.json({ prospects: await listProspects(db, c.req.valid("query")) }),
    )
    .post(
      "/prospects",
      requirePermission("scouting.write"),
      validate("json", createProspectSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const prospect = await writeOrApiError(db, (tx) =>
          createProspect(tx, c.req.valid("json"), userId),
        );
        return c.json({ prospect: await presentProspect(db, prospect) }, 201);
      },
    )
    .get(
      "/prospects/:prospectId",
      requirePermission("scouting.read"),
      validate("param", prospectParam),
      async (c) => {
        const { prospectId } = c.req.valid("param");
        const prospect = await getProspectRow(db, prospectId);
        if (!prospect) throw notFound();
        return c.json({
          prospect,
          reports: await listReports(db, prospectId),
        });
      },
    )
    .patch(
      "/prospects/:prospectId",
      requirePermission("scouting.write"),
      validate("param", prospectParam),
      validate("json", updateProspectSchema),
      async (c) => {
        const prospect = await writeOrApiError(db, (tx) =>
          updateProspect(tx, c.req.valid("param").prospectId, c.req.valid("json")),
        );
        if (!prospect) throw notFound();
        return c.json({ prospect: await presentProspect(db, prospect) });
      },
    )
    .get(
      "/prospects/:prospectId/link-suggestions",
      requirePermission("scouting.read"),
      validate("param", prospectParam),
      validate("query", linkSuggestionsQuerySchema),
      async (c) =>
        c.json({
          suggestions: await linkSuggestions(
            db,
            c.req.valid("param").prospectId,
            c.req.valid("query").q,
          ),
        }),
    )
    .get(
      "/prospects/:prospectId/merge-preview",
      requirePermission("people.write"),
      validate("param", prospectParam),
      validate("query", mergePreviewQuerySchema),
      async (c) =>
        c.json({
          rows: await mergePreview(
            db,
            c.req.valid("param").prospectId,
            c.req.valid("query").personId,
          ),
        }),
    )
    .post(
      "/prospects/:prospectId/link",
      requirePermission("scouting.write"),
      validate("param", prospectParam),
      validate("json", linkProspectSchema),
      async (c) => {
        const input = c.req.valid("json");
        // Merging writes to the person's record, which scouting access does not cover.
        if (
          Object.keys(input.choices).length > 0 &&
          !hasPermission(principalOf(c).grants, "people.write")
        )
          throw forbidden();
        const prospect = await writeOrApiError(db, (tx) =>
          linkProspect(tx, c.req.valid("param").prospectId, input),
        );
        return c.json({ prospect: await presentProspect(db, prospect) });
      },
    )
    .post(
      "/prospects/:prospectId/reports",
      requirePermission("scouting.write"),
      validate("param", prospectParam),
      validate("json", createProspectReportSchema),
      async (c) => {
        const userId = principalOf(c).userId;
        const report = await writeOrApiError(db, (tx) =>
          addReport(tx, c.req.valid("param").prospectId, c.req.valid("json"), userId),
        );
        return c.json({ report }, 201);
      },
    );
