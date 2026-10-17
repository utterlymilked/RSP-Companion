import { expiryStatus, MAX_DOCUMENT_BYTES } from "@rsc/shared";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { createMemoryStorage } from "../../storage/memory.js";
import { makeToken, readToken } from "../../storage/signed.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { staffAssignments, teamMembers } from "../teams/schema.js";
import { matchesContentType } from "./service.js";

const json = async <T>(res: Response) => (await res.json()) as T;
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const PDF = new TextEncoder().encode("%PDF-1.4 teste");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const athlete = await makePerson(db);
  const other = await makePerson(db);
  await db.insert(teamMembers).values([
    { teamId: team.id, personId: athlete.id, joinedOn: "2026-09-01" },
    { teamId: otherTeam.id, personId: other.id, joinedOn: "2026-09-01" },
  ]);
  const t = testApp(db);
  const upload = (
    personId: string,
    cookie: string | undefined,
    query: Record<string, string>,
    body: Uint8Array = PDF,
    type = "application/pdf",
  ) =>
    t.app.request(`/api/documents/people/${personId}?${new URLSearchParams(query)}`, {
      method: "POST",
      headers: {
        origin: "http://localhost:8081",
        "content-type": type,
        ...(cookie ? { cookie } : {}),
      },
      body: body as BodyInit,
    });
  const get = (path: string, cookie?: string) => t.request(`/api/documents${path}`, { cookie });
  return { t, team, otherTeam, athlete, other, upload, get };
}

const idDoc = { kind: "id_document", fileName: "cc.pdf", expiresOn: "2026-11-01" };
const exam = { kind: "medical_exam", fileName: "exame.pdf", expiresOn: "2027-06-30" };

describeDb("documents API", () => {
  it("lets the secretaria upload, list, open and delete a document, and audits it", () =>
    withRollback(async (db) => {
      const { t, athlete, upload, get } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);

      expect((await upload(athlete.id, undefined, idDoc)).status).toBe(401);
      const created = await upload(athlete.id, admin.cookie, idDoc);
      expect(created.status).toBe(201);
      const { document } = await json<{ document: { id: string } }>(created);
      expect(t.storage.files.size).toBe(1);

      const list = await json<{ documents: { id: string; fileName: string }[] }>(
        await get(`/people/${athlete.id}`, admin.cookie),
      );
      expect(list.documents.map((d) => d.id)).toEqual([document.id]);

      const link = await json<{ url: string }>(await get(`/${document.id}/url`, admin.cookie));
      // The signed URL needs no session.
      const file = await t.app.request(link.url);
      expect(file.status).toBe(200);
      expect(file.headers.get("content-type")).toBe("application/pdf");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);

      const audits = await db.select().from(auditLog);
      expect(audits.map((a) => a.action).sort()).toEqual(["document.read", "document.write"]);
      expect(audits.every((a) => a.details?.kind === "id_document")).toBe(true);

      expect(
        (
          await t.request(`/api/documents/${document.id}`, {
            method: "DELETE",
            cookie: admin.cookie,
          })
        ).status,
      ).toBe(204);
      expect(t.storage.files.size).toBe(0);
    }));

  it("lets coaches see kind and expiry of their own team only, never the file", () =>
    withRollback(async (db) => {
      const { t, team, otherTeam, athlete, other, upload, get } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const coach = await t.userWith([coachOf(team.id)]);
      const { document } = await json<{ document: { id: string } }>(
        await upload(athlete.id, admin.cookie, idDoc),
      );
      await upload(other.id, admin.cookie, idDoc);

      const list = await json<{ documents: unknown[] }>(
        await get(`/people/${athlete.id}`, coach.cookie),
      );
      expect(list.documents).toHaveLength(1);
      expect((await get(`/people/${other.id}`, coach.cookie)).status).toBe(403);
      expect((await get(`/${document.id}/url`, coach.cookie)).status).toBe(403);
      expect((await upload(athlete.id, coach.cookie, idDoc)).status).toBe(403);
      expect(
        (
          await t.request(`/api/documents/${document.id}`, {
            method: "DELETE",
            cookie: coach.cookie,
          })
        ).status,
      ).toBe(403);

      const expiring = await json<{ documents: { personId: string; status: string }[] }>(
        await get(`/expiring?days=30&teamId=${team.id}`, coach.cookie),
      );
      expect(expiring.documents.map((d) => d.personId)).toEqual([athlete.id]);
      expect((await get(`/expiring?teamId=${otherTeam.id}`, coach.cookie)).status).toBe(403);
      const noRole = await t.userWith([]);
      expect((await get(`/people/${athlete.id}`, noRole.cookie)).status).toBe(403);
      expect((await get("/expiring", noRole.cookie)).status).toBe(403);
    }));

  it("keeps medical exam files to the medical roles, with the expiry visible to staff", () =>
    withRollback(async (db) => {
      const { t, athlete, upload, get } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const doctor = await t.userWith([clubWide("doctor")]);
      const physio = await t.userWith([clubWide("physio")]);

      expect((await upload(athlete.id, admin.cookie, exam)).status).toBe(403);
      expect((await upload(athlete.id, physio.cookie, exam)).status).toBe(403);
      const created = await upload(athlete.id, doctor.cookie, exam);
      expect(created.status).toBe(201);
      const { document } = await json<{ document: { id: string } }>(created);

      // The admin sees that an exam exists and when it expires, but cannot open it.
      const asAdmin = await json<{ documents: { kind: string; expiresOn: string }[] }>(
        await get(`/people/${athlete.id}`, admin.cookie),
      );
      expect(asAdmin.documents).toMatchObject([{ kind: "medical_exam", expiresOn: "2027-06-30" }]);
      expect((await get(`/${document.id}/url`, admin.cookie)).status).toBe(403);

      // Other clinical roles do not even learn it exists.
      expect((await get(`/people/${athlete.id}`, physio.cookie)).status).toBe(403);
      expect((await get(`/${document.id}/url`, physio.cookie)).status).toBe(404);

      expect((await get(`/${document.id}/url`, doctor.cookie)).status).toBe(200);
      const audits = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.tier, "health")));
      expect(audits.map((a) => a.action).sort()).toEqual(["health.read", "health.write"]);
    }));

  it("refuses wrong, spoofed and oversized files", () =>
    withRollback(async (db) => {
      const { t, athlete, upload } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const as = (body: Uint8Array, type: string) =>
        upload(athlete.id, admin.cookie, idDoc, body, type);

      expect((await as(PDF, "text/html")).status).toBe(415);
      expect((await as(PDF, "image/png")).status).toBe(415); // a PDF labelled as PNG
      expect((await as(PNG, "image/png")).status).toBe(201);
      expect((await as(new Uint8Array(0), "application/pdf")).status).toBe(400);
      const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
      big.set(PDF);
      expect((await as(big, "application/pdf")).status).toBe(413);
      expect(t.storage.files.size).toBe(1);

      const badDates = { ...idDoc, issuedOn: "2026-12-01", expiresOn: "2026-11-01" };
      expect((await upload(athlete.id, admin.cookie, badDates)).status).toBe(400);
      expect((await upload(athlete.id, admin.cookie, { kind: "other" })).status).toBe(400);
    }));

  it("reports the latest expiry per kind, expired first", () =>
    withRollback(async (db) => {
      const { t, athlete, other, upload, get } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      await upload(athlete.id, admin.cookie, { ...idDoc, expiresOn: "2020-01-01" });
      await upload(athlete.id, admin.cookie, { ...idDoc, expiresOn: "2099-01-01" }); // renewed
      await upload(other.id, admin.cookie, { ...idDoc, expiresOn: "2020-02-02" });
      await upload(other.id, admin.cookie, { kind: "other", fileName: "x.pdf" }); // no expiry

      const res = await json<{ documents: { personId: string; status: string }[] }>(
        await get("/expiring?days=0", admin.cookie),
      );
      expect(res.documents).toEqual([
        expect.objectContaining({ personId: other.id, status: "expired" }),
      ]);
    }));

  it("tracks staff documents and reports who lacks a required one", () =>
    withRollback(async (db) => {
      const { t, team, otherTeam, athlete, upload, get } = await setup(db);
      const admin = await t.userWith([clubWide("admin")]);
      const doctor = await t.userWith([clubWide("doctor")]);
      const coach = await t.userWith([coachOf(team.id)]);
      const season = await makeSeason(db, {
        name: "2027/28",
        startsOn: "2027-08-01",
        endsOn: "2028-07-31",
      });
      const org = await makeOrganisation(db);
      const trainer = await makePerson(db);
      const nurse = await makePerson(db);
      await db.insert(staffAssignments).values([
        // Coaches a team; the licence expires soon.
        {
          personId: trainer.id,
          seasonId: season.id,
          function: "head_coach",
          organisationId: org.id,
          teamId: team.id,
        },
        // Staff without a team.
        { personId: nurse.id, seasonId: season.id, function: "nurse", organisationId: org.id },
      ]);
      await upload(trainer.id, admin.cookie, {
        kind: "coaching_licence",
        fileName: "t.pdf",
        expiresOn: "2026-11-01",
      });
      await upload(nurse.id, admin.cookie, {
        kind: "first_aid_certificate",
        fileName: "s.pdf",
        expiresOn: "2026-11-01",
      });

      const expiring = async (cookie: string, query = "") =>
        (
          await json<{ documents: { personId: string }[] }>(
            await get(`/expiring?days=30${query}`, cookie),
          )
        ).documents.map((d) => d.personId);
      // Club-wide sees both; the team's coach sees the trainer, not teamless staff.
      expect((await expiring(admin.cookie)).sort()).toEqual([trainer.id, nurse.id].sort());
      expect(await expiring(coach.cookie)).toEqual([trainer.id]);

      type Missing = { personId: string; role: string; missing: string[] };
      const missing = async (cookie: string) =>
        (await json<{ people: Missing[] }>(await get("/missing", cookie))).people;
      const forAdmin = await missing(admin.cookie);
      const byId = (people: Missing[], id: string) => people.find((p) => p.personId === id);
      // A head coach needs ID, professional card and first aid on top of the licence.
      expect(byId(forAdmin, trainer.id)).toMatchObject({
        role: "staff",
        missing: ["id_document", "professional_card", "first_aid_certificate"],
      });
      expect(byId(forAdmin, nurse.id)?.missing).toEqual(["id_document"]);
      // Players need photo, federation registration and ID; the medical exam stays hidden from admin.
      expect(byId(forAdmin, athlete.id)).toMatchObject({
        role: "player",
        missing: ["photo", "federation_registration", "id_document"],
      });
      expect(byId(await missing(coach.cookie), nurse.id)).toBeUndefined();
      expect(byId(await missing(coach.cookie), trainer.id)).toBeDefined();
      expect((await get("/missing", doctor.cookie)).status).toBe(403);
      expect(otherTeam.id).toBeDefined();
    }));
});

it("recognises file types by their first bytes", () => {
  expect(matchesContentType(PDF, "application/pdf")).toBe(true);
  expect(matchesContentType(PNG, "image/jpeg")).toBe(false);
  expect(matchesContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
});

it("classifies expiry dates", () => {
  expect(expiryStatus(null, "2026-10-16")).toBe("none");
  expect(expiryStatus("2026-10-15", "2026-10-16")).toBe("expired");
  expect(expiryStatus("2026-10-16", "2026-10-16")).toBe("expiring");
  expect(expiryStatus("2026-11-15", "2026-10-16")).toBe("expiring");
  expect(expiryStatus("2026-11-16", "2026-10-16")).toBe("valid");
});

it("serves a stored file only for a valid, unexpired and untampered token", async () => {
  const storage = createMemoryStorage("a-secret-that-is-at-least-32-characters");
  await storage.put("k", PDF, "application/pdf");
  const url = await storage.signedUrl("k", {
    fileName: "a.pdf",
    contentType: "application/pdf",
    expiresInSeconds: 60,
  });
  const token = url.split("/").pop() ?? "";
  expect(await storage.open(token)).not.toBeNull();
  expect(await storage.open(token, new Date(Date.now() + 120_000))).toBeNull();
  expect(await storage.open(`${token}x`)).toBeNull();
  expect(await storage.open("garbage")).toBeNull();
  const forged = makeToken("another-secret-that-is-32-chars-long!", {
    key: "k",
    fileName: "a.pdf",
    contentType: "application/pdf",
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  expect(readToken("a-secret-that-is-at-least-32-characters", forged)).toBeNull();
});
