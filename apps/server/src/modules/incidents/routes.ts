import {
  createIncidentSchema,
  listIncidentsQuerySchema,
  permissionsOf,
  updateIncidentSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { readScope } from "../access/service.js";
import {
  createIncident,
  getIncident,
  incidentPeopleOf,
  listIncidents,
  peopleCounts,
  present,
  updateIncident,
  viewOf,
} from "./service.js";

const incidentParam = z.object({ incidentId: z.uuid() });

/** Anyone who can read or report incidents may open the log; rows are filtered per incident. */
const canUseLog = createMiddleware<AppEnv>(async (c, next) => {
  const held = permissionsOf(principalOf(c).grants);
  if (!held.includes("incidents.read") && !held.includes("incidents.write")) throw forbidden();
  await next();
});

/**
 * /api/incidents: the incident log. Which incidents a user sees, and how much of an injury
 * report, is decided per row by `viewOf` (ADR 0006); anything not visible answers 404.
 */
export const incidentsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", canUseLog, validate("query", listIncidentsQuerySchema), async (c) => {
      const principal = principalOf(c);
      const visible = (await listIncidents(db, c.req.valid("query"))).flatMap((incident) => {
        const view = viewOf(principal, incident);
        return view ? [{ incident, view }] : [];
      });
      const counts = await peopleCounts(
        db,
        visible.filter((v) => v.view === "full").map((v) => v.incident.id),
      );
      return c.json({
        incidents: visible.map(({ incident, view }) =>
          present(incident, view, { peopleCount: counts.get(incident.id) ?? 0 }),
        ),
      });
    })
    .post("/", canUseLog, validate("json", createIncidentSchema), async (c) => {
      const principal = principalOf(c);
      const scope = readScope(principal, "incidents.write");
      const input = c.req.valid("json");
      if (scope !== "all" && (!input.teamId || !scope.teamIds.includes(input.teamId))) {
        throw forbidden();
      }
      const { incident, created } = await writeOrApiError(db, (tx) =>
        createIncident(tx, input, principal.userId),
      );
      return c.json({ incident: present(incident, "full") }, created ? 201 : 200);
    })
    .get("/:incidentId", canUseLog, validate("param", incidentParam), async (c) => {
      const incident = await getIncident(db, c.req.valid("param").incidentId);
      const view = incident && viewOf(principalOf(c), incident);
      if (!incident || !view) throw notFound();
      const people = view === "full" ? await incidentPeopleOf(db, incident.id) : [];
      return c.json({ incident: present(incident, view, { people }) });
    })
    .patch(
      "/:incidentId",
      canUseLog,
      validate("param", incidentParam),
      validate("json", updateIncidentSchema),
      async (c) => {
        const principal = principalOf(c);
        const current = await getIncident(db, c.req.valid("param").incidentId);
        if (!current || !viewOf(principal, current)) throw notFound();
        const input = c.req.valid("json");
        const manages = permissionsOf(principal.grants).includes("incidents.manage");
        const ownsOpen = current.reportedBy === principal.userId && current.status !== "closed";
        if ((input.status !== undefined || input.followUp !== undefined) && !manages) {
          throw forbidden();
        }
        if (!manages && !ownsOpen) throw forbidden();
        const updated = await writeOrApiError(db, (tx) => updateIncident(tx, current.id, input));
        if (!updated) throw notFound();
        return c.json({ incident: present(updated, viewOf(principal, updated) ?? "summary") });
      },
    );
