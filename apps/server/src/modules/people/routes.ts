import {
  addGuardianSchema,
  createMembershipSchema,
  createPersonSchema,
  listPeopleQuerySchema,
  updateMembershipSchema,
  updatePersonSchema,
} from "@rsc/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { personTierFor, readScope } from "../access/service.js";
import { audit } from "../audit/service.js";
import { memberships } from "./schema.js";
import {
  addGuardian,
  createPerson,
  getPerson,
  guardiansOf,
  listPeople,
  membershipsOf,
  removeGuardian,
  updatePerson,
} from "./service.js";

const personParam = z.object({ personId: z.uuid() });
const guardianParam = personParam.extend({ guardianId: z.uuid() });
const membershipParam = personParam.extend({ membershipId: z.uuid() });

/**
 * /api/people. Reads return only the columns of the tier the reader may see (lists: general
 * tier, limited to the reader's teams and classes for scoped roles). Writes need
 * `people.write`, which is club-wide only (admin, staff).
 */
export const peopleRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", validate("query", listPeopleQuerySchema), async (c) => {
      const scope = readScope(principalOf(c), "people.read");
      if (scope !== "all" && scope.teamIds.length + scope.classIds.length === 0) {
        throw forbidden();
      }
      const people = await listPeople(db, c.req.valid("query"), scope === "all" ? null : scope);
      return c.json({ people });
    })
    .post(
      "/",
      requirePermission("people.write"),
      validate("json", createPersonSchema),
      async (c) => {
        const person = await writeOrApiError(db, (tx) => createPerson(tx, c.req.valid("json")));
        return c.json({ person }, 201);
      },
    )
    .get("/:personId", validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      const access = await personTierFor(db, principal, personId);
      if (!access) throw forbidden();
      const person = await getPerson(db, personId, access.tier);
      if (!person) throw notFound();
      if (access.tier === "personal" && !access.viaRelationship) {
        await audit(db, {
          actorUserId: principal.userId,
          action: "person.read_personal",
          tier: "personal",
          subjectPersonId: personId,
        });
      }
      return c.json({ tier: access.tier, person });
    })
    .patch(
      "/:personId",
      requirePermission("people.write"),
      validate("param", personParam),
      validate("json", updatePersonSchema),
      async (c) => {
        const { personId } = c.req.valid("param");
        const person = await writeOrApiError(db, (tx) =>
          updatePerson(tx, personId, c.req.valid("json")),
        );
        if (!person) throw notFound();
        return c.json({ person });
      },
    )
    // Guardians carry the tier the reader has over the child: a coach who may see an
    // athlete's contacts sees the guardians' contacts too (open question in REQUIREMENTS.md).
    .get("/:personId/guardians", validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      const access = await personTierFor(db, principal, personId);
      if (!access) throw forbidden();
      const guardians = await guardiansOf(db, personId, access.tier);
      if (access.tier === "personal" && !access.viaRelationship) {
        for (const g of guardians) {
          await audit(db, {
            actorUserId: principal.userId,
            action: "person.read_personal",
            tier: "personal",
            subjectPersonId: g.guardian.id,
          });
        }
      }
      return c.json({ tier: access.tier, guardians });
    })
    .post(
      "/:personId/guardians",
      requirePermission("people.write"),
      validate("param", personParam),
      validate("json", addGuardianSchema),
      async (c) => {
        const { personId } = c.req.valid("param");
        const guardianship = await writeOrApiError(db, (tx) =>
          addGuardian(tx, { childId: personId, ...c.req.valid("json") }),
        );
        return c.json({ guardianship }, 201);
      },
    )
    .delete(
      "/:personId/guardians/:guardianId",
      requirePermission("people.write"),
      validate("param", guardianParam),
      async (c) => {
        const { personId, guardianId } = c.req.valid("param");
        if (!(await removeGuardian(db, personId, guardianId))) throw notFound();
        return c.body(null, 204);
      },
    )
    // Member numbers identify a person, so memberships are personal-tier data.
    .get("/:personId/memberships", validate("param", personParam), async (c) => {
      const { personId } = c.req.valid("param");
      const access = await personTierFor(db, principalOf(c), personId);
      if (access?.tier !== "personal") throw forbidden();
      return c.json({ memberships: await membershipsOf(db, personId) });
    })
    .post(
      "/:personId/memberships",
      requirePermission("people.write"),
      validate("param", personParam),
      validate("json", createMembershipSchema),
      async (c) => {
        const { personId } = c.req.valid("param");
        const [membership] = await writeOrApiError(db, (tx) =>
          tx
            .insert(memberships)
            .values({ personId, ...c.req.valid("json") })
            .returning(),
        );
        return c.json({ membership }, 201);
      },
    )
    .patch(
      "/:personId/memberships/:membershipId",
      requirePermission("people.write"),
      validate("param", membershipParam),
      validate("json", updateMembershipSchema),
      async (c) => {
        const { personId, membershipId } = c.req.valid("param");
        const [membership] = await writeOrApiError(db, (tx) =>
          tx
            .update(memberships)
            .set(c.req.valid("json"))
            .where(and(eq(memberships.id, membershipId), eq(memberships.personId, personId)))
            .returning(),
        );
        if (!membership) throw notFound();
        return c.json({ membership });
      },
    );
