import { type AccessScope, hasPermission, type Permission } from "@rsp/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { forbidden, unauthenticated } from "../../http/errors.js";
import type { AppEnv } from "../../http/types.js";
import type { Principal } from "./service.js";

/** The signed-in principal of a request; throws 401 when there is none. */
export function principalOf(c: Context<AppEnv>): Principal {
  const principal = c.get("principal");
  if (!principal) throw unauthenticated();
  return principal;
}

/** Rejects requests without a session (401). */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  principalOf(c);
  await next();
});

/**
 * Rejects the request unless the principal holds `permission` (401 without a session, 403
 * without the permission). `scopeOf` names the teams/classes of the resource for scoped
 * roles; without it only club-wide grants count. Every protected route goes through this or
 * an equivalent check in its handler, with allowed and denied tests.
 */
export const requirePermission = (
  permission: Permission,
  scopeOf?: (c: Context<AppEnv>) => Promise<AccessScope> | AccessScope,
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const principal = principalOf(c);
    const scope = scopeOf ? await scopeOf(c) : undefined;
    if (!hasPermission(principal.grants, permission, scope)) throw forbidden();
    await next();
  });
