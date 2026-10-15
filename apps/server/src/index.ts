import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`RSP Companion API listening on http://localhost:${info.port}`);
});
