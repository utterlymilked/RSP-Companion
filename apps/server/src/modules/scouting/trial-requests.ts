import { trialRequestSchema } from "@rsc/shared";
import { Hono } from "hono";
import { writeOrApiError } from "../../http/db-errors.js";
import { ApiError } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { createTrialRequest } from "./service.js";

/** Requests one address may send per hour. */
const LIMIT_PER_HOUR = 5;
const HOUR_MS = 3_600_000;

/** Sliding-window limiter kept in memory; the server is a single instance (ADR 0001). */
export function createRateLimiter(limit: number, windowMs: number, now = () => Date.now()) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    hits.set(key, [...recent, t]);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((at) => t - at >= windowMs)) hits.delete(k);
    }
    return true;
  };
}

/**
 * /api/trial-requests: the public form where a player or guardian asks for an observation
 * training. No login; rate limited per address, honeypot field, privacy consent required.
 * It only ever inserts a new prospect (source `request`).
 */
export const trialRequestRoutes = ({ db }: AppDeps) => {
  const allow = createRateLimiter(LIMIT_PER_HOUR, HOUR_MS);
  return new Hono<AppEnv>().post("/", validate("json", trialRequestSchema), async (c) => {
    const address = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!allow(address)) throw new ApiError(429, "rate_limited");
    const input = c.req.valid("json");
    if (input.website) return c.json({ ok: true }, 201); // bots get a silent success
    await writeOrApiError(db, (tx) => createTrialRequest(tx, input));
    return c.json({ ok: true }, 201);
  });
};
