import { APP_HEADERS, type AppRequirements, type ClientVersion, judgeClient } from "@rsc/shared";
import { Hono, type MiddlewareHandler } from "hono";
import type { OtaUpdate } from "./ota.js";

/**
 * Forced updates (ADR 0028, docs/OPERATIONS.md#forced-updates): the minimum app the server
 * accepts, published for clients and enforced on every API request.
 */
export interface AppPolicy {
  /** Off by default (development, tests): nothing is refused and clients never block. */
  enforce: boolean;
  /** Oldest native runtime; defaults to the runtime of the bundle this server offers. */
  minRuntime?: string;
  /** Oldest bundle build (ISO 8601), or `current`: the bundle this server offers now. */
  minBuiltAt?: string;
  downloadUrl?: string;
  /** The over-the-air bundle this server offers (null: none). */
  ota: Pick<OtaUpdate, "runtimeVersion" | "createdAt"> | null;
}

export function requirementsOf(policy: AppPolicy): AppRequirements {
  const served = policy.ota && {
    runtime: policy.ota.runtimeVersion,
    builtAt: policy.ota.createdAt,
  };
  return {
    enforced: policy.enforce,
    minRuntime: policy.minRuntime ?? served?.runtime ?? null,
    minBuiltAt:
      policy.minBuiltAt === "current" ? (served?.builtAt ?? null) : (policy.minBuiltAt ?? null),
    downloadUrl: policy.downloadUrl ?? null,
    served,
  };
}

export function clientOf(headers: Headers): ClientVersion {
  let platform = headers.get(APP_HEADERS.platform);
  // The web app of an older release sends no header, but a browser always says where it comes from;
  // a native app from before this feature does not, and counts as outdated.
  if (!platform && (headers.get("sec-fetch-site") || headers.get("origin"))) platform = "web";
  return {
    platform,
    runtime: headers.get(APP_HEADERS.runtime),
    builtAt: headers.get(APP_HEADERS.builtAt),
  };
}

/** GET /api/app/requirements: public, so a blocked app can still find out what to do. */
export function appVersionRoutes(policy: AppPolicy) {
  return new Hono().get("/requirements", (c) => {
    const client = clientOf(c.req.raw.headers);
    // One line per app start: shows in the server log which builds are in use (no personal data).
    console.log(
      `app-client platform=${client.platform ?? "-"} runtime=${client.runtime ?? "-"} built=${client.builtAt ?? "-"} update=${c.req.header(APP_HEADERS.update)?.slice(0, 8) ?? "-"}`,
    );
    return c.json(requirementsOf(policy));
  });
}

/** Refuses clients below the minimum with 426 `app_update_required`; the code says what to do. */
export function appVersionGate(policy: AppPolicy): MiddlewareHandler {
  const requirements = requirementsOf(policy);
  return async (c, next) => {
    const verdict = judgeClient(requirements, clientOf(c.req.raw.headers));
    if (verdict === "ok") return next();
    return c.json({ error: { code: "app_update_required", issues: { update: verdict } } }, 426);
  };
}
