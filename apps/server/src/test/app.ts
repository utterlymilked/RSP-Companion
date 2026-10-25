import type { RoleGrant } from "@rsc/shared";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import type { Db } from "../db/index.js";
import type { AppDeps } from "../http/types.js";
import { memoryMailer } from "../mail/mailer.js";
import { createAuth } from "../modules/auth/auth.js";
import { setOwnerPerson } from "../modules/auth/owner.js";
import { roleAssignments } from "../modules/auth/schema.js";
import { createUserWithPassword } from "../modules/auth/service.js";
import { parseMasterKeys } from "../modules/evidence/crypto.js";
import { createEvidenceStore } from "../modules/evidence/service.js";
import { classes, staffAssignments, teams } from "../modules/teams/schema.js";
import { memoryPush } from "../push/index.js";
import { createMemoryStorage } from "../storage/memory.js";
import { makePerson } from "./factories.js";

export const TEST_APP_URL = "http://localhost:8081";
export const TEST_EVIDENCE_KEYS = `2:${"b".repeat(43)}=,1:${"a".repeat(43)}=`;
export const TEST_PASSWORD = "correct-horse-battery";

let counter = 0;

/**
 * The real HTTP app on a test transaction, with emails kept in memory. Helpers create users
 * with roles and sign them in through Better Auth, returning the session cookie.
 */
export function testApp(
  db: Db,
  options: {
    fetchClubs?: AppDeps["fetchClubs"];
    stack?: AppDeps["stack"];
    registration?: Partial<AppDeps["registration"]>;
    evidence?: boolean;
  } = {},
) {
  const registration: AppDeps["registration"] = {
    enabled: false,
    emailDailyLimit: 250,
    secret: "test-secret-that-is-at-least-32-characters",
    limits: false,
    ...options.registration,
  };
  const mailer = memoryMailer();
  const push = memoryPush();
  const storage = createMemoryStorage();
  const evidence = options.evidence
    ? createEvidenceStore(storage, parseMasterKeys(TEST_EVIDENCE_KEYS))
    : null;
  const auth = createAuth(db, {
    appUrl: TEST_APP_URL,
    secret: "test-secret-that-is-at-least-32-characters",
    mailer,
    disableRateLimit: true,
    registration,
  });
  const app = createApp({
    db,
    auth,
    mailer,
    push,
    stack: options.stack ?? "dev",
    appUrl: TEST_APP_URL,
    storage,
    evidence,
    registration,
    fetchClubs: options.fetchClubs,
  });

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

  /**
   * Creates a user holding `roles` (and optionally being `personId`), signed in. A scoped grant
   * (coach or team manager of a team or class) is the role plus a staff assignment of the
   * user's person, as in production (ADR 0027); the person is created when none is given.
   */
  const userWith = async (roles: RoleGrant[], options: { personId?: string } = {}) => {
    const email = `user${++counter}@example.test`;
    const user = await createUserWithPassword(db, {
      email,
      name: `Utilizador ${counter}`,
      password: TEST_PASSWORD,
      personId: options.personId,
    });
    const distinct = [...new Set(roles.map((r) => r.role))];
    if (distinct.length > 0) {
      await db.insert(roleAssignments).values(distinct.map((role) => ({ userId: user.id, role })));
    }
    const scoped = roles.filter((r) => r.teamId || r.classId);
    if (scoped.length > 0) {
      let personId = options.personId;
      if (!personId) {
        personId = (await makePerson(db, { fullName: `Pessoa ${counter}` })).id;
        await setOwnerPerson(db, user.id, personId);
      }
      for (const grant of scoped) {
        const [place] = grant.teamId
          ? await db.select().from(teams).where(eq(teams.id, grant.teamId))
          : await db
              .select()
              .from(classes)
              .where(eq(classes.id, grant.classId ?? ""));
        if (!place) throw new Error("unknown team or class");
        await db.insert(staffAssignments).values({
          personId,
          seasonId: place.seasonId,
          organisationId: place.organisationId,
          function: grant.role === "coach" ? "head_coach" : "team_manager",
          teamId: grant.teamId,
          classId: grant.classId,
        });
      }
    }
    return { user, cookie: await signIn(email) };
  };

  return { app, auth, mailer, push, storage, evidence, request, signIn, userWith };
}

/** `name=value` pairs of a response's Set-Cookie headers, joined for a Cookie header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Shorthand for a club-wide role grant. */
export const clubWide = (role: RoleGrant["role"]): RoleGrant => ({
  role,
  teamId: null,
  classId: null,
});
