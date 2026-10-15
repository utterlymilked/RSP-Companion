import { expo } from "@better-auth/expo";
import { APP_SCHEME, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@rsc/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import type { Db } from "../../db/index.js";
import type { Mailer } from "../../mail/mailer.js";
import { magicLinkMail, resetPasswordMail } from "../../mail/templates.js";
import { accounts, sessions, users, verifications } from "./schema.js";

export interface AuthConfig {
  /** Public URL of the app on the web (links in emails, trusted origin). */
  appUrl: string;
  secret: string;
  mailer: Mailer;
  /** Also trust Expo Go (`exp://…`) origins: development only, never in production. */
  trustExpoGo?: boolean;
  /** Turn off Better Auth's rate limiter (tests make many sign-ins). */
  disableRateLimit?: boolean;
}

/**
 * Better Auth: sessions (cookies), email + password, magic links and password reset, mounted
 * at /api/auth/*. There is no public sign-up: accounts are created from invitations or by the
 * create-admin script. Authorization is ours (src/modules/access), not Better Auth's.
 *
 * The native apps (ADR 0004) keep the session cookie in secure storage and send it as a Cookie
 * header; the expo plugin maps their `expo-origin` header to Origin and, after a magic-link
 * verification redirecting to `rsc://…`, hands the new cookie to the app in the URL.
 */
export function createAuth(db: Db, config: AuthConfig) {
  return betterAuth({
    appName: "RSC Companion",
    baseURL: config.appUrl,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.appUrl, `${APP_SCHEME}://`, ...(config.trustExpoGo ? ["exp://"] : [])],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),
    user: { modelName: "users" },
    session: {
      modelName: "sessions",
      expiresIn: 60 * 60 * 24 * 30, // 30 days, refreshed daily while in use
      updateAge: 60 * 60 * 24,
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    advanced: {
      database: { generateId: "uuid" },
      // Behind Caddy (M4): the client IP for rate limiting comes from X-Forwarded-For.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: { enabled: !config.disableRateLimit },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await config.mailer.send(resetPasswordMail(user.email, url));
      },
    },
    plugins: [
      expo(),
      magicLink({
        disableSignUp: true,
        expiresIn: 60 * 10,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await config.mailer.send(magicLinkMail(email, url));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
