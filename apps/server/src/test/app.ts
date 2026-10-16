import type { RoleGrantInput } from "@rsc/shared";
import { createApp } from "../app.js";
import type { Db } from "../db/index.js";
import { memoryMailer } from "../mail/mailer.js";
import { createAuth } from "../modules/auth/auth.js";
import { roleAssignments } from "../modules/auth/schema.js";
import { createUserWithPassword } from "../modules/auth/service.js";
import { createMemoryStorage } from "../storage/memory.js";

export const TEST_APP_URL = "http://localhost:8081";
export const TEST_PASSWORD = "correct-horse-battery";

let counter = 0;

/**
 * The real HTTP app on a test transaction, with emails kept in memory. Helpers create users
 * with roles and sign them in through Better Auth, returning the session cookie.
 */
export function testApp(db: Db) {
  const mailer = memoryMailer();
  const storage = createMemoryStorage();
  const auth = createAuth(db, {
    appUrl: TEST_APP_URL,
    secret: "test-secret-that-is-at-least-32-characters",
    mailer,
    disableRateLimit: true,
  });
  const app = createApp({ db, auth, mailer, appUrl: TEST_APP_URL, storage });

  /** A request with JSON body and the browser's Origin header (Better Auth checks it). */
  const request = (
    path: string,
    init: {
      method?: string;
      json?: unknown;
      cookie?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    app.request(path, {
      method: init.method ?? (init.json === undefined ? "GET" : "POST"),
      headers: {
        origin: TEST_APP_URL,
        ...(init.json === undefined ? {} : { "content-type": "application/json" }),
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });

  /** Signs in with email and password; returns the session cookie for later requests. */
  const signIn = async (email: string, password = TEST_PASSWORD) => {
    const res = await request("/api/auth/sign-in/email", { json: { email, password } });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
    return cookieFrom(res);
  };

  /** Creates a user holding `roles` (and optionally being `personId`), signed in. */
  const userWith = async (roles: RoleGrantInput[], options: { personId?: string } = {}) => {
    const email = `user${++counter}@example.test`;
    const user = await createUserWithPassword(db, {
      email,
      name: `Utilizador ${counter}`,
      password: TEST_PASSWORD,
      personId: options.personId,
    });
    if (roles.length > 0) {
      await db.insert(roleAssignments).values(roles.map((r) => ({ userId: user.id, ...r })));
    }
    return { user, cookie: await signIn(email) };
  };

  return { app, auth, mailer, storage, request, signIn, userWith };
}

/** `name=value` pairs of a response's Set-Cookie headers, joined for a Cookie header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Shorthand for a club-wide role grant. */
export const clubWide = (role: RoleGrantInput["role"]): RoleGrantInput => ({
  role,
  teamId: null,
  classId: null,
});
