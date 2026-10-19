import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { defaultRetainUntil } from "./service.js";

const json = async <T>(res: Response) => (await res.json()) as T;
interface Prospect {
  id: string;
  status: string;
  retainUntil: string;
  expired: boolean;
  lastRating: number | null;
}

describeDb("scouting API", () => {
  it("computes the default retention as 12 months, clamping month ends", () => {
    expect(defaultRetainUntil(new Date("2026-10-15T12:00:00Z"))).toBe("2027-10-15");
    expect(defaultRetainUntil(new Date("2027-02-28T12:00:00Z"))).toBe("2028-02-28");
    expect(defaultRetainUntil(new Date("2028-02-29T12:00:00Z"))).toBe("2029-02-28");
  });

  it("lets scouts, recruiters and the office work, nobody else", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const team = await makeTeam(db, {
        seasonId: (await makeSeason(db)).id,
        organisationId: (await makeOrganisation(db)).id,
      });
      const post = (cookie: string, body: unknown) =>
        t.request("/api/scouting/prospects", { cookie, json: body });
      expect((await t.request("/api/scouting/prospects")).status).toBe(401);
      for (const role of ["scout", "recruiter", "staff", "admin"] as const) {
        const user = await t.userWith([clubWide(role)]);
        expect((await post(user.cookie, { fullName: "Jogador Externo" })).status).toBe(201);
        expect((await t.request("/api/scouting/prospects", { cookie: user.cookie })).status).toBe(
          200,
        );
      }
      for (const role of ["coach", "athlete", "treasurer", "physio"] as const) {
        const user = await t.userWith(
          role === "coach" ? [{ role, teamId: team.id, classId: null }] : [clubWide(role)],
        );
        expect((await t.request("/api/scouting/prospects", { cookie: user.cookie })).status).toBe(
          403,
        );
        expect((await post(user.cookie, { fullName: "X" })).status).toBe(403);
      }
    }));

  it("moves a prospect along the pipeline and keeps reports", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const scout = await t.userWith([clubWide("scout")]);
      const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
        t.request(`/api/scouting${path}`, { cookie: scout.cookie, ...init });
      const created = await json<{ prospect: Prospect }>(
        await req("/prospects", {
          json: { fullName: " Jogador Externo ", birthYear: 2012, position: "Médio" },
        }),
      );
      expect(created.prospect).toMatchObject({
        status: "identified",
        expired: false,
        retainUntil: defaultRetainUntil(),
      });
      const id = created.prospect.id;
      expect(
        (await req(`/prospects/${id}`, { method: "PATCH", json: { status: "observed" } })).status,
      ).toBe(200);
      expect(
        (await req(`/prospects/${id}`, { method: "PATCH", json: { status: "bogus" } })).status,
      ).toBe(400);
      for (const [observedOn, rating] of [
        ["2026-10-01", 3],
        ["2026-10-08", 5],
      ] as const) {
        expect(
          (
            await req(`/prospects/${id}/reports`, {
              json: { observedOn, rating, text: "Bom jogo." },
            })
          ).status,
        ).toBe(201);
      }
      expect(
        (
          await req(`/prospects/${id}/reports`, {
            json: { observedOn: "2026-10-08", rating: 6, text: "x" },
          })
        ).status,
      ).toBe(400);
      const detail = await json<{ prospect: Prospect; reports: { observedOn: string }[] }>(
        await req(`/prospects/${id}`),
      );
      expect(detail.prospect.status).toBe("observed");
      expect(detail.reports.map((r) => r.observedOn)).toEqual(["2026-10-08", "2026-10-01"]);
      const list = await json<{ prospects: Prospect[] }>(await req("/prospects?status=observed"));
      expect(list.prospects).toEqual([expect.objectContaining({ id, lastRating: 5 })]);
      expect((await req("/prospects/00000000-0000-4000-8000-000000000000")).status).toBe(404);
      expect(
        (
          await req("/prospects/00000000-0000-4000-8000-000000000000/reports", {
            json: { observedOn: "2026-10-08", rating: 3, text: "x" },
          })
        ).status,
      ).toBe(404);
    }));

  it("stores the observation request fields and keeps them on partial updates", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const scout = await t.userWith([clubWide("scout")]);
      const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
        t.request(`/api/scouting${path}`, { cookie: scout.cookie, ...init });
      const created = await json<{ prospect: Record<string, unknown> & Prospect }>(
        await req("/prospects", {
          json: {
            fullName: "Jogador Externo",
            birthDate: "2013-05-04",
            guardianName: "Responsável",
            guardianRelation: "parent",
            guardianEmail: "",
            targetEscalao: "sub13",
            context: "federated_club",
            positions: ["gr", "dc"],
            heightCm: 150,
            preferredDate: "2026-11-02",
            clubAuthorisationNeeded: true,
          },
        }),
      );
      expect(created.prospect).toMatchObject({
        birthYear: 2013,
        guardianRelation: "parent",
        guardianEmail: null,
        positions: ["gr", "dc"],
        clubAuthorisationNeeded: true,
        clubAuthorised: false,
      });
      const id = created.prospect.id;
      await req(`/prospects/${id}`, { method: "PATCH", json: { status: "observed" } });
      const after = await json<{ prospect: Record<string, unknown> }>(
        await req(`/prospects/${id}`),
      );
      expect(after.prospect).toMatchObject({ positions: ["gr", "dc"], heightCm: 150 });
      for (const bad of [{ targetEscalao: "sub21" }, { positions: ["xx"] }, { heightCm: 20 }]) {
        expect((await req("/prospects", { json: { fullName: "X", ...bad } })).status).toBe(400);
      }
    }));

  it("flags prospects past their retention date", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const staff = await t.userWith([clubWide("staff")]);
      const post = (body: unknown) =>
        t.request("/api/scouting/prospects", { cookie: staff.cookie, json: body });
      await post({ fullName: "Antigo", retainUntil: "2020-01-01" });
      await post({ fullName: "Recente" });
      const expired = await json<{ prospects: Prospect[] }>(
        await t.request("/api/scouting/prospects?expired=true", { cookie: staff.cookie }),
      );
      expect(expired.prospects).toHaveLength(1);
      expect(expired.prospects[0]).toMatchObject({ expired: true, retainUntil: "2020-01-01" });
    }));

  it("builds a profile from attribute scores and a heat grid, with a computed archetype", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const scout = await t.userWith([clubWide("scout")]);
      const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
        t.request(`/api/scouting${path}`, { cookie: scout.cookie, ...init });
      const { prospect } = await json<{ prospect: Prospect }>(
        await req("/prospects", { json: { fullName: "Médio Criativo", positions: ["mc"] } }),
      );
      const heat = Array.from({ length: 18 }, (_, i) => i % 4);
      const scores = { passing: 9, vision: 8, composure: 8, positioning: 7, stamina: 5 };
      const res = await req(`/prospects/${prospect.id}/reports`, {
        json: {
          observedOn: "2026-10-08",
          text: "Dita o ritmo.",
          scores,
          heat,
          positionPlayed: "mc",
        },
      });
      expect(res.status).toBe(201);
      expect((await json<{ report: { rating: number } }>(res)).report.rating).toBe(4);
      const detail = await json<{
        prospect: {
          profile: { group: string; archetype: string; overall: number; heat: number[] };
        };
      }>(await req(`/prospects/${prospect.id}`));
      expect(detail.prospect.profile).toMatchObject({
        group: "mid",
        archetype: "deepPlaymaker",
        overall: 7.4,
        heat,
      });
      await req(`/prospects/${prospect.id}`, { method: "PATCH", json: { archetype: "boxToBox" } });
      const filtered = await json<{ prospects: Prospect[] }>(
        await req("/prospects?group=mid&archetype=boxToBox"),
      );
      expect(filtered.prospects).toHaveLength(1);
      expect((await req("/prospects?group=gk")).status).toBe(200);
      for (const bad of [
        { scores: { passing: 11 } },
        { scores: { bogus: 5 } },
        { heat: [1, 2, 3] },
      ]) {
        expect(
          (
            await req(`/prospects/${prospect.id}/reports`, {
              json: { observedOn: "2026-10-09", text: "x", rating: 3, ...bad },
            })
          ).status,
        ).toBe(400);
      }
      // No rating and no scores: nothing to derive the overall rating from.
      expect(
        (
          await req(`/prospects/${prospect.id}/reports`, {
            json: { observedOn: "2026-10-09", text: "x" },
          })
        ).status,
      ).toBe(400);
    }));

  it("links a prospect to a person: forced by NIF after confirmation, or chosen by name", () =>
    withRollback(async (db) => {
      const t = testApp(db);
      const scout = await t.userWith([clubWide("scout")]);
      const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
        t.request(`/api/scouting${path}`, { cookie: scout.cookie, ...init });
      const nif = "999999990";
      const other = "123456789";
      const ana = await makePerson(db, { fullName: "Ana Beatriz Costa", nif });
      const joao = await makePerson(db, {
        fullName: "João Pedro Silva Santos",
        birthDate: "2013-02-02",
      });
      // Invalid NIF is refused.
      expect((await req("/prospects", { json: { fullName: "X", nif: "123456788" } })).status).toBe(
        400,
      );
      // A NIF that belongs to a person asks for confirmation, then links.
      const asked = await req("/prospects", { json: { fullName: "Ana B. Costa", nif } });
      expect(asked.status).toBe(409);
      expect(await json<{ error: { code: string } }>(asked)).toMatchObject({
        error: { code: "link_confirmation_required" },
      });
      const made = await json<{
        prospect: { id: string; personId: string; person: { fullName: string } };
      }>(await req("/prospects", { json: { fullName: "Ana B. Costa", nif, confirmLink: true } }));
      expect(made.prospect).toMatchObject({
        personId: ana.id,
        person: { fullName: "Ana Beatriz Costa" },
      });
      // Choosing another person while the NIF belongs to Ana is a mismatch.
      expect(
        (
          await req("/prospects", {
            json: { fullName: "Y", nif, personId: joao.id, confirmLink: true },
          })
        ).status,
      ).toBe(409);
      // Name suggestions: similar name ranks, birth year match is a flag, never the date.
      const { prospect: jp } = await json<{ prospect: { id: string } }>(
        await req("/prospects", { json: { fullName: "João Silva", birthYear: 2013 } }),
      );
      const sug = await json<{ suggestions: Record<string, unknown>[] }>(
        await req(`/prospects/${jp.id}/link-suggestions`),
      );
      expect(sug.suggestions[0]).toMatchObject({
        personId: joao.id,
        reason: "name",
        birthYearMatch: true,
      });
      expect(JSON.stringify(sug)).not.toContain("2013-02-02");
      // Manual link, then unlink.
      const linked = await json<{ prospect: { personId: string } }>(
        await req(`/prospects/${jp.id}`, { method: "PATCH", json: { personId: joao.id } }),
      );
      expect(linked.prospect.personId).toBe(joao.id);
      const cleared = await json<{ prospect: { personId: string | null } }>(
        await req(`/prospects/${jp.id}`, { method: "PATCH", json: { personId: null } }),
      );
      expect(cleared.prospect.personId).toBeNull();
      // Linking a person who has another NIF than the prospect's is refused.
      expect(
        (
          await req(`/prospects/${jp.id}`, {
            method: "PATCH",
            json: { nif: other, personId: ana.id },
          })
        ).status,
      ).toBe(409);
    }));
});
