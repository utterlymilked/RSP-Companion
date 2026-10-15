import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Env, Hono, type Schema } from "hono";

/**
 * The production server: the API under /api plus the app's web build (`expo export`, see
 * ADR 0004) for every other path. Unknown paths outside /api get index.html so client-side
 * routes such as /invite?token=… load the app, which then routes them.
 */
export function withWebApp<E extends Env, S extends Schema, B extends string>(
  api: Hono<E, S, B>,
  distDir: string,
) {
  const root = resolve(distDir);
  return new Hono<E>()
    .route("/", api)
    .all("/api/*", (c) => c.json({ error: { code: "not_found" } }, 404))
    .use("/*", serveStatic({ root }))
    .get("/*", serveStatic({ root, path: "index.html" }));
}
