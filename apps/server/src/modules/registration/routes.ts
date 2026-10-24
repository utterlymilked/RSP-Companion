import { Hono } from "hono";
import { ApiError } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { requirePermission } from "../access/middleware.js";
import { createChallenge } from "./altcha.js";
import { clientIp } from "./guard.js";
import { emailBudgetUsed, hashKey, hit, isOpen, LIMITS, registrationStatus } from "./service.js";

/**
 * /api/registration: what the sign-up screen needs before anyone is signed in (is it open,
 * is a key required, is it paused, a proof-of-work challenge) and the Ops status for
 * developers. Not in ROUTE_MODULES on purpose: strangers are no testers, the guard checks
 * the module itself.
 */
export const registrationRoutes = ({ db, stack, registration, storage, evidence }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/config", async (c) =>
      c.json({
        open: await isOpen(db, stack, registration),
        keyRequired: !!registration.key,
        paused: (await emailBudgetUsed(db)) >= registration.emailDailyLimit,
      }),
    )
    .get("/challenge", async (c) => {
      if (
        registration.limits &&
        !(await hit(
          db,
          hashKey(registration.secret, "challenge-ip", clientIp(c.req.raw.headers)),
          LIMITS.challengeIp,
        ))
      ) {
        throw new ApiError(429, "rate_limited");
      }
      return c.json(createChallenge(registration.secret));
    })
    .get("/status", requirePermission("modules.manage"), async (c) =>
      c.json({
        ...(await registrationStatus(db, registration.emailDailyLimit)),
        // The document method stays off until both exist (ADR 0026 section 10).
        evidence: { storageConfigured: storage !== null, ready: evidence !== null },
      }),
    );
