import type { MeResponse, PendingInvitation, UserDetail } from "@rsc/shared";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { clubWide, cookieFrom, TEST_APP_URL, TEST_PASSWORD, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { teams } from "../teams/schema.js";
import { invitations, roleAssignments, sessions, users } from "./schema.js";

const urlIn = (text: string | undefined) => {
  const match = text?.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in email");
  return new URL(match[0]);
};

describeDb("sign-in, sign-out and /api/me", () => {
  it("signs in with email and password and returns the user's roles", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const person = await makePerson(db);
      const { user, cookie } = await t.userWith([clubWide("staff")], { personId: person.id });

      const res = await t.request("/api/me", { cookie });
      expect(res.status).toBe(200);
      const me = (await res.json()) as MeResponse;
      expect(me.user).toEqual({ id: user.id, email: user.email, name: user.name });
      expect(me.personId).toBe(person.id);
      expect(me.roles).toEqual([clubWide("staff")]);
      expect(me.permissions).toContain("people.write");
      expect(me.permissions).not.toContain("users.manage");
    }));

  it("rejects a wrong password and requests without a session", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const res = await t.request("/api/auth/sign-in/email", {
        json: { email: user.email, password: "wrong-password-123" },
      });
      expect(res.status).toBe(401);
      const me = await t.request("/api/me");
      expect(me.status).toBe(401);
      expect(await me.json()).toMatchObject({ error: { code: "unauthenticated" } });
    }));

  it("signs out: the session cookie stops working", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { cookie } = await t.userWith([]);
      const out = await t.request("/api/auth/sign-out", { method: "POST", json: {}, cookie });
      expect(out.status).toBe(200);
      expect((await t.request("/api/me", { cookie })).status).toBe(401);
    }));

  it("refuses form posts from another site", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { cookie } = await t.userWith([clubWide("admin")]);
      const res = await t.request("/api/invitations", {
        method: "POST",
        cookie,
        headers: {
          origin: "https://evil.example",
          "content-type": "application/x-www-form-urlencoded",
        },
      });
      if (res.status === 200) {
        const link = urlIn(t.mailer.sent.at(-1)?.text);
        const verify = await t.request(`${link.pathname}${link.search}`);
        console.log("DEBUG", verify.status, verify.headers.get("location"));
      }
      expect(res.status).toBe(403);
    }));

  it("has no public sign-up", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const res = await t.request("/api/auth/sign-up/email", {
        json: { email: "new@example.test", password: TEST_PASSWORD, name: "Novo" },
      });
      expect(res.status).toBe(400);
    }));
});

describeDb("magic link", () => {
  it("emails a one-time link that signs an existing user in", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const res = await t.request("/api/auth/sign-in/magic-link", {
        json: { email: user.email, callbackURL: TEST_APP_URL },
      });
      expect(res.status).toBe(200);
      const link = urlIn(t.mailer.sent.at(-1)?.text);
      expect(t.mailer.sent.at(-1)?.to).toBe(user.email);

      const verify = await t.request(`${link.pathname}${link.search}`);
      expect(verify.status).toBe(302);
      const cookie = cookieFrom(verify);
      expect((await t.request("/api/me", { cookie })).status).toBe(200);

      // The token is consumed on first use.
      const again = await t.request(`${link.pathname}${link.search}`);
      expect(cookieFrom(again)).not.toContain("session_token=");
    }));

  it("does not create accounts for unknown emails", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      await t.request("/api/auth/sign-in/magic-link", {
        json: { email: "stranger@example.test", callbackURL: TEST_APP_URL },
      });
      const link = urlIn(t.mailer.sent.at(-1)?.text);
      const verify = await t.request(`${link.pathname}${link.search}`);
      expect(cookieFrom(verify)).not.toContain("session_token=");
    }));
});

describeDb("password reset", () => {
  it("emails a reset link; the new password works and old sessions end", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user, cookie } = await t.userWith([]);
      const res = await t.request("/api/auth/request-password-reset", {
        json: { email: user.email, redirectTo: `${TEST_APP_URL}/reset-password` },
      });
      expect(res.status).toBe(200);
      const link = urlIn(t.mailer.sent.at(-1)?.text);
      const token = link.pathname.split("/").at(-1);

      const reset = await t.request("/api/auth/reset-password", {
        json: { token, newPassword: "a-brand-new-password" },
      });
      expect(reset.status).toBe(200);
      expect((await t.request("/api/me", { cookie })).status).toBe(401);
      await expect(t.signIn(user.email)).rejects.toThrow(/sign-in failed/);
      expect(await t.signIn(user.email, "a-brand-new-password")).toContain("session_token=");
    }));

  it("rejects a password shorter than the minimum", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      await t.request("/api/auth/request-password-reset", {
        json: { email: user.email, redirectTo: TEST_APP_URL },
      });
      const token = urlIn(t.mailer.sent.at(-1)?.text).pathname.split("/").at(-1);
      const reset = await t.request("/api/auth/reset-password", {
        json: { token, newPassword: "short" },
      });
      expect(reset.status).toBe(400);
    }));
});

describeDb("invitations", () => {
  it("lets an admin invite; accepting creates the user with roles and person link", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const person = await makePerson(db);
      const admin = await t.userWith([clubWide("admin")]);

      const res = await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: {
          email: "Treinador@Example.test",
          personId: person.id,
          roles: [{ role: "coach", teamId: team.id }],
        },
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ email: "treinador@example.test" });
      const mail = t.mailer.sent.at(-1);
      expect(mail?.to).toBe("treinador@example.test");
      const link = urlIn(mail?.text);
      expect(link.origin + link.pathname).toBe(`${TEST_APP_URL}/invite`);
      const token = link.searchParams.get("token");

      // Only the hash is stored.
      const [stored] = await db.select().from(invitations);
      expect(stored?.tokenHash).not.toBe(token);

      const accept = await t.request("/api/invitations/accept", {
        json: { token, name: "Rui Treinador", password: TEST_PASSWORD },
      });
      expect(accept.status).toBe(201);

      const cookie = await t.signIn("treinador@example.test");
      const me = (await (await t.request("/api/me", { cookie })).json()) as MeResponse;
      expect(me.personId).toBe(person.id);
      expect(me.roles).toEqual([{ role: "coach", teamId: team.id, classId: null }]);

      // A token creates an account once (a retry with the same password is covered below).
      const again = await t.request("/api/invitations/accept", {
        json: { token, name: "Outra", password: "another-long-password" },
      });
      expect(again.status).toBe(400);
      expect(await again.json()).toMatchObject({ error: { code: "invitation_invalid" } });
    }));

  it("refuses non-admins (403) and anonymous callers (401)", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const body = { email: "x@example.test", roles: [{ role: "member" }] };
      for (const role of ["staff", "treasurer", "doctor"] as const) {
        const { cookie } = await t.userWith([clubWide(role)]);
        expect((await t.request("/api/invitations", { cookie, json: body })).status).toBe(403);
      }
      expect((await t.request("/api/invitations", { json: body })).status).toBe(401);
      expect(t.mailer.sent).toHaveLength(0);
    }));

  it("validates input and refuses emails that already have a login", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const scopedWithoutTeam = await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: { email: "x@example.test", roles: [{ role: "coach" }] },
      });
      expect(scopedWithoutTeam.status).toBe(400);
      expect(await scopedWithoutTeam.json()).toMatchObject({ error: { code: "invalid_request" } });

      const existing = await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: { email: admin.user.email, roles: [{ role: "member" }] },
      });
      expect(existing.status).toBe(409);
      expect(await existing.json()).toMatchObject({ error: { code: "user_exists" } });
    }));

  it("rejects expired invitations", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: { email: "late@example.test", roles: [{ role: "member" }] },
      });
      const token = urlIn(t.mailer.sent.at(-1)?.text).searchParams.get("token");
      await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
      const res = await t.request("/api/invitations/accept", {
        json: { token, name: "Tarde", password: TEST_PASSWORD },
      });
      expect(res.status).toBe(400);
    }));
});

describeDb("invitation acceptance", () => {
  const sendInvite = async (
    t: ReturnType<typeof testApp>,
    cookie: string,
    roles: unknown[] = [{ role: "member" }],
  ) => {
    const res = await t.request("/api/invitations", {
      cookie,
      json: { email: "convidado@example.test", roles },
    });
    expect(res.status).toBe(201);
    return urlIn(t.mailer.sent.at(-1)?.text).searchParams.get("token");
  };
  const accept = (t: ReturnType<typeof testApp>, token: string | null, password = TEST_PASSWORD) =>
    t.request("/api/invitations/accept", { json: { token, name: "Convidado", password } });

  it("answers a repeated submit with the same password with the same account", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const token = await sendInvite(t, admin.cookie);
      const first = await accept(t, token);
      const second = await accept(t, token);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(await second.json()).toEqual(await first.json());
      const made = await db.select().from(users).where(eq(users.email, "convidado@example.test"));
      expect(made).toHaveLength(1);
      expect(
        await db
          .select()
          .from(roleAssignments)
          .where(eq(roleAssignments.userId, made[0]?.id ?? "")),
      ).toHaveLength(1);
    }));

  it("refuses a retry with another password, or after the retry window", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const token = await sendInvite(t, admin.cookie);
      expect((await accept(t, token)).status).toBe(201);
      const other = await accept(t, token, "another-long-password");
      expect(other.status).toBe(400);
      expect(await other.json()).toMatchObject({ error: { code: "invitation_invalid" } });

      await db.update(invitations).set({ acceptedAt: new Date(Date.now() - 25 * 3600_000) });
      expect((await accept(t, token)).status).toBe(400);
    }));

  it("creates nothing when a step fails: no user, no used invitation", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const token = await sendInvite(t, admin.cookie, [{ role: "coach", teamId: team.id }]);
      // The team is deleted after the invitation went out: granting its role fails mid-way.
      await db.delete(teams).where(eq(teams.id, team.id));

      const res = await accept(t, token);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "invitation_invalid" } });
      expect(
        await db.select().from(users).where(eq(users.email, "convidado@example.test")),
      ).toEqual([]);
      const [invitation] = await db.select().from(invitations);
      expect(invitation?.acceptedAt).toBeNull();
      expect(invitation?.acceptedUserId).toBeNull();
    }));

  it("lets the same email be invited again after the first invitation was used", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const token = await sendInvite(t, admin.cookie);
      expect((await accept(t, token)).status).toBe(201);
      // The account exists now: a new invitation says so instead of creating a dead one.
      const again = await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: { email: "convidado@example.test", roles: [{ role: "member" }] },
      });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ error: { code: "user_exists" } });
      // Without an account (it was removed), a used invitation does not block a new one.
      await db.delete(users).where(eq(users.email, "convidado@example.test"));
      const fresh = await t.request("/api/invitations", {
        cookie: admin.cookie,
        json: { email: "convidado@example.test", roles: [{ role: "member" }] },
      });
      expect(fresh.status).toBe(201);
    }));
});

describeDb("user administration", () => {
  it("lists users for admins only", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request("/api/users", { cookie: admin.cookie });
      expect(res.status).toBe(200);
      const { users } = (await res.json()) as { users: { id: string; roles: unknown[] }[] };
      expect(users.map((u) => u.id)).toEqual(
        expect.arrayContaining([admin.user.id, staff.user.id]),
      );
      expect((await t.request("/api/users", { cookie: staff.cookie })).status).toBe(403);
      expect((await t.request("/api/users")).status).toBe(401);
    }));

  it("grants and revokes roles, takes effect at once, and audits both", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const other = await t.userWith([]);

      const grant = await t.request(`/api/users/${other.user.id}/roles`, {
        cookie: admin.cookie,
        json: { role: "treasurer" },
      });
      expect(grant.status).toBe(201);
      const { id } = (await grant.json()) as { id: string };
      const me = (await (
        await t.request("/api/me", { cookie: other.cookie })
      ).json()) as MeResponse;
      expect(me.roles).toEqual([clubWide("treasurer")]);

      const duplicate = await t.request(`/api/users/${other.user.id}/roles`, {
        cookie: admin.cookie,
        json: { role: "treasurer" },
      });
      expect(duplicate.status).toBe(409);

      const revoke = await t.request(`/api/users/${other.user.id}/roles/${id}`, {
        method: "DELETE",
        cookie: admin.cookie,
      });
      expect(revoke.status).toBe(204);
      const after = (await (
        await t.request("/api/me", { cookie: other.cookie })
      ).json()) as MeResponse;
      expect(after.roles).toEqual([]);

      const entries = await db
        .select({ action: auditLog.action, actor: auditLog.actorUserId })
        .from(auditLog)
        .where(eq(auditLog.subjectUserId, other.user.id));
      expect(entries).toEqual([
        { action: "role.granted", actor: admin.user.id },
        { action: "role.revoked", actor: admin.user.id },
      ]);
    }));

  it("refuses role changes from non-admins", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request(`/api/users/${staff.user.id}/roles`, {
        cookie: staff.cookie,
        json: { role: "admin" },
      });
      expect(res.status).toBe(403);
    }));

  it("returns 404 for an unknown team and keeps the last admin", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const unknownTeam = await t.request(`/api/users/${admin.user.id}/roles`, {
        cookie: admin.cookie,
        json: { role: "coach", teamId: "6f1c7a52-8e57-4d1b-9a43-2f8e2a3b9c10" },
      });
      expect(unknownTeam.status).toBe(404);

      const me = (await (await t.request("/api/users", { cookie: admin.cookie })).json()) as {
        users: { id: string; roles: { id: string; role: string }[] }[];
      };
      const adminRole = me.users.find((u) => u.id === admin.user.id)?.roles[0];
      const res = await t.request(`/api/users/${admin.user.id}/roles/${adminRole?.id}`, {
        method: "DELETE",
        cookie: admin.cookie,
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "last_admin" } });
    }));

  it("links a user to a person, at most one user per person", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const a = await t.userWith([]);
      const b = await t.userWith([]);
      const person = await makePerson(db);
      const link = (userId: string) =>
        t.request(`/api/users/${userId}/person`, {
          method: "PUT",
          cookie: admin.cookie,
          json: { personId: person.id },
        });
      expect((await link(a.user.id)).status).toBe(204);
      const taken = await link(b.user.id);
      expect(taken.status).toBe(409);
      expect(await taken.json()).toMatchObject({ error: { code: "person_has_user" } });
      const me = (await (await t.request("/api/me", { cookie: a.cookie })).json()) as MeResponse;
      expect(me.personId).toBe(person.id);

      const unlink = await t.request(`/api/users/${a.user.id}/person`, {
        method: "PUT",
        cookie: admin.cookie,
        json: { personId: null },
      });
      expect(unlink.status).toBe(204);
      const after = (await (await t.request("/api/me", { cookie: a.cookie })).json()) as MeResponse;
      expect(after.personId).toBeNull();
    }));

  it("shows one user with team names, person and last activity, to admins only", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const season = await makeSeason(db);
      const org = await makeOrganisation(db);
      const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
      const person = await makePerson(db, { fullName: "Rui Treinador" });
      const admin = await t.userWith([clubWide("admin")]);
      const coach = await t.userWith([{ role: "coach", teamId: team.id, classId: null }], {
        personId: person.id,
      });

      const res = await t.request(`/api/users/${coach.user.id}`, { cookie: admin.cookie });
      expect(res.status).toBe(200);
      const { user } = (await res.json()) as { user: UserDetail };
      expect(user).toMatchObject({
        id: coach.user.id,
        personId: person.id,
        personName: "Rui Treinador",
        deactivatedAt: null,
        roles: [{ role: "coach", teamId: team.id, classId: null, scopeName: team.name }],
      });
      expect(user.lastSeenAt).not.toBeNull();

      const unknown = "6f1c7a52-8e57-4d1b-9a43-2f8e2a3b9c10";
      expect((await t.request(`/api/users/${unknown}`, { cookie: admin.cookie })).status).toBe(404);
      const staff = await t.userWith([clubWide("staff")]);
      expect(
        (await t.request(`/api/users/${coach.user.id}`, { cookie: staff.cookie })).status,
      ).toBe(403);
      expect((await t.request(`/api/users/${coach.user.id}`)).status).toBe(401);
    }));

  it("deactivates a user: sessions end, sign-in is refused, roles come back on reactivation", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const other = await t.userWith([clubWide("treasurer")]);
      const setActive = (active: boolean, userId = other.user.id, cookie = admin.cookie) =>
        t.request(`/api/users/${userId}/active`, { method: "PUT", cookie, json: { active } });

      expect((await setActive(false)).status).toBe(204);
      expect((await t.request("/api/fees/charges", { cookie: other.cookie })).status).toBe(401);
      const signIn = await t.request("/api/auth/sign-in/email", {
        json: { email: other.user.email, password: TEST_PASSWORD },
      });
      expect(signIn.status).toBe(403);
      expect(await signIn.json()).toMatchObject({ code: "ACCOUNT_DEACTIVATED" });
      expect(await db.select().from(sessions).where(eq(sessions.userId, other.user.id))).toEqual(
        [],
      );

      expect((await setActive(true)).status).toBe(204);
      const cookie = await t.signIn(other.user.email);
      const me = (await (await t.request("/api/me", { cookie })).json()) as MeResponse;
      expect(me.roles).toEqual([clubWide("treasurer")]);

      const entries = await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.subjectUserId, other.user.id));
      expect(entries.map((e) => e.action)).toEqual(["user.deactivated", "user.reactivated"]);
    }));

  it("refuses deactivating oneself, non-admins, and losing the last active admin", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const second = await t.userWith([clubWide("admin")]);
      const staff = await t.userWith([clubWide("staff")]);
      const setActive = (userId: string, cookie: string, active = false) =>
        t.request(`/api/users/${userId}/active`, { method: "PUT", cookie, json: { active } });

      const self = await setActive(admin.user.id, admin.cookie);
      expect(self.status).toBe(409);
      expect(await self.json()).toMatchObject({ error: { code: "self_deactivation" } });
      expect((await setActive(admin.user.id, staff.cookie)).status).toBe(403);
      expect(
        (
          await t.request(`/api/users/${admin.user.id}/active`, {
            method: "PUT",
            json: { active: false },
          })
        ).status,
      ).toBe(401);

      // A deactivated admin does not count: the remaining active admin keeps the role.
      expect((await setActive(second.user.id, admin.cookie)).status).toBe(204);
      const { user } = (await (
        await t.request(`/api/users/${admin.user.id}`, { cookie: admin.cookie })
      ).json()) as { user: UserDetail };
      const revoke = await t.request(`/api/users/${admin.user.id}/roles/${user.roles[0]?.id}`, {
        method: "DELETE",
        cookie: admin.cookie,
      });
      expect(revoke.status).toBe(409);
      expect(await revoke.json()).toMatchObject({ error: { code: "last_admin" } });
    }));
});

describeDb("pending invitations", () => {
  const invite = async (t: ReturnType<typeof testApp>, cookie: string, email: string) => {
    const res = await t.request("/api/invitations", {
      cookie,
      json: { email, roles: [{ role: "member" }] },
    });
    const { id } = (await res.json()) as { id: string };
    return { id, token: urlIn(t.mailer.sent.at(-1)?.text).searchParams.get("token") };
  };
  const list = async (t: ReturnType<typeof testApp>, cookie: string) =>
    (
      (await (await t.request("/api/invitations", { cookie })).json()) as {
        invitations: PendingInvitation[];
      }
    ).invitations;

  it("lists pending invitations, flags expired ones and drops accepted ones", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const a = await invite(t, admin.cookie, "a@example.test");
      const b = await invite(t, admin.cookie, "b@example.test");
      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invitations.id, b.id));
      expect(await list(t, admin.cookie)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: a.id,
            email: "a@example.test",
            expired: false,
            invitedByName: admin.user.name,
            roles: [{ role: "member", teamId: null, classId: null }],
          }),
          expect.objectContaining({ id: b.id, expired: true }),
        ]),
      );
      await t.request("/api/invitations/accept", {
        json: { token: a.token, name: "A", password: TEST_PASSWORD },
      });
      expect((await list(t, admin.cookie)).map((i) => i.id)).toEqual([b.id]);
    }));

  it("resends with a new link and fresh expiry; the old link stops working", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const first = await invite(t, admin.cookie, "late@example.test");
      await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });

      const res = await t.request(`/api/invitations/${first.id}/resend`, {
        method: "POST",
        cookie: admin.cookie,
      });
      expect(res.status).toBe(200);
      const token = urlIn(t.mailer.sent.at(-1)?.text).searchParams.get("token");
      expect(token).not.toBe(first.token);

      const old = await t.request("/api/invitations/accept", {
        json: { token: first.token, name: "Tarde", password: TEST_PASSWORD },
      });
      expect(old.status).toBe(400);
      const accept = await t.request("/api/invitations/accept", {
        json: { token, name: "Tarde", password: TEST_PASSWORD },
      });
      expect(accept.status).toBe(201);

      // Accepted: nothing left to resend or revoke.
      const again = await t.request(`/api/invitations/${first.id}/resend`, {
        method: "POST",
        cookie: admin.cookie,
      });
      expect(again.status).toBe(404);
    }));

  it("revokes a pending invitation and audits it", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const { id, token } = await invite(t, admin.cookie, "nope@example.test");
      const res = await t.request(`/api/invitations/${id}`, {
        method: "DELETE",
        cookie: admin.cookie,
      });
      expect(res.status).toBe(204);
      const accept = await t.request("/api/invitations/accept", {
        json: { token, name: "Não", password: TEST_PASSWORD },
      });
      expect(accept.status).toBe(400);
      const [entry] = await db
        .select({ action: auditLog.action, details: auditLog.details })
        .from(auditLog)
        .where(eq(auditLog.action, "invitation.revoked"));
      expect(entry?.details).toEqual({ invitationId: id });
    }));

  it("refuses non-admins and anonymous callers", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const { id } = await invite(t, admin.cookie, "x@example.test");
      const staff = await t.userWith([clubWide("staff")]);
      for (const cookie of [staff.cookie, undefined]) {
        const expected = cookie ? 403 : 401;
        expect((await t.request("/api/invitations", { cookie })).status).toBe(expected);
        expect(
          (await t.request(`/api/invitations/${id}/resend`, { method: "POST", cookie })).status,
        ).toBe(expected);
        expect(
          (await t.request(`/api/invitations/${id}`, { method: "DELETE", cookie })).status,
        ).toBe(expected);
      }
    }));
});

describeDb("sessions", () => {
  it("stores sessions with UUID ids in our sessions table", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    }));
});

describeDb("native app (Expo)", () => {
  /** A request as the Expo client sends it: no Origin or browser cookies, `expo-origin` instead. */
  const nativeRequest = (
    t: ReturnType<typeof testApp>,
    path: string,
    init: { json?: unknown; cookie?: string } = {},
  ) =>
    t.app.request(path, {
      method: init.json === undefined ? "GET" : "POST",
      headers: {
        "expo-origin": "rsc://",
        ...(init.json === undefined ? {} : { "content-type": "application/json" }),
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });

  it("signs in from the app scheme and uses the session cookie as a header", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const res = await nativeRequest(t, "/api/auth/sign-in/email", {
        json: { email: user.email, password: TEST_PASSWORD },
      });
      expect(res.status).toBe(200);
      const cookie = cookieFrom(res);
      expect(cookie).toContain("session_token=");
      expect((await nativeRequest(t, "/api/me", { cookie })).status).toBe(200);
    }));

  it("never hands the session cookie to an untrusted scheme", () =>
    withRollback(async (db) => {
      // Better Auth skips its callbackURL origin check under NODE_ENV=test, so this covers the
      // expo plugin's own check: the cookie only travels to trusted origins.
      const t = testApp(db);
      const { user } = await t.userWith([]);
      await nativeRequest(t, "/api/auth/sign-in/magic-link", {
        json: { email: user.email, callbackURL: "evil:///" },
      });
      const link = urlIn(t.mailer.sent.at(-1)?.text);
      const verify = await t.request(`${link.pathname}${link.search}`);
      expect(verify.headers.get("location")).not.toContain("cookie=");
    }));

  it("hands the session to the app after a magic link opened in the browser", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const res = await nativeRequest(t, "/api/auth/sign-in/magic-link", {
        json: { email: user.email, callbackURL: "rsc:///" },
      });
      expect(res.status).toBe(200);
      const link = urlIn(t.mailer.sent.at(-1)?.text);

      const verify = await t.request(`${link.pathname}${link.search}`);
      expect(verify.status).toBe(302);
      const location = new URL(verify.headers.get("location") ?? "");
      expect(location.protocol).toBe("rsc:");
      expect(location.searchParams.get("cookie")).toContain("session_token=");
    }));

  it("sends password reset links back to the app", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const res = await nativeRequest(t, "/api/auth/request-password-reset", {
        json: { email: user.email, redirectTo: "rsc:///reset-password" },
      });
      expect(res.status).toBe(200);
      const link = urlIn(t.mailer.sent.at(-1)?.text);
      const open = await t.request(`${link.pathname}${link.search}`);
      expect(open.status).toBe(302);
      expect(open.headers.get("location")).toMatch(/^rsc:\/\/\/reset-password\?token=/);
    }));
});
