import { serve } from "@hono/node-server";
import { resolveModules } from "@rsc/shared";
import { createApp } from "./app.js";
import { createDb } from "./db/index.js";
import { DEMO_LOGINS } from "./db/seed.js";
import { loadEnv, stackOf } from "./env.js";
import { otaExport } from "./http/ota.js";
import { withWebApp } from "./http/web.js";
import { createMailer } from "./mail/mailer.js";
import { createAuth } from "./modules/auth/auth.js";
import { getModuleOverrides } from "./modules/catalogue/service.js";
import { loadClubsIfEmpty } from "./modules/clubs/service.js";
import { parseMasterKeys } from "./modules/evidence/crypto.js";
import { createEvidenceStore } from "./modules/evidence/service.js";
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
  registration: {
    enabled: env.SELF_REGISTRATION,
    emailDailyLimit: env.REGISTRATION_EMAIL_DAILY_LIMIT,
  },
});
const storage = createStorage(env);
const evidence = createEvidenceStore(
  storage,
  env.IDENTITY_DOCS_KEYS ? parseMasterKeys(env.IDENTITY_DOCS_KEYS) : null,
);
const push = env.NODE_ENV === "development" ? consolePush() : createExpoPush();
const ota = otaExport(env.OTA_DIR);
const api = createApp({
  db,
  auth,
  mailer,
  push,
  stack: stackOf(env),
  appUrl: env.APP_URL,
  storage,
  evidence,
  appPolicy: {
    enforce: env.APP_VERSION_ENFORCEMENT,
    minRuntime: env.MIN_APP_RUNTIME,
    minBuiltAt: env.MIN_APP_BUILT_AT,
    downloadUrl: env.APP_DOWNLOAD_URL,
    ota,
  },
  registration: {
    enabled: env.SELF_REGISTRATION,
    key: env.REGISTRATION_KEY,
    emailDailyLimit: env.REGISTRATION_EMAIL_DAILY_LIMIT,
    secret: env.BETTER_AUTH_SECRET,
    limits: true,
  },
});
startReminderJob({ db, mailer, push, appUrl: env.APP_URL });
startRetentionJob(db, evidence, {
  mode: env.INACTIVE_USER_PURGE as "off" | "dry-run" | "on",
  mailer,
  appUrl: env.APP_URL,
  enabled: async () => resolveModules(stackOf(env), await getModuleOverrides(db)).accountPurge,
});
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
