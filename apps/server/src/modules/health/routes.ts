import {
  availabilityQuerySchema,
  createHealthNoteSchema,
  createInjurySchema,
  grantHealthConsentSchema,
  HEALTH_DISCIPLINES,
  type HealthDiscipline,
  hasPermission,
  healthPermission,
  permissionsOf,
  updateInjurySchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import {
  authorizeHealthRead,
  authorizeHealthWrite,
  personScope,
  readScope,
} from "../access/service.js";
import { audit } from "../audit/service.js";
import { todayInLisbon } from "../fees/service.js";
import {
  consentStatus,
  createInjury,
  createNote,
  getInjury,
  getPerson,
  grantConsent,
  listInjuries,
  listNotes,
  revokeConsent,
  teamAvailability,
  updateInjury,
} from "./service.js";

const personParam = z.object({ personId: z.uuid() });
const injuryParam = z.object({ injuryId: z.uuid() });

/**
 * /api/health: clinical records (ADR 0008). Each discipline reads and writes only its own
 * (`health.<discipline>.read|write`, decided per request from the person's teams); every
 * read and write is audited. Coaches never get here: they use GET /availability.
 */
export const healthRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/people/:personId/records", validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      if (!(await getPerson(db, personId))) throw notFound();
      const scope = await personScope(db, personId);
      const mine = HEALTH_DISCIPLINES.filter((d) =>
        hasPermission(principal.grants, healthPermission(d, "read"), scope),
      );
      const allowed: HealthDiscipline[] = [];
      for (const discipline of mine) {
        if (await authorizeHealthRead(db, principal, { personId, discipline })) {
          allowed.push(discipline);
        }
      }
      if (allowed.length === 0) throw forbidden();
      return c.json({
        disciplines: allowed,
        notes: await listNotes(db, personId, allowed),
        injuries: await listInjuries(db, personId, allowed),
        consent: await consentStatus(db, personId, todayInLisbon()),
      });
    })
    .post(
      "/people/:personId/notes",
      validate("param", personParam),
      validate("json", createHealthNoteSchema),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        const input = c.req.valid("json");
        if (!(await getPerson(db, personId))) throw notFound();
        if (
          !(await authorizeHealthWrite(db, principal, { personId, discipline: input.discipline }))
        ) {
          throw forbidden();
        }
        const note = await writeOrApiError(db, (tx) =>
          createNote(tx, personId, input, principal.userId, todayInLisbon()),
        );
        return c.json({ note }, 201);
      },
    )
    .post(
      "/people/:personId/injuries",
      validate("param", personParam),
      validate("json", createInjurySchema),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        const input = c.req.valid("json");
        if (!(await getPerson(db, personId))) throw notFound();
        if (
          !(await authorizeHealthWrite(db, principal, { personId, discipline: input.discipline }))
        ) {
          throw forbidden();
        }
        const injury = await writeOrApiError(db, (tx) =>
          createInjury(tx, personId, input, principal.userId, todayInLisbon()),
        );
        return c.json({ injury }, 201);
      },
    )
    .patch(
      "/injuries/:injuryId",
      validate("param", injuryParam),
      validate("json", updateInjurySchema),
      async (c) => {
        const principal = principalOf(c);
        const existing = await getInjury(db, c.req.valid("param").injuryId);
        if (!existing) throw notFound();
        const scope = await personScope(db, existing.personId);
        // Other disciplines must not learn that the injury exists.
        if (
          !hasPermission(principal.grants, healthPermission(existing.discipline, "read"), scope)
        ) {
          throw notFound();
        }
        if (
          !(await authorizeHealthWrite(db, principal, {
            personId: existing.personId,
            discipline: existing.discipline,
          }))
        ) {
          throw forbidden();
        }
        const injury = await writeOrApiError(db, (tx) =>
          updateInjury(tx, existing, c.req.valid("json"), todayInLisbon()),
        );
        return c.json({ injury });
      },
    )
    .get(
      "/people/:personId/consent",
      requirePermission("health.consent"),
      validate("param", personParam),
      async (c) => {
        const consent = await consentStatus(db, c.req.valid("param").personId, todayInLisbon());
        if (!consent) throw notFound();
        return c.json({ consent });
      },
    )
    .post(
      "/people/:personId/consent",
      requirePermission("health.consent"),
      validate("param", personParam),
      validate("json", grantHealthConsentSchema),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        if (!(await getPerson(db, personId))) throw notFound();
        await writeOrApiError(db, async (tx) => {
          await grantConsent(tx, personId, c.req.valid("json"), principal.userId);
          await audit(tx, {
            actorUserId: principal.userId,
            action: "health.consent",
            tier: "health",
            subjectPersonId: personId,
            details: { change: "granted" },
          });
        });
        return c.json({ consent: await consentStatus(db, personId, todayInLisbon()) }, 201);
      },
    )
    .post(
      "/people/:personId/consent/revoke",
      requirePermission("health.consent"),
      validate("param", personParam),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        const revoked = await writeOrApiError(db, async (tx) => {
          const row = await revokeConsent(tx, personId, todayInLisbon());
          if (row) {
            await audit(tx, {
              actorUserId: principal.userId,
              action: "health.consent",
              tier: "health",
              subjectPersonId: personId,
              details: { change: "revoked" },
            });
          }
          return row;
        });
        if (!revoked) throw notFound();
        return c.json({ consent: await consentStatus(db, personId, todayInLisbon()) });
      },
    )
    .get("/availability", validate("query", availabilityQuerySchema), async (c) => {
      const { teamId } = c.req.valid("query");
      const principal = principalOf(c);
      // Scoped roles (coach, team manager) hold the permission per team: readScope narrows it.
      if (!permissionsOf(principal.grants).includes("availability.read")) throw forbidden();
      const scope = readScope(principal, "availability.read");
      if (teamId && scope !== "all" && !scope.teamIds.includes(teamId)) throw forbidden();
      const teamIds = teamId ? [teamId] : scope === "all" ? null : scope.teamIds;
      const people = await teamAvailability(db, teamIds);
      // Without a team the list is an overview: only people who are not fully available.
      return c.json({
        people: teamId ? people : people.filter((p) => p.status !== "available"),
      });
    });
