import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { documents } from "../documents/schema.js";
import { guardianships } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";
import { remindExpiringDocuments } from "./reminders.js";

const json = async <T>(res: Response) => (await res.json()) as T;
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const TOKEN = "ExponentPushToken[abc123]";

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const t = testApp(db);
  const athlete = await makePerson(db);
  const guardian = await makePerson(db);
  const outsider = await makePerson(db);
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, personId: athlete.id, joinedOn: "2026-09-01" });
  await db
    .insert(guardianships)
    .values({ guardianId: guardian.id, childId: athlete.id, relationship: "mother" });
  const player = await t.userWith([], { personId: athlete.id });
  const parent = await t.userWith([], { personId: guardian.id });
  const other = await t.userWith([], { personId: outsider.id });
  const post = (cookie: string, json: unknown) =>
    t.request("/api/announcements", { method: "POST", json, cookie });
  return { t, team, otherTeam, athlete, player, parent, other, post };
}

describeDb("announcements and notifications", () => {
  it("lets the office address the club and delivers to everyone else", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const admin = await s.t.userWith([clubWide("admin")]);
      const res = await s.post(admin.cookie, { title: "Jantar", body: "Sábado às 20h" });
      expect(res.status).toBe(201);
      expect((await json<{ delivered: number }>(res)).delivered).toBe(3);
      const inbox = await json<{ notifications: { title: string }[]; unread: number }>(
        await s.t.request("/api/notifications", { cookie: s.other.cookie }),
      );
      expect(inbox.unread).toBe(1);
      expect(inbox.notifications[0]?.title).toBe("Jantar");
    });
  });

  it("limits a team announcement to members, guardians and team staff", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const coach = await s.t.userWith([coachOf(s.team.id)]);
      const res = await s.post(coach.cookie, {
        title: "Treino",
        body: "Adiado",
        teamId: s.team.id,
      });
      expect(res.status).toBe(201);
      const unread = async (cookie: string) =>
        (await json<{ unread: number }>(await s.t.request("/api/notifications", { cookie })))
          .unread;
      expect(await unread(s.player.cookie)).toBe(1);
      expect(await unread(s.parent.cookie)).toBe(1);
      expect(await unread(s.other.cookie)).toBe(0);
    });
  });

  it("refuses coaches for the club or another team, and anonymous or plain users", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const coach = await s.t.userWith([coachOf(s.team.id)]);
      expect((await s.post(coach.cookie, { title: "A", body: "B" })).status).toBe(403);
      expect(
        (await s.post(coach.cookie, { title: "A", body: "B", teamId: s.otherTeam.id })).status,
      ).toBe(403);
      expect((await s.post(s.player.cookie, { title: "A", body: "B" })).status).toBe(403);
      expect((await s.t.request("/api/announcements")).status).toBe(401);
      expect((await s.t.request("/api/announcements", { cookie: s.player.cookie })).status).toBe(
        403,
      );
    });
  });

  it("lists and deletes announcements within the author's scope", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const admin = await s.t.userWith([clubWide("admin")]);
      const coach = await s.t.userWith([coachOf(s.team.id)]);
      const club = await json<{ announcement: { id: string } }>(
        await s.post(admin.cookie, { title: "Clube", body: "x" }),
      );
      await s.post(admin.cookie, { title: "Equipa", body: "x", teamId: s.team.id });
      const seen = await json<{ announcements: { title: string }[] }>(
        await s.t.request("/api/announcements", { cookie: coach.cookie }),
      );
      expect(seen.announcements.map((a) => a.title)).toEqual(["Equipa"]);
      const del = (cookie: string) =>
        s.t.request(`/api/announcements/${club.announcement.id}`, { method: "DELETE", cookie });
      expect((await del(coach.cookie)).status).toBe(403);
      expect((await del(admin.cookie)).status).toBe(204);
      expect((await del(admin.cookie)).status).toBe(404);
    });
  });

  it("marks entries read, only the owner's", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const admin = await s.t.userWith([clubWide("admin")]);
      await s.post(admin.cookie, { title: "Aviso", body: "x" });
      const inbox = await json<{ notifications: { id: string }[] }>(
        await s.t.request("/api/notifications", { cookie: s.player.cookie }),
      );
      const id = inbox.notifications[0]?.id;
      const read = (cookie: string) =>
        s.t.request(`/api/notifications/${id}/read`, { method: "POST", cookie });
      expect((await read(s.other.cookie)).status).toBe(404);
      expect((await read(s.player.cookie)).status).toBe(204);
      const after = await json<{ unread: number }>(
        await s.t.request("/api/notifications", { cookie: s.player.cookie }),
      );
      expect(after.unread).toBe(0);
      expect((await s.t.request("/api/notifications")).status).toBe(401);
    });
  });

  it("pushes to registered devices without personal data, honouring preferences", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const admin = await s.t.userWith([clubWide("admin")]);
      const put = (cookie: string, path: string, body: unknown) =>
        s.t.request(`/api/notifications/${path}`, { method: "PUT", json: body, cookie });
      expect(
        (await put(s.player.cookie, "devices", { token: TOKEN, platform: "ios" })).status,
      ).toBe(204);
      expect(
        (await put(s.player.cookie, "devices", { token: "nope", platform: "ios" })).status,
      ).toBe(400);
      await put(s.parent.cookie, "devices", {
        token: "ExponentPushToken[par]",
        platform: "android",
      });
      await put(s.parent.cookie, "preferences", { push: false, email: true });
      await s.post(admin.cookie, { title: "Segredo da direção", body: "detalhe" });
      expect(s.t.push.sent).toHaveLength(1);
      const [message] = s.t.push.sent;
      expect(message?.to).toBe(TOKEN);
      expect(JSON.stringify(message)).not.toContain("Segredo");
      expect(s.t.mailer.sent.map((m) => m.subject)).toContain("Segredo da direção");
    });
  });

  it("drops tokens the push service reports dead and lets a token change owner", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const admin = await s.t.userWith([clubWide("admin")]);
      const put = (cookie: string) =>
        s.t.request("/api/notifications/devices", {
          method: "PUT",
          json: { token: TOKEN, platform: "ios" },
          cookie,
        });
      await put(s.player.cookie);
      await put(s.parent.cookie);
      s.t.push.dead.add(TOKEN);
      await s.post(admin.cookie, { title: "A", body: "B" });
      expect(s.t.push.sent).toHaveLength(1); // only the new owner
      await s.post(admin.cookie, { title: "C", body: "D" });
      expect(s.t.push.sent).toHaveLength(1); // token deleted after the dead report
    });
  });

  it("notifies the person and guardians of a call-up, with a generic text", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      const coach = await s.t.userWith([coachOf(s.team.id)]);
      const staff = await s.t.userWith([clubWide("staff")]);
      const created = await s.t.request("/api/events", {
        cookie: staff.cookie,
        json: {
          kind: "training",
          teamId: s.team.id,
          startsAt: "2026-11-02T18:00:00Z",
          endsAt: "2026-11-02T19:00:00Z",
        },
      });
      const eventId = (await json<{ events: { id: string }[] }>(created)).events[0]?.id;
      expect(eventId).toBeTruthy();
      await s.t.request(`/api/callups/events/${eventId}`, {
        method: "POST",
        cookie: coach.cookie,
        json: {},
      });
      const inbox = await json<{ notifications: { kind: string; link: string }[] }>(
        await s.t.request("/api/notifications", { cookie: s.parent.cookie }),
      );
      expect(inbox.notifications[0]?.kind).toBe("callup");
      expect(inbox.notifications[0]?.link).toBe(`/event/${eventId}`);
    });
  });

  it("reminds about documents 30 and 7 days before expiry and on the day", async () => {
    await withRollback(async (db) => {
      const s = await setup(db);
      await s.t.userWith([clubWide("admin")]);
      const row = (expiresOn: string, kind: "id_document" | "medical_exam") => ({
        personId: s.athlete.id,
        kind,
        expiresOn,
        storageKey: `k-${expiresOn}-${kind}`,
        fileName: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
      });
      await db
        .insert(documents)
        .values([
          row("2026-11-15", "id_document"),
          row("2026-10-23", "medical_exam"),
          row("2026-10-24", "id_document"),
        ]);
      const channels = { db, mailer: s.t.mailer, push: s.t.push, appUrl: "http://x" };
      // ID document 30 days ahead: player, guardian and the office (3). Medical exam in 7
      // days: player and guardian only (2). The document 8 days ahead gets nothing.
      expect(await remindExpiringDocuments(channels, "2026-10-16")).toBe(5);
    });
  });
});
