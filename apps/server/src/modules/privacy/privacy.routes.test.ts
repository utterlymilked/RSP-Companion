import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { athletes } from "../athletes/schema.js";
import { auditLog } from "../audit/schema.js";
import { users } from "../auth/schema.js";
import { documents } from "../documents/schema.js";
import { charges } from "../fees/schema.js";
import { healthNotes } from "../health/schema.js";
import { notifications } from "../notifications/schema.js";
import { guardianships, persons } from "../people/schema.js";
import { prospects } from "../scouting/schema.js";
import { insertProspect } from "../scouting/service.js";
import { teamMembers } from "../teams/schema.js";
import { runRetention } from "./retention.js";
import { consents, privacyRequests } from "./schema.js";

const json = async <T>(res: Response) => (await res.json()) as T;
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });

type ConsentStatus = {
  minor: boolean;
  consents: { kind: string; given: boolean; grantedByPersonId: string | null }[];
};
const given = (s: ConsentStatus, kind: string) => s.consents.find((c) => c.kind === kind)?.given;

/** A team with a minor athlete and their guardian (who has a login). */
async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const child = await makePerson(db, { birthDate: "2014-03-01" });
  const parent = await makePerson(db, { birthDate: "1984-05-05", email: "pai@example.test" });
  await db
    .insert(guardianships)
    .values({ guardianId: parent.id, childId: child.id, relationship: "father", isPrimary: true });
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, personId: child.id, joinedOn: "2026-09-01" });
  const t = testApp(db);
  const guardian = await t.userWith([clubWide("guardian")], { personId: parent.id });
  return { t, team, otherTeam, child, parent, guardian };
}

describeDb("privacy API: consents", () => {
  it("lets a guardian give and withdraw a ward's image rights, and audits both", () =>
    withRollback(async (db) => {
      const { t, child, parent, guardian } = await setup(db);
      const path = `/api/privacy/people/${child.id}/consents`;
      const body = { kind: "image_rights", grantedByPersonId: parent.id, grantedOn: "2026-10-01" };

      expect((await t.request(path, { json: body })).status).toBe(401);
      const res = await t.request(path, { json: body, cookie: guardian.cookie });
      expect(res.status).toBe(201);
      const status = await json<ConsentStatus>(res);
      expect(status.minor).toBe(true);
      expect(given(status, "image_rights")).toBe(true);
      expect(given(status, "transport")).toBe(false);

      // A second active consent of the same kind is refused.
      expect((await t.request(path, { json: body, cookie: guardian.cookie })).status).toBe(409);

      const revoked = await t.request(`${path}/image_rights/revoke`, {
        method: "POST",
        cookie: guardian.cookie,
      });
      expect(revoked.status).toBe(200);
      expect(given(await json<ConsentStatus>(revoked), "image_rights")).toBe(false);
      expect(
        (
          await t.request(`${path}/image_rights/revoke`, {
            method: "POST",
            cookie: guardian.cookie,
          })
        ).status,
      ).toBe(404);

      const audits = await db.select().from(auditLog).where(eq(auditLog.action, "consent.changed"));
      expect(audits.map((a) => a.details?.change).sort()).toEqual(["granted", "revoked"]);
      expect(audits.every((a) => a.subjectPersonId === child.id)).toBe(true);
    }));

  it("checks who gives consent: a guardian for a minor, the person for an adult", () =>
    withRollback(async (db) => {
      const { t, child, parent } = await setup(db);
      const office = await t.userWith([clubWide("staff")]);
      const stranger = await makePerson(db);
      const grant = (personId: string, grantedByPersonId: string) =>
        t.request(`/api/privacy/people/${personId}/consents`, {
          json: { kind: "transport", grantedByPersonId, grantedOn: "2026-10-01" },
          cookie: office.cookie,
        });

      const notGuardian = await grant(child.id, stranger.id);
      expect(notGuardian.status).toBe(409);
      expect((await json<{ error: { code: string } }>(notGuardian)).error.code).toBe(
        "not_a_guardian",
      );
      const wrongGrantor = await grant(parent.id, child.id);
      expect((await json<{ error: { code: string } }>(wrongGrantor)).error.code).toBe(
        "invalid_grantor",
      );
      // The office records a paper form signed by the guardian.
      expect((await grant(child.id, parent.id)).status).toBe(201);
      expect((await grant(parent.id, parent.id)).status).toBe(201);
    }));

  it("refuses consent in someone else's name and readers without a relation or scope", () =>
    withRollback(async (db) => {
      const { t, team, otherTeam, child, parent } = await setup(db);
      const otherParent = await t.userWith([clubWide("guardian")], {
        personId: (await makePerson(db)).id,
      });
      const path = `/api/privacy/people/${child.id}/consents`;
      const body = { kind: "image_rights", grantedByPersonId: parent.id, grantedOn: "2026-10-01" };
      expect((await t.request(path, { json: body, cookie: otherParent.cookie })).status).toBe(403);
      expect((await t.request(path, { cookie: otherParent.cookie })).status).toBe(403);

      const coach = await t.userWith([coachOf(team.id)]);
      const otherCoach = await t.userWith([coachOf(otherTeam.id)]);
      expect((await t.request(path, { cookie: coach.cookie })).status).toBe(200);
      expect((await t.request(path, { cookie: otherCoach.cookie })).status).toBe(403);
      // Coaches read consents but cannot record them.
      expect((await t.request(path, { json: body, cookie: coach.cookie })).status).toBe(403);

      const roster = await t.request(`/api/privacy/teams/${team.id}/consents`, {
        cookie: coach.cookie,
      });
      expect(roster.status).toBe(200);
      const { people } = await json<{ people: { personId: string; given: string[] }[] }>(roster);
      expect(people).toEqual([expect.objectContaining({ personId: child.id, given: [] })]);
      expect(
        (await t.request(`/api/privacy/teams/${team.id}/consents`, { cookie: otherCoach.cookie }))
          .status,
      ).toBe(403);
    }));
});

describeDb("privacy API: export, requests and erasure", () => {
  it("exports a ward's data to the guardian and the office, without health records", () =>
    withRollback(async (db) => {
      const { t, child, parent, guardian } = await setup(db);
      await db.insert(healthNotes).values({
        personId: child.id,
        discipline: "medical",
        recordedOn: "2026-10-01",
        summary: "x",
      });
      const path = `/api/privacy/people/${child.id}/export`;

      expect((await t.request(path)).status).toBe(401);
      const res = await t.request(path, { cookie: guardian.cookie });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain("attachment");
      const data = await json<{
        person: { id: string };
        guardians: { personId: string }[];
        teams: unknown[];
        excluded: string[];
      }>(res);
      expect(data.person.id).toBe(child.id);
      expect(data.guardians.map((g) => g.personId)).toEqual([parent.id]);
      expect(data.teams).toHaveLength(1);
      expect(data.excluded).toEqual(["health_records"]);
      expect(JSON.stringify(data)).not.toContain("health_notes");

      const coach = await t.userWith([clubWide("staff")]);
      expect((await t.request(path, { cookie: coach.cookie })).status).toBe(403);
      const admin = await t.userWith([clubWide("admin")]);
      expect((await t.request(path, { cookie: admin.cookie })).status).toBe(200);

      const audits = await db.select().from(auditLog).where(eq(auditLog.action, "privacy.export"));
      expect(audits.map((a) => a.details?.via).sort()).toEqual(["office", "self_or_guardian"]);
    }));

  it("takes requests from the person or guardian and lets the office resolve them", () =>
    withRollback(async (db) => {
      const { t, child, guardian } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const stranger = await t.userWith([clubWide("member")]);
      const body = { personId: child.id, kind: "rectification", message: "Data errada" };

      expect((await t.request("/api/privacy/requests", { json: body })).status).toBe(401);
      expect(
        (await t.request("/api/privacy/requests", { json: body, cookie: stranger.cookie })).status,
      ).toBe(403);
      const created = await t.request("/api/privacy/requests", {
        json: body,
        cookie: guardian.cookie,
      });
      expect(created.status).toBe(201);
      const { request } = await json<{ request: { id: string } }>(created);

      type List = { requests: { id: string; status: string }[] };
      const mine = await json<List>(
        await t.request("/api/privacy/requests", { cookie: guardian.cookie }),
      );
      expect(mine.requests.map((r) => r.id)).toEqual([request.id]);
      expect(
        (await json<List>(await t.request("/api/privacy/requests", { cookie: stranger.cookie })))
          .requests,
      ).toEqual([]);

      const resolve = (cookie: string) =>
        t.request(`/api/privacy/requests/${request.id}/resolve`, {
          json: { status: "done", note: "Corrigido" },
          cookie,
        });
      expect((await resolve(guardian.cookie)).status).toBe(403);
      expect((await resolve(admin.cookie)).status).toBe(200);
      expect((await resolve(admin.cookie)).status).toBe(409);
      const open = await json<List>(
        await t.request("/api/privacy/requests?status=open", { cookie: admin.cookie }),
      );
      expect(open.requests).toEqual([]);
    }));

  it("erases a person with their files, records and login, and closes the request", () =>
    withRollback(async (db) => {
      const { t, child, parent, guardian } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const staff = await t.userWith([clubWide("staff")]);
      await t.storage.put("doc-key", new Uint8Array([1, 2, 3]), "application/pdf");
      await db.insert(documents).values({
        personId: parent.id,
        kind: "id_document",
        storageKey: "doc-key",
        fileName: "cc.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      });
      await db.insert(consents).values({
        personId: child.id,
        kind: "image_rights",
        grantedByPersonId: parent.id,
        grantedOn: "2026-10-01",
      });
      const [request] = await db
        .insert(privacyRequests)
        .values({ personId: parent.id, kind: "erasure" })
        .returning();
      const erase = (cookie?: string) =>
        t.request(`/api/privacy/people/${parent.id}/erase`, {
          json: { requestId: request?.id },
          cookie,
        });

      expect((await erase()).status).toBe(401);
      expect((await erase(staff.cookie)).status).toBe(403);
      const res = await erase(admin.cookie);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ erased: { files: 1, logins: 1 } });

      expect(t.storage.files.has("doc-key")).toBe(false);
      expect(await db.select().from(persons).where(eq(persons.id, parent.id))).toEqual([]);
      expect(await db.select().from(users).where(eq(users.id, guardian.user.id))).toEqual([]);
      expect(await db.select().from(guardianships)).toEqual([]);
      // The child's consent stays, without the name of who gave it.
      const [consent] = await db.select().from(consents);
      expect(consent?.grantedByPersonId).toBeNull();
      const [closed] = await db.select().from(privacyRequests);
      expect(closed).toMatchObject({ status: "done", personId: null });
      const erasedEntries = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "person.erased"));
      expect(erasedEntries).toHaveLength(1);
      expect(erasedEntries[0]?.subjectPersonId).toBeNull();
      expect((await erase(admin.cookie)).status).toBe(404);
    }));

  it("refuses erasure while fees are on record", () =>
    withRollback(async (db) => {
      const { t, child } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      await db.insert(charges).values({
        personId: child.id,
        kind: "monthly",
        description: "Mensalidade",
        amountCents: 2500,
        dueDate: "2026-10-08",
      });
      const res = await t.request(`/api/privacy/people/${child.id}/erase`, {
        json: {},
        cookie: admin.cookie,
      });
      expect(res.status).toBe(409);
      expect(await json(res)).toEqual({ error: { code: "erasure_blocked", issues: ["fees"] } });
      expect(await db.select().from(persons).where(eq(persons.id, child.id))).toHaveLength(1);
    }));
});

describeDb("privacy API: account deletion", () => {
  it("deletes the user's own login and leaves an erasure request for the office", () =>
    withRollback(async (db) => {
      const { t, parent, guardian } = await setup(db);
      expect((await t.request("/api/privacy/account/delete", { json: {} })).status).toBe(401);
      const res = await t.request("/api/privacy/account/delete", {
        json: { eraseData: true },
        cookie: guardian.cookie,
      });
      expect(res.status).toBe(200);
      expect(await db.select().from(users).where(eq(users.id, guardian.user.id))).toEqual([]);
      expect((await t.request("/api/me", { cookie: guardian.cookie })).status).toBe(401);
      // The person record is the club's: it stays until the office handles the request.
      expect(await db.select().from(persons).where(eq(persons.id, parent.id))).toHaveLength(1);
      const [request] = await db.select().from(privacyRequests);
      expect(request).toMatchObject({ personId: parent.id, kind: "erasure", status: "open" });
    }));

  it("keeps the last admin", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const admin = await t.userWith([clubWide("admin")]);
      const res = await t.request("/api/privacy/account/delete", {
        json: {},
        cookie: admin.cookie,
      });
      expect(res.status).toBe(409);
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe("last_admin");
    }));
});

describeDb("retention job and audit viewer", () => {
  it("purges expired prospects, old audit entries and old notifications", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const { user } = await t.userWith([]);
      const now = new Date("2026-10-16T10:00:00Z");
      for (const [fullName, retainUntil] of [
        ["Prospeto A", "2026-10-01"],
        ["Prospeto B", "2027-10-01"],
      ] as const) {
        await insertProspect(db, {
          facts: { fullName },
          values: { retainUntil },
          source: "scout",
          createdBy: null,
        });
      }
      await db.insert(auditLog).values([
        { action: "role.granted", occurredAt: new Date("2023-01-01T00:00:00Z") },
        { action: "role.granted", occurredAt: new Date("2026-01-01T00:00:00Z") },
      ]);
      await db.insert(notifications).values([
        {
          userId: user.id,
          kind: "announcement",
          title: "Velho",
          createdAt: new Date("2025-01-01"),
        },
        { userId: user.id, kind: "announcement", title: "Novo", createdAt: new Date("2026-10-01") },
      ]);

      const purged = await runRetention(db, now);
      expect(purged).toMatchObject({ prospects: 1, auditEntries: 1, notifications: 1 });
      expect(await db.select().from(prospects)).toHaveLength(1);
      expect((await db.select().from(athletes)).map((a) => a.displayName)).toEqual(["Prospeto B"]);
      expect((await db.select().from(notifications)).map((n) => n.title)).toEqual(["Novo"]);
      const actions = (await db.select().from(auditLog)).map((a) => a.action).sort();
      expect(actions).toEqual(["retention.purged", "role.granted"]);

      // A second run finds nothing more and writes no entry.
      expect(Object.values(await runRetention(db, now)).every((n) => n === 0)).toBe(true);
    }));

  it("lists audit entries with names, filtered by action, to admins only", () =>
    withRollback(async (db) => {
      const { t, child, guardian } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      await t.request(`/api/privacy/people/${child.id}/export`, { cookie: guardian.cookie });
      expect((await t.request("/api/audit-log", { cookie: guardian.cookie })).status).toBe(403);
      const res = await t.request("/api/audit-log?action=privacy.export", {
        cookie: admin.cookie,
      });
      expect(res.status).toBe(200);
      const { entries } = await json<{
        entries: { action: string; actorName: string; subjectPersonName: string }[];
      }>(res);
      expect(entries).toEqual([
        expect.objectContaining({
          action: "privacy.export",
          actorName: guardian.user.name,
          subjectPersonName: child.fullName,
        }),
      ]);
    }));
});
