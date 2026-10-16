import {
  CONSENT_KINDS,
  createPrivacyRequestSchema,
  deleteAccountSchema,
  erasePersonSchema,
  grantConsentSchema,
  hasPermission,
  privacyRequestsQuerySchema,
  resolvePrivacyRequestSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requireAuth, requirePermission } from "../access/middleware.js";
import { isSelfOrWard, type Principal, personScope } from "../access/service.js";
import { audit } from "../audit/service.js";
import { todayInLisbon } from "../fees/service.js";
import { erasePerson } from "./erasure.js";
import { exportPerson } from "./export.js";
import {
  consentStatus,
  createRequest,
  deleteOwnAccount,
  grantConsent,
  listRequests,
  resolveRequest,
  revokeConsent,
  subjectsOf,
  teamConsents,
} from "./service.js";

const personParam = z.object({ personId: z.uuid() });
const consentParam = personParam.extend({ kind: z.enum(CONSENT_KINDS) });
const teamParam = z.object({ teamId: z.uuid() });
const requestParam = z.object({ requestId: z.uuid() });

/** Consents of a person: themself, their guardians, or `consents.read` over their team/class. */
async function canReadConsents(db: Db, principal: Principal, personId: string) {
  if (await isSelfOrWard(db, principal, personId)) return true;
  return hasPermission(principal.grants, "consents.read", await personScope(db, personId));
}

/**
 * /api/privacy (ADR 0012): consents, the person's own data (export, requests), the office's
 * request queue and erasure, and in-app account deletion. People act on their own record and
 * their wards' through the data (self or guardian), the office through `consents.write` and
 * `privacy.manage`.
 */
export const privacyRoutes = ({ db, storage }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/subjects", requireAuth, async (c) =>
      c.json({ subjects: await subjectsOf(db, principalOf(c)) }),
    )
    .get("/people/:personId/consents", requireAuth, validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      if (!(await canReadConsents(db, principal, personId))) throw forbidden();
      const status = await consentStatus(db, personId, todayInLisbon());
      if (!status) throw notFound();
      return c.json(status);
    })
    .post(
      "/people/:personId/consents",
      requireAuth,
      validate("param", personParam),
      validate("json", grantConsentSchema),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        const input = c.req.valid("json");
        // The office records paper forms; anyone else only gives consent in their own name.
        const allowed =
          hasPermission(principal.grants, "consents.write") ||
          (principal.personId !== null && principal.personId === input.grantedByPersonId);
        if (!allowed) throw forbidden();
        const today = todayInLisbon();
        await writeOrApiError(db, async (tx) => {
          await grantConsent(tx, personId, input, principal.userId, today);
          await audit(tx, {
            actorUserId: principal.userId,
            action: "consent.changed",
            subjectPersonId: personId,
            details: { kind: input.kind, change: "granted" },
          });
        });
        return c.json(await consentStatus(db, personId, today), 201);
      },
    )
    .post(
      "/people/:personId/consents/:kind/revoke",
      requireAuth,
      validate("param", consentParam),
      async (c) => {
        const principal = principalOf(c);
        const { personId, kind } = c.req.valid("param");
        // Withdrawing is as easy as giving: the person, a guardian, or the office.
        const allowed =
          hasPermission(principal.grants, "consents.write") ||
          (await isSelfOrWard(db, principal, personId));
        if (!allowed) throw forbidden();
        const today = todayInLisbon();
        const revoked = await writeOrApiError(db, async (tx) => {
          const row = await revokeConsent(tx, personId, kind, today);
          if (row) {
            await audit(tx, {
              actorUserId: principal.userId,
              action: "consent.changed",
              subjectPersonId: personId,
              details: { kind, change: "revoked" },
            });
          }
          return row;
        });
        if (!revoked) throw notFound();
        return c.json(await consentStatus(db, personId, today));
      },
    )
    .get(
      "/teams/:teamId/consents",
      validate("param", teamParam),
      requirePermission("consents.read", (c) => ({
        teamIds: [c.req.param("teamId") ?? ""],
        classIds: [],
      })),
      async (c) => c.json({ people: await teamConsents(db, c.req.valid("param").teamId) }),
    )
    .get("/people/:personId/export", requireAuth, validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      const own = await isSelfOrWard(db, principal, personId);
      if (!own && !hasPermission(principal.grants, "privacy.manage")) throw forbidden();
      const data = await exportPerson(db, personId);
      if (!data) throw notFound();
      await audit(db, {
        actorUserId: principal.userId,
        action: "privacy.export",
        tier: "personal",
        subjectPersonId: personId,
        details: { via: own ? "self_or_guardian" : "office" },
      });
      c.header("Content-Disposition", `attachment; filename="dados-${personId}.json"`);
      c.header("Cache-Control", "no-store");
      return c.json(data);
    })
    .post(
      "/people/:personId/erase",
      requirePermission("privacy.manage"),
      validate("param", personParam),
      validate("json", erasePersonSchema),
      async (c) => {
        const principal = principalOf(c);
        const erased = await erasePerson(db, storage, {
          personId: c.req.valid("param").personId,
          actorUserId: principal.userId,
          requestId: c.req.valid("json").requestId,
        });
        return c.json({ erased });
      },
    )
    .get("/requests", requireAuth, validate("query", privacyRequestsQuerySchema), async (c) => {
      const principal = principalOf(c);
      const office = hasPermission(principal.grants, "privacy.manage");
      const requests = await listRequests(db, {
        status: c.req.valid("query").status,
        requestedBy: office ? undefined : principal.userId,
      });
      return c.json({ requests });
    })
    .post("/requests", requireAuth, validate("json", createPrivacyRequestSchema), async (c) => {
      const principal = principalOf(c);
      const input = c.req.valid("json");
      const allowed =
        hasPermission(principal.grants, "privacy.manage") ||
        (await isSelfOrWard(db, principal, input.personId));
      if (!allowed) throw forbidden();
      const request = await writeOrApiError(db, (tx) => createRequest(tx, input, principal.userId));
      return c.json({ request }, 201);
    })
    .post(
      "/requests/:requestId/resolve",
      requirePermission("privacy.manage"),
      validate("param", requestParam),
      validate("json", resolvePrivacyRequestSchema),
      async (c) => {
        const principal = principalOf(c);
        const request = await writeOrApiError(db, (tx) =>
          resolveRequest(tx, c.req.valid("param").requestId, c.req.valid("json"), principal.userId),
        );
        return c.json({ request });
      },
    )
    .post("/account/delete", requireAuth, validate("json", deleteAccountSchema), async (c) => {
      const principal = principalOf(c);
      await writeOrApiError(db, (tx) =>
        deleteOwnAccount(tx, principal, c.req.valid("json").eraseData),
      );
      return c.json({ deleted: true });
    });
