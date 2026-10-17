import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/index.js";
import { users } from "./schema.js";

/** A demo login the sign-in screen offers on the staging sandbox (ADR 0018). */
export interface DemoAccount {
  email: string;
  name: string;
  role: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Constant-time comparison of two strings of any length (compares their equal-length hashes). */
export const sameCode = (given: string, expected: string) => {
  const x = digest(given);
  const y = digest(expected);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

/**
 * Sandbox sign-in: lists the fake demo accounts and opens a session for one of them without a
 * password, so nobody has to know or type one. Only registered when DEMO_MODE is on (staging);
 * prod never mounts these routes. Only the listed demo emails work, never a real account.
 * Both calls need the tester access code (kept in the server's environment, handed out by the
 * owner): without it nothing is listed and nobody is signed in. `/demo/status` only says the
 * sandbox exists, so the app knows whether to offer the code field.
 */
export function demoSignIn(
  db: Db,
  accounts: readonly DemoAccount[],
  accessCode: string,
): BetterAuthPlugin {
  const refuse = () =>
    APIError.from("FORBIDDEN", { message: "Invalid access code", code: "INVALID_CODE" });
  return {
    id: "demo-sign-in",
    endpoints: {
      demoStatus: createAuthEndpoint("/demo/status", { method: "GET" }, async (ctx) =>
        ctx.json({ enabled: true }),
      ),
      demoAccounts: createAuthEndpoint(
        "/demo/accounts",
        { method: "POST", body: z.object({ code: z.string().max(200) }) },
        async (ctx) => {
          if (!sameCode(ctx.body.code, accessCode)) throw refuse();
          return ctx.json({ accounts });
        },
      ),
      demoSignIn: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ email: z.string(), code: z.string().max(200) }) },
        async (ctx) => {
          if (!sameCode(ctx.body.code, accessCode)) throw refuse();
          if (!accounts.some((a) => a.email === ctx.body.email)) {
            throw APIError.from("FORBIDDEN", { message: "Not a demo account", code: "NOT_DEMO" });
          }
          const [user] = await db.select().from(users).where(eq(users.email, ctx.body.email));
          if (!user || user.deactivatedAt) {
            throw APIError.from("NOT_FOUND", { message: "Demo account missing", code: "NOT_DEMO" });
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
