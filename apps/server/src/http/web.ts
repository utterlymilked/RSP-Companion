import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Env, Hono, type MiddlewareHandler, type Schema } from "hono";
import { type AppLinksConfig, appLinksRoutes } from "./app-links.js";

/**
 * The production server: the API under /api, the app-link files under /.well-known, and the
 * app's web build (`expo export`, see ADR 0004) for every other path. Unknown paths outside
 * /api get index.html so client-side routes such as /invite?token=… load the app.
 */
/**
 * Browsers must check index.html on every visit, or a phone keeps showing the previous release
 * after a deploy; the hashed bundles under /_expo/static never change, so they cache for good.
 */
const cacheHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.req.path.startsWith("/_expo/static/")) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  } else if (c.res.headers.get("content-type")?.startsWith("text/html")) {
    c.header("Cache-Control", "no-cache");
  }
};

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
    .use("/*", cacheHeaders)
    .use("/*", serveStatic({ root }))
    .get("/*", serveStatic({ root, path: "index.html" }));
}
