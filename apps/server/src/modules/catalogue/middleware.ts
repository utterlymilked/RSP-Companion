import { hasPermission, type ModuleId, visibleModules } from "@rsc/shared";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { getModuleOverrides } from "./service.js";

/** First path segment under /api → the module that owns it. Routes not listed are always on. */
export const ROUTE_MODULES: Record<string, ModuleId> = {
  users: "users",
  invitations: "users",
  people: "persons",
  imports: "persons",
  teams: "teams",
  classes: "teams",
  "staff-assignments": "teams",
  lookups: "teams",
  facilities: "reservations",
  bookings: "reservations",
  calendar: "reservations",
  callups: "callups",
  events: "events",
  equipment: "equipment",
  dashboard: "home",
  fees: "fees",
  evaluations: "evaluations",
  scouting: "scouting",
  "trial-requests": "scouting",
  clubs: "scouting",
  incidents: "incidents",
  health: "health",
  documents: "documents",
  announcements: "messages",
  notifications: "notifications",
  transport: "transport",
  privacy: "privacy",
  "audit-log": "audit",
  settings: "settings",
  feedback: "feedback",
};

/**
 * Answers 404 `module_disabled` for routes of a module that is off, not in this build, or (in
 * production) beta and the caller is no tester. Runs after the principal is loaded.
 */
export const moduleGate = ({ db, stack }: Pick<AppDeps, "db" | "stack">) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const segment = new URL(c.req.url).pathname.split("/")[2] ?? "";
    const module = ROUTE_MODULES[segment];
    if (module) {
      const principal = c.get("principal");
      const seesBeta = !!principal && hasPermission(principal.grants, "modules.beta");
      const visible = visibleModules(stack, await getModuleOverrides(db), seesBeta);
      if (!visible.includes(module)) throw new ApiError(404, "module_disabled");
    }
    await next();
  });
