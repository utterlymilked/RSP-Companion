import { timingSafeEqual } from "node:crypto";
import { type ApiErrorCode, isDisposableEmail, type Stack } from "@rsc/shared";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import type { AppEnv } from "../../http/types.js";
import { verifySolution } from "./altcha.js";
import {
  countRejection,
  emailBudgetUsed,
  hashKey,
  hit,
  isOpen,
  LIMITS,
  type Limit,
  type RegistrationDeps,
} from "./service.js";

/** Header carrying the solved proof of work (ALTCHA payload). */
export const CHALLENGE_HEADER = "x-altcha";
/** Header carrying the staging access key (ADR 0026: staging is not open to strangers). */
export const KEY_HEADER = "x-registration-key";

const bodyEmail = z.object({ email: z.string().max(320) });

const MAIL_PATHS = [
  "/api/auth/send-verification-email",
  "/api/auth/request-password-reset",
  "/api/auth/sign-in/magic-link",
];
const SIGN_UP_PATH = "/api/auth/sign-up/email";
const SIGN_IN_PATH = "/api/auth/sign-in/email";

const sameKey = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The client address: Caddy sets X-Forwarded-For; the server trusts only that proxy. */
export const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/**
 * Abuse protection in front of Better Auth (ADR 0026 section 1): the kill switch and staging
 * key, per-address and per-IP limits (the per-IP rules of the endpoints are Better Auth's own,
 * stored in the database), proof of work on sign-up and resend, the daily email budget, and
 * identical answers whether or not an address already has an account.
 */
export const registrationGuard = (db: Db, stack: Stack, deps: RegistrationDeps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const path = new URL(c.req.url).pathname;
    const signUp = path === SIGN_UP_PATH;
    const resend = path === "/api/auth/send-verification-email";
    const mail = MAIL_PATHS.includes(path);
    const signIn = path === SIGN_IN_PATH;
    if (c.req.method !== "POST" || !(signUp || mail || signIn)) return next();

    const refuse = async (status: 400 | 403 | 429 | 503, code: ApiErrorCode): Promise<never> => {
      await countRejection(db, code);
      throw new ApiError(status, code);
    };
    const within = async (rule: string, value: string, limit: Limit) => {
      if (!deps.limits) return;
      if (!(await hit(db, hashKey(deps.secret, rule, value), limit))) {
        await refuse(429, "rate_limited");
      }
    };

    const parsed = bodyEmail.safeParse(
      await c.req.raw
        .clone()
        .json()
        .catch(() => null),
    );
    if (!parsed.success) return next(); // Better Auth answers the malformed request
    const email = parsed.data.email.trim().toLowerCase();
    const ip = clientIp(c.req.raw.headers);

    if (signIn) {
      await within("login-email", email, LIMITS.loginEmail);
      return next();
    }

    if (signUp || resend) {
      if (!(await isOpen(db, stack, deps))) return refuse(403, "registration_closed");
      if (deps.key) {
        const sent = c.req.header(KEY_HEADER) ?? "";
        if (!sameKey(sent, deps.key)) return refuse(403, "registration_key_invalid");
      }
      if (deps.limits) {
        const proof = verifySolution(deps.secret, c.req.header(CHALLENGE_HEADER));
        if (!proof.ok) return refuse(400, "challenge_invalid");
        // A solved challenge works once.
        if (!(await hit(db, hashKey(deps.secret, "altcha", proof.salt), { window: 900, max: 1 }))) {
          return refuse(400, "challenge_invalid");
        }
      }
      if ((await emailBudgetUsed(db)) >= deps.emailDailyLimit) {
        return refuse(503, "registration_paused");
      }
    }

    if (signUp && isDisposableEmail(email)) {
      // Pretend it worked, send nothing: the rule is not revealed.
      await countRejection(db, "disposable_domain");
      return c.json({ ok: true });
    }
    if (signUp) {
      const domain = email.split("@")[1] ?? "";
      await within("signup-ip", ip, LIMITS.signUpIp);
      await within("signup-domain-ip", `${domain}|${ip}`, LIMITS.signUpDomainIp);
    }
    if (signUp || mail) {
      await within("mail-minute", email, LIMITS.mailMinute);
      await within("mail-hour", email, LIMITS.mailHour);
      await within("mail-day", email, LIMITS.mailDay);
    }

    await next();

    if (signUp) {
      // Same answer for a new address, an existing one, and a disposable domain: the form
      // cannot be used to learn who has an account. Validation errors still pass through.
      const status = c.res.status;
      const code =
        status >= 400
          ? (
              (await c.res
                .clone()
                .json()
                .catch(() => null)) as { code?: string } | null
            )?.code
          : undefined;
      if (
        status < 300 ||
        code === "USER_ALREADY_EXISTS" ||
        code?.startsWith("USER_ALREADY_EXISTS")
      ) {
        c.res = c.json({ ok: true });
      }
    }
  });
