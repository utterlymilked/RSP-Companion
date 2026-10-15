import type { HealthResponse } from "@rsp/shared";
import { Hono } from "hono";

const VERSION = process.env.APP_VERSION ?? "dev";

/**
 * The HTTP app. Every API route lives under /api and is chained here so the
 * exported AppType carries the full route map for the typed client in apps/web.
 */
export const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json<HealthResponse>({ status: "ok", version: VERSION }));

export type AppType = typeof app;
