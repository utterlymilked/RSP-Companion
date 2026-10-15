import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const person = await makePerson(db);
  const body = (extra: Record<string, unknown> = {}) => ({
    type: "discipline",
    occurredAt: "2026-11-02T18:00:00Z",
    place: "Campo 1",
    teamId: team.id,
    description: "Discussão com o árbitro.",
    people: [{ personId: person.id, role: "involved" }],
    ...extra,
  });
  return { team, otherTeam, person, body, t: testApp(db) };
}
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const json = async <T>(res: Response) => (await res.json()) as T;

describeDb("incidents API", () => {
  it("lets the office and a coach of the team report, and nobody else", () =>
    withRollback(async (db) => {
      const { team, otherTeam, body, t } = await setup(db);
      expect((await t.request("/api/incidents", { json: body() })).status).toBe(401);

      const athlete = await t.userWith([clubWide("athlete")]);
      expect((await t.request("/api/incidents", { cookie: athlete.cookie })).status).toBe(403);
      expect(
        (await t.request("/api/incidents", { cookie: athlete.cookie, json: body() })).status,
      ).toBe(403);

      const staff = await t.userWith([clubWide("staff")]);
      expect(
        (await t.request("/api/incidents", { cookie: staff.cookie, json: body() })).status,
      ).toBe(201);

      const coach = await t.userWith([coachOf(team.id)]);
      expect(
        (await t.request("/api/incidents", { cookie: coach.cookie, json: body() })).status,
      ).toBe(201);
      expect(
        (
          await t.request("/api/incidents", {
            cookie: coach.cookie,
            json: body({ teamId: otherTeam.id }),
          })
        ).status,
      ).toBe(403);
      expect(
        (await t.request("/api/incidents", { cookie: coach.cookie, json: body({ teamId: null }) }))
          .status,
      ).toBe(403);
      // Validation: the description is required.
      expect(
        (
          await t.request("/api/incidents", {
            cookie: staff.cookie,
            json: body({ description: " " }),
          })
        ).status,
      ).toBe(400);
    }));

  it("replays a draft with the same client key without duplicating it", () =>
    withRollback(async (db) => {
      const { body, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const clientKey = "44444444-4444-4444-8444-444444444444";
      const first = await t.request("/api/incidents", {
        cookie: staff.cookie,
        json: body({ clientKey }),
      });
      const second = await t.request("/api/incidents", {
        cookie: staff.cookie,
        json: body({ clientKey }),
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const [a, b] = await Promise.all([
        json<{ incident: { id: string } }>(first),
        json<{ incident: { id: string } }>(second),
      ]);
      expect(a.incident.id).toBe(b.incident.id);
      const list = await t.request("/api/incidents", { cookie: staff.cookie });
      expect((await json<{ incidents: unknown[] }>(list)).incidents).toHaveLength(1);
    }));

  it("scopes coaches to their team's incidents", () =>
    withRollback(async (db) => {
      const { team, otherTeam, body, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const own = await json<{ incident: { id: string } }>(
        await t.request("/api/incidents", { cookie: staff.cookie, json: body() }),
      );
      const other = await json<{ incident: { id: string } }>(
        await t.request("/api/incidents", {
          cookie: staff.cookie,
          json: body({ teamId: otherTeam.id }),
        }),
      );
      const coach = await t.userWith([coachOf(team.id)]);
      const list = await json<{ incidents: { id: string }[] }>(
        await t.request("/api/incidents", { cookie: coach.cookie }),
      );
      expect(list.incidents.map((i) => i.id)).toEqual([own.incident.id]);
      expect(
        (await t.request(`/api/incidents/${own.incident.id}`, { cookie: coach.cookie })).status,
      ).toBe(200);
      expect(
        (await t.request(`/api/incidents/${other.incident.id}`, { cookie: coach.cookie })).status,
      ).toBe(404);
    }));

  it("shows injury reports in full to clinical roles and the reporter only", () =>
    withRollback(async (db) => {
      const { team, otherTeam, person, body, t } = await setup(db);
      const coach = await t.userWith([coachOf(team.id)]);
      const injury = await json<{ incident: { id: string } }>(
        await t.request("/api/incidents", {
          cookie: coach.cookie,
          json: body({
            type: "injury",
            description: "Caiu durante o treino.",
            people: [{ personId: person.id, role: "injured" }],
          }),
        }),
      );
      const url = `/api/incidents/${injury.incident.id}`;
      type Detail = { incident: { view: string; description: string | null; people: unknown[] } };

      const mine = await json<Detail>(await t.request(url, { cookie: coach.cookie }));
      expect(mine.incident.view).toBe("full");
      expect(mine.incident.people).toHaveLength(1);

      const physio = await t.userWith([clubWide("physio")]);
      const clinical = await json<Detail>(await t.request(url, { cookie: physio.cookie }));
      expect(clinical.incident.view).toBe("full");
      expect(clinical.incident.description).toBe("Caiu durante o treino.");

      // The office sees that an injury happened, not what was written or who was hurt.
      for (const role of ["admin", "staff"] as const) {
        const reader = await t.userWith([clubWide(role)]);
        const res = await json<Detail>(await t.request(url, { cookie: reader.cookie }));
        expect(res.incident.view).toBe("summary");
        expect(res.incident.description).toBeNull();
        expect(res.incident.people).toEqual([]);
        const list = await json<{ incidents: Record<string, unknown>[] }>(
          await t.request("/api/incidents", { cookie: reader.cookie }),
        );
        expect(list.incidents[0]?.description).toBeNull();
      }

      // Another coach cannot even see it; a coach of the team sees the summary.
      const otherCoach = await t.userWith([coachOf(otherTeam.id)]);
      expect((await t.request(url, { cookie: otherCoach.cookie })).status).toBe(404);
      const colleague = await t.userWith([coachOf(team.id)]);
      const seen = await json<Detail>(await t.request(url, { cookie: colleague.cookie }));
      expect(seen.incident.view).toBe("summary");
    }));

  it("lets managers set status and follow-up and the reporter fix an open report", () =>
    withRollback(async (db) => {
      const { team, body, t } = await setup(db);
      const coach = await t.userWith([coachOf(team.id)]);
      const created = await json<{ incident: { id: string } }>(
        await t.request("/api/incidents", { cookie: coach.cookie, json: body() }),
      );
      const url = `/api/incidents/${created.incident.id}`;
      const patch = (cookie: string, json: unknown) =>
        t.request(url, { method: "PATCH", cookie, json });

      expect((await patch(coach.cookie, { description: "Texto corrigido." })).status).toBe(200);
      expect((await patch(coach.cookie, { status: "closed" })).status).toBe(403);
      expect((await patch(coach.cookie, { followUp: "x" })).status).toBe(403);

      const colleague = await t.userWith([coachOf(team.id)]);
      expect((await patch(colleague.cookie, { description: "y" })).status).toBe(403);

      const staff = await t.userWith([clubWide("staff")]);
      const done = await patch(staff.cookie, { status: "closed", followUp: "Advertência." });
      expect(done.status).toBe(200);
      expect((await json<{ incident: { status: string } }>(done)).incident.status).toBe("closed");
      // Once closed, the reporter can no longer edit.
      expect((await patch(coach.cookie, { description: "z" })).status).toBe(403);

      const filtered = await json<{ incidents: unknown[] }>(
        await t.request("/api/incidents?status=open", { cookie: staff.cookie }),
      );
      expect(filtered.incidents).toHaveLength(0);
    }));

  it("answers 404 for an unknown person involved", () =>
    withRollback(async (db) => {
      const { body, t } = await setup(db);
      const staff = await t.userWith([clubWide("staff")]);
      const res = await t.request("/api/incidents", {
        cookie: staff.cookie,
        json: body({ people: [{ personId: "66666666-6666-4666-8666-666666666666" }] }),
      });
      expect(res.status).toBe(404);
    }));
});
