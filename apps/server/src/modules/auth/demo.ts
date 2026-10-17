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

/**
 * Sandbox sign-in: lists the fake demo accounts and opens a session for one of them without a
 * password, so nobody has to know or type one. Only registered when DEMO_MODE is on (staging);
 * prod never mounts these routes. Only the listed demo emails work, never a real account.
 */
export function demoSignIn(db: Db, accounts: readonly DemoAccount[]): BetterAuthPlugin {
  return {
    id: "demo-sign-in",
    endpoints: {
      demoAccounts: createAuthEndpoint("/demo/accounts", { method: "GET" }, async (ctx) =>
        ctx.json({ accounts }),
      ),
      demoSignIn: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ email: z.string() }) },
        async (ctx) => {
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
