import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Env, Hono, type Schema } from "hono";
import { type AppLinksConfig, appLinksRoutes } from "./app-links.js";

/**
 * The production server: the API under /api, the app-link files under /.well-known, and the
 * app's web build (`expo export`, see ADR 0004) for every other path. Unknown paths outside
 * /api get index.html so client-side routes such as /invite?token=… load the app.
 */
export function withWebApp<E extends Env, S extends Schema, B extends string>(
  api: Hono<E, S, B>,
  { distDir, appLinks = {} }: { distDir: string; appLinks?: AppLinksConfig },
) {
  const root = resolve(distDir);
  return new Hono<E>()
    .route("/", api)
    .all("/api/*", (c) => c.json({ error: { code: "not_found" } }, 404))
    .route("/", appLinksRoutes(appLinks))
    .all("/.well-known/*", (c) => c.notFound())
    .use("/*", serveStatic({ root }))
    .get("/*", serveStatic({ root, path: "index.html" }));
}
