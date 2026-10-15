import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/index.js";
import { loadEnv } from "./env.js";
import { withWebApp } from "./http/web.js";
import { createMailer } from "./mail/mailer.js";
import { createAuth } from "./modules/auth/auth.js";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const mailer = createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM });
const auth = createAuth(db, {
  appUrl: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  mailer,
  trustExpoGo: env.NODE_ENV === "development",
});
const api = createApp({ db, auth, mailer, appUrl: env.APP_URL });
// In development the web build runs on Expo's dev server instead (ADR 0004).
const app = env.WEB_DIST_DIR ? withWebApp(api, env.WEB_DIST_DIR) : api;

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`RSP Companion API listening on http://localhost:${info.port}`);
});
