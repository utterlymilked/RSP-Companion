import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { teamMembers } from "../teams/schema.js";

const json = async <T>(res: Response) => (await res.json()) as T;
interface Template {
  id: string;
  criteria: { id: string; label: string }[];
}
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const athlete = await makePerson(db);
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, personId: athlete.id, joinedOn: "2026-07-01" });
  const t = testApp(db);
  const staff = await t.userWith([clubWide("staff")]);
  const post = (path: string, body: unknown, cookie = staff.cookie) =>
    t.request(`/api/evaluations${path}`, { cookie, json: body });
  const get = (path: string, cookie = staff.cookie) =>
    t.request(`/api/evaluations${path}`, { cookie });
  const newTemplate = async (extra: Record<string, unknown> = {}) =>
    (
      await json<{ template: Template }>(
        await post("/templates", {
          name: `Avaliação ${Math.random()}`,
          scaleMax: 5,
          criteria: ["Técnica", "Atitude"],
          ...extra,
        }),
      )
    ).template;
  return { t, staff, team, otherTeam, athlete, post, get, newTemplate };
}

describeDb("evaluations API", () => {
  it("lets only the office manage templates; evaluators can list them", () =>
    withRollback(async (db) => {
      const { t, team, post, get } = await setup(db);
      expect((await t.request("/api/evaluations/templates")).status).toBe(401);
      const coach = await t.userWith([coachOf(team.id)]);
      const body = { name: "Sub-13", criteria: ["Técnica"] };
      expect((await post("/templates", body, coach.cookie)).status).toBe(403);
      expect((await post("/templates", body)).status).toBe(201);
      expect((await post("/templates", body)).status).toBe(409); // name is unique
      expect((await post("/templates", { name: "X", criteria: [] })).status).toBe(400);
      expect((await post("/templates", { name: "X", criteria: ["A", "A"] })).status).toBe(400);
      expect((await post("/templates", { name: "X", scaleMax: 1, criteria: ["A"] })).status).toBe(
        400,
      );
      const listed = await json<{ templates: Template[] }>(await get("/templates", coach.cookie));
      expect(listed.templates).toHaveLength(1);
      expect(listed.templates[0]?.criteria.map((c) => c.label)).toEqual(["Técnica"]);
      const player = await t.userWith([clubWide("athlete")]);
      expect((await get("/templates", player.cookie)).status).toBe(403);
    }));

  it("records evaluations and returns the history newest first", () =>
    withRollback(async (db) => {
      const { athlete, team, post, get, newTemplate } = await setup(db);
      const template = await newTemplate();
      const [technique, attitude] = template.criteria;
      const body = (extra: Record<string, unknown> = {}) => ({
        personId: athlete.id,
        templateId: template.id,
        evaluatedOn: "2026-10-01",
        teamId: team.id,
        scores: [
          { criterionId: technique?.id, score: 3 },
          { criterionId: attitude?.id, score: 5 },
        ],
        ...extra,
      });
      expect((await post("", body())).status).toBe(201);
      expect(
        (await post("", body({ evaluatedOn: "2026-11-01", comment: "Evoluiu." }))).status,
      ).toBe(201);
      const history = await json<{
        evaluations: {
          evaluatedOn: string;
          comment: string | null;
          scores: { label: string; score: number }[];
        }[];
      }>(await get(`?personId=${athlete.id}`));
      expect(history.evaluations.map((e) => e.evaluatedOn)).toEqual(["2026-11-01", "2026-10-01"]);
      expect(history.evaluations[0]?.comment).toBe("Evoluiu.");
      expect(history.evaluations[0]?.scores).toEqual([
        expect.objectContaining({ label: "Técnica", score: 3 }),
        expect.objectContaining({ label: "Atitude", score: 5 }),
      ]);
    }));

  it("refuses scores outside the template or its scale, and retired templates", () =>
    withRollback(async (db) => {
      const { athlete, post, newTemplate } = await setup(db);
      const template = await newTemplate({ scaleMax: 3 });
      const other = await newTemplate();
      const base = { personId: athlete.id, templateId: template.id, evaluatedOn: "2026-10-01" };
      const criterion = template.criteria[0]?.id;
      expect(
        (await post("", { ...base, scores: [{ criterionId: criterion, score: 4 }] })).status,
      ).toBe(400);
      expect(
        (await post("", { ...base, scores: [{ criterionId: other.criteria[0]?.id, score: 2 }] }))
          .status,
      ).toBe(400);
      expect((await post("", { ...base, scores: [] })).status).toBe(400);
      expect(
        (await post("", { ...base, scores: [{ criterionId: criterion, score: 3 }] })).status,
      ).toBe(201);
    }));

  it("scopes coaches to the athletes of their team", () =>
    withRollback(async (db) => {
      const { t, athlete, team, otherTeam, post, get, newTemplate } = await setup(db);
      const template = await newTemplate();
      const scores = [{ criterionId: template.criteria[0]?.id, score: 4 }];
      const body = {
        personId: athlete.id,
        templateId: template.id,
        evaluatedOn: "2026-10-01",
        scores,
      };
      const coach = await t.userWith([coachOf(team.id)]);
      const stranger = await t.userWith([coachOf(otherTeam.id)]);
      expect((await post("", body, stranger.cookie)).status).toBe(403);
      expect((await get(`?personId=${athlete.id}`, stranger.cookie)).status).toBe(403);
      expect((await post("", body, coach.cookie)).status).toBe(201);
      expect((await get(`?personId=${athlete.id}`, coach.cookie)).status).toBe(200);
      // Team managers may read but not write; athletes and scouts see nothing.
      const manager = await t.userWith([{ role: "team_manager", teamId: team.id, classId: null }]);
      expect((await get(`?personId=${athlete.id}`, manager.cookie)).status).toBe(200);
      expect((await post("", body, manager.cookie)).status).toBe(403);
      for (const role of ["athlete", "scout"] as const) {
        const user = await t.userWith([clubWide(role)]);
        expect((await get(`?personId=${athlete.id}`, user.cookie)).status).toBe(403);
      }
      expect((await get(`?personId=${athlete.id}`, "")).status).toBe(401);
    }));

  it("renames and retires templates", () =>
    withRollback(async (db) => {
      const { t, staff, athlete, post, get, newTemplate } = await setup(db);
      const template = await newTemplate();
      const patch = (id: string, body: unknown) =>
        t.request(`/api/evaluations/templates/${id}`, {
          method: "PATCH",
          cookie: staff.cookie,
          json: body,
        });
      expect((await patch(template.id, { active: false })).status).toBe(200);
      expect(
        (await json<{ templates: Template[] }>(await get("/templates"))).templates,
      ).toHaveLength(0);
      expect(
        (await json<{ templates: Template[] }>(await get("/templates?includeInactive=true")))
          .templates,
      ).toHaveLength(1);
      const scores = [{ criterionId: template.criteria[0]?.id, score: 2 }];
      expect(
        (
          await post("", {
            personId: athlete.id,
            templateId: template.id,
            evaluatedOn: "2026-10-01",
            scores,
          })
        ).status,
      ).toBe(400);
      expect((await patch("00000000-0000-4000-8000-000000000000", { name: "X" })).status).toBe(404);
    }));
});
