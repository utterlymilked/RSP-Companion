import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/index.js";
import { DEMO_LOGINS } from "./db/seed.js";
import { loadEnv, stackOf } from "./env.js";
import { withWebApp } from "./http/web.js";
import { createMailer } from "./mail/mailer.js";
import { createAuth } from "./modules/auth/auth.js";
import { loadClubsIfEmpty } from "./modules/clubs/service.js";
import { startReminderJob } from "./modules/notifications/reminders.js";
import { startRetentionJob } from "./modules/privacy/retention.js";
import { consolePush, createExpoPush } from "./push/index.js";
import { createStorage } from "./storage/index.js";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const mailer = createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM });
const auth = createAuth(db, {
  appUrl: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  mailer,
  trustExpoGo: env.NODE_ENV === "development",
  demoAccounts: env.DEMO_MODE ? DEMO_LOGINS : undefined,
  demoAccessCode: env.DEMO_ACCESS_CODE,
});
const push = env.NODE_ENV === "development" ? consolePush() : createExpoPush();
const api = createApp({
  db,
  auth,
  mailer,
  push,
  stack: stackOf(env),
  appUrl: env.APP_URL,
  storage: createStorage(env),
});
startReminderJob({ db, mailer, push, appUrl: env.APP_URL });
startRetentionJob(db);
void loadClubsIfEmpty(db);
// In development the web build runs on Expo's dev server instead (ADR 0004).
const app = env.WEB_DIST_DIR
  ? withWebApp(api, {
      distDir: env.WEB_DIST_DIR,
      appLinks: { appleTeamId: env.APPLE_TEAM_ID, androidCertSha256: env.ANDROID_CERT_SHA256 },
      ota: env.OTA_DIR ? { dir: env.OTA_DIR, baseUrl: env.APP_URL.replace(/\/$/, "") } : undefined,
    })
  : api;

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`SFF RSC API listening on http://localhost:${info.port}`);
});
