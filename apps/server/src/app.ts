import type { HealthResponse } from "@rsc/shared";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { ApiError } from "./http/errors.js";
import type { AppDeps, AppEnv } from "./http/types.js";
import { loadPrincipal } from "./modules/access/service.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { invitationsRoutes, meRoutes, usersRoutes } from "./modules/auth/routes.js";
import { peopleRoutes } from "./modules/people/routes.js";
import {
  classesRoutes,
  lookupRoutes,
  staffAssignmentsRoutes,
  teamsRoutes,
} from "./modules/teams/routes.js";

const VERSION = process.env.APP_VERSION ?? "dev";

/**
 * Builds the HTTP app. Every API route lives under /api and is chained here so AppType
 * carries the full route map for the typed client in apps/mobile. Better Auth owns
 * /api/auth/* (sign-in, sign-out, magic links, password reset); every other route sees the
 * signed-in principal (or null) and checks permissions itself (src/modules/access).
 */
export function createApp(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      .basePath("/api")
      .onError((error, c) => {
        if (error instanceof ApiError) {
          return c.json({ error: { code: error.code, issues: error.issues } }, error.status);
        }
        if (error instanceof HTTPException && error.status < 500) {
          // Thrown by Hono middleware (CSRF check, malformed JSON).
          const code = error.status === 403 ? "forbidden" : "invalid_request";
          return c.json({ error: { code } }, error.status);
        }
        console.error(error);
        return c.json({ error: { code: "internal_error" } }, 500);
      })
      .notFound((c) => c.json({ error: { code: "not_found" } }, 404))
      .get("/health", (c) => c.json<HealthResponse>({ status: "ok", version: VERSION }))
      .on(["GET", "POST"], "/auth/*", (c) => deps.auth.handler(c.req.raw))
      // Cookie sessions: refuse form posts from other sites (JSON needs CORS, which is off).
      .use(csrf({ origin: new URL(deps.appUrl).origin }))
      .use(async (c, next) => {
        const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
        c.set("principal", session ? await loadPrincipal(deps.db, session.user.id) : null);
        await next();
      })
      .route("/me", meRoutes())
      .route("/users", usersRoutes(deps))
      .route("/invitations", invitationsRoutes(deps))
      .route("/people", peopleRoutes(deps))
      .route("/teams", teamsRoutes(deps))
      .route("/classes", classesRoutes(deps))
      .route("/staff-assignments", staffAssignmentsRoutes(deps))
      .route("/lookups", lookupRoutes(deps))
      .route("/audit-log", auditRoutes(deps))
  );
}

export type AppType = ReturnType<typeof createApp>;
