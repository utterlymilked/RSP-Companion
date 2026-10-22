import type { HealthResponse } from "@rsc/shared";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { ApiError } from "./http/errors.js";
import type { AppDeps, AppEnv } from "./http/types.js";
import { loadPrincipal } from "./modules/access/service.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { invitationsRoutes, meRoutes, usersRoutes } from "./modules/auth/routes.js";
import { bookingsRoutes, calendarRoutes, facilitiesRoutes } from "./modules/bookings/routes.js";
import { callupsRoutes } from "./modules/callups/routes.js";
import { clubsRoutes } from "./modules/clubs/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { documentsRoutes } from "./modules/documents/routes.js";
import { equipmentRoutes } from "./modules/equipment/routes.js";
import { evaluationsRoutes } from "./modules/evaluations/routes.js";
import { eventsRoutes } from "./modules/events/routes.js";
import { feedbackRoutes } from "./modules/feedback/routes.js";
import { feesRoutes } from "./modules/fees/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { importsRoutes } from "./modules/imports/routes.js";
import { incidentsRoutes } from "./modules/incidents/routes.js";
import { announcementsRoutes, notificationsRoutes } from "./modules/notifications/routes.js";
import { peopleRoutes } from "./modules/people/routes.js";
import { privacyRoutes } from "./modules/privacy/routes.js";
import { scoutingRoutes } from "./modules/scouting/routes.js";
import { settingsRoutes } from "./modules/settings/routes.js";
import {
  classesRoutes,
  lookupRoutes,
  staffAssignmentsRoutes,
  teamsRoutes,
} from "./modules/teams/routes.js";
import { transportRoutes } from "./modules/transport/routes.js";

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
      .route("/me", meRoutes(deps))
      .route("/users", usersRoutes(deps))
      .route("/invitations", invitationsRoutes(deps))
      .route("/people", peopleRoutes(deps))
      .route("/imports", importsRoutes(deps))
      .route("/teams", teamsRoutes(deps))
      .route("/classes", classesRoutes(deps))
      .route("/staff-assignments", staffAssignmentsRoutes(deps))
      .route("/lookups", lookupRoutes(deps))
      .route("/facilities", facilitiesRoutes(deps))
      .route("/bookings", bookingsRoutes(deps))
      .route("/callups", callupsRoutes(deps))
      .route("/events", eventsRoutes(deps))
      .route("/calendar", calendarRoutes(deps))
      .route("/equipment", equipmentRoutes(deps))
      .route("/dashboard", dashboardRoutes(deps))
      .route("/fees", feesRoutes(deps))
      .route("/evaluations", evaluationsRoutes(deps))
      .route("/scouting", scoutingRoutes(deps))
      .route("/clubs", clubsRoutes(deps))
      .route("/incidents", incidentsRoutes(deps))
      .route("/health", healthRoutes(deps))
      .route("/documents", documentsRoutes(deps))
      .route("/announcements", announcementsRoutes(deps))
      .route("/notifications", notificationsRoutes(deps))
      .route("/transport", transportRoutes(deps))
      .route("/privacy", privacyRoutes(deps))
      .route("/audit-log", auditRoutes(deps))
      .route("/settings", settingsRoutes(deps))
      .route("/feedback", feedbackRoutes(deps))
  );
}

export type AppType = ReturnType<typeof createApp>;
