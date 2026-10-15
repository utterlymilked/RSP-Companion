import { Hono } from "hono";
import { z } from "zod";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { personTierFor } from "../access/service.js";
import { audit } from "../audit/service.js";
import { getPerson } from "./service.js";

const personParam = z.object({ personId: z.uuid() });

/**
 * /api/people. M2 ships the read of one record, which is where tiers are enforced: the
 * response holds only the columns of the tier the reader may see. M5 adds lists and writes.
 */
export const peopleRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>().get("/:personId", validate("param", personParam), async (c) => {
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
  });
