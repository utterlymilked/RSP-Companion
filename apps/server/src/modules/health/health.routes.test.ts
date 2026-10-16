import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { auditLog } from "../audit/schema.js";
import { guardianships } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";
import { ageOn, deriveAvailability } from "./service.js";

const json = async <T>(res: Response) => (await res.json()) as T;
const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const TODAY = "2026-10-16";

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const adult = await makePerson(db, { birthDate: "1995-05-05" });
  const other = await makePerson(db);
  await db.insert(teamMembers).values([
    { teamId: team.id, personId: adult.id, joinedOn: "2026-09-01" },
    { teamId: otherTeam.id, personId: other.id, joinedOn: "2026-09-01" },
  ]);
  const t = testApp(db);
  const get = (path: string, cookie?: string) => t.request(`/api/health${path}`, { cookie });
  const post = (path: string, body: unknown, cookie?: string, method?: string) =>
    t.request(`/api/health${path}`, { cookie, json: body, method });
  const injury = { discipline: "medical", bodyPart: "Joelho", startedOn: TODAY };
  return { t, team, otherTeam, adult, other, get, post, injury };
}

describe_("health API");
function describe_(name: string) {
  describeDb(name, () => {
    it("lets each clinical role read and write its own discipline only", () =>
      withRollback(async (db) => {
        const { t, adult, get, post, injury } = await setup(db);
        const doctor = await t.userWith([clubWide("doctor")]);
        const physio = await t.userWith([clubWide("physio")]);
        const records = `/people/${adult.id}/records`;

        expect((await get(records)).status).toBe(401);
        const created = await post(`/people/${adult.id}/injuries`, injury, doctor.cookie);
        expect(created.status).toBe(201);
        const note = { discipline: "medical", recordedOn: TODAY, summary: "Exame de rotina" };
        expect((await post(`/people/${adult.id}/notes`, note, doctor.cookie)).status).toBe(201);

        // The physio cannot write medical records, and sees none of them.
        expect((await post(`/people/${adult.id}/injuries`, injury, physio.cookie)).status).toBe(
          403,
        );
        expect((await post(`/people/${adult.id}/notes`, note, physio.cookie)).status).toBe(403);
        const asPhysio = await json<{ notes: unknown[]; injuries: unknown[] }>(
          await get(records, physio.cookie),
        );
        expect(asPhysio.notes).toHaveLength(0);
        expect(asPhysio.injuries).toHaveLength(0);

        const asDoctor = await json<{ notes: unknown[]; injuries: unknown[] }>(
          await get(records, doctor.cookie),
        );
        expect(asDoctor.notes).toHaveLength(1);
        expect(asDoctor.injuries).toHaveLength(1);
      }));

    it("refuses everyone without a clinical role, admin included", () =>
      withRollback(async (db) => {
        const { t, team, adult, get, post, injury } = await setup(db);
        const records = `/people/${adult.id}/records`;
        const roles = [
          clubWide("admin"),
          clubWide("staff"),
          coachOf(team.id),
          clubWide("treasurer"),
          clubWide("athlete"),
          clubWide("guardian"),
        ];
        for (const role of roles) {
          const user = await t.userWith([role]);
          expect((await get(records, user.cookie)).status).toBe(403);
          expect((await post(`/people/${adult.id}/injuries`, injury, user.cookie)).status).toBe(
            403,
          );
        }
      }));

    it("audits every read and write without storing the content", () =>
      withRollback(async (db) => {
        const { t, adult, get, post, injury } = await setup(db);
        const doctor = await t.userWith([clubWide("doctor")]);
        await post(`/people/${adult.id}/injuries`, injury, doctor.cookie);
        await get(`/people/${adult.id}/records`, doctor.cookie);
        const entries = await db.select().from(auditLog);
        const actions = entries.filter((e) => e.tier === "health").map((e) => e.action);
        expect(actions.sort()).toEqual(["health.read", "health.write"]);
        expect(JSON.stringify(entries)).not.toContain("Joelho");
      }));

    it("hides other disciplines' injuries from a clinician and tracks return to play", () =>
      withRollback(async (db) => {
        const { t, adult, post, get, injury } = await setup(db);
        const doctor = await t.userWith([clubWide("doctor")]);
        const physio = await t.userWith([clubWide("physio")]);
        const { injury: created } = await json<{ injury: { id: string } }>(
          await post(`/people/${adult.id}/injuries`, injury, doctor.cookie),
        );
        const url = `/injuries/${created.id}`;
        // A physio gets 404, not 403: it must not learn that the injury exists.
        expect((await post(url, { status: "cleared" }, physio.cookie, "PATCH")).status).toBe(404);

        const back = await json<{ injury: { status: string; availability: string } }>(
          await post(url, { status: "return_to_play" }, doctor.cookie, "PATCH"),
        );
        expect(back.injury).toMatchObject({ status: "return_to_play", availability: "limited" });
        const cleared = await json<{ injury: { status: string; clearedOn: string } }>(
          await post(url, { status: "cleared" }, doctor.cookie, "PATCH"),
        );
        expect(cleared.injury.status).toBe("cleared");
        expect(cleared.injury.clearedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // A cleared injury is closed.
        expect((await post(url, { status: "active" }, doctor.cookie, "PATCH")).status).toBe(409);
        expect((await get(`/people/${adult.id}/records`, doctor.cookie)).status).toBe(200);
      }));

    it("needs guardian consent for minors before any record is kept", () =>
      withRollback(async (db) => {
        const { t, post, get, injury } = await setup(db);
        const child = await makePerson(db, { birthDate: "2014-03-03" });
        const parent = await makePerson(db, { birthDate: "1985-01-01" });
        const stranger = await makePerson(db);
        await db
          .insert(guardianships)
          .values({ guardianId: parent.id, childId: child.id, relationship: "mother" });
        const doctor = await t.userWith([clubWide("doctor")]);
        const staff = await t.userWith([clubWide("staff")]);
        const consent = `/people/${child.id}/consent`;

        expect((await post(`/people/${child.id}/injuries`, injury, doctor.cookie)).status).toBe(
          409,
        );
        // Only a guardian of the child can give consent; coaches and athletes cannot record it.
        const grant = { grantedByPersonId: parent.id, grantedOn: TODAY };
        const athlete = await t.userWith([clubWide("athlete")]);
        expect((await post(consent, grant, athlete.cookie)).status).toBe(403);
        expect(
          (await post(consent, { ...grant, grantedByPersonId: stranger.id }, staff.cookie)).status,
        ).toBe(409);
        expect((await post(consent, grant, staff.cookie)).status).toBe(201);
        expect((await post(consent, grant, staff.cookie)).status).toBe(409);

        expect((await post(`/people/${child.id}/injuries`, injury, doctor.cookie)).status).toBe(
          201,
        );
        const status = await json<{ consent: { required: boolean; grantedOn: string } }>(
          await get(consent, staff.cookie),
        );
        expect(status.consent).toMatchObject({ required: true, grantedOn: TODAY });

        // Withdrawing blocks new records; existing ones stay readable until M17 erasure.
        expect((await post(`${consent}/revoke`, {}, staff.cookie)).status).toBe(200);
        expect((await post(`${consent}/revoke`, {}, staff.cookie)).status).toBe(404);
        expect((await post(`/people/${child.id}/injuries`, injury, doctor.cookie)).status).toBe(
          409,
        );
        const records = await json<{ injuries: unknown[] }>(
          await get(`/people/${child.id}/records`, doctor.cookie),
        );
        expect(records.injuries).toHaveLength(1);
      }));

    it("shows coaches only a derived status for their own team", () =>
      withRollback(async (db) => {
        const { t, team, otherTeam, adult, other, post, get, injury } = await setup(db);
        const doctor = await t.userWith([clubWide("doctor")]);
        await post(`/people/${adult.id}/injuries`, injury, doctor.cookie);
        await post(
          `/people/${other.id}/injuries`,
          { ...injury, availability: "limited" },
          doctor.cookie,
        );

        const coach = await t.userWith([coachOf(team.id)]);
        expect((await get("/availability")).status).toBe(401);
        const mine = await json<{ people: Record<string, unknown>[] }>(
          await get(`/availability?teamId=${team.id}`, coach.cookie),
        );
        expect(mine.people).toEqual([
          { personId: adult.id, fullName: adult.fullName, status: "unavailable" },
        ]);
        expect(JSON.stringify(mine)).not.toContain("Joelho");
        expect((await get(`/availability?teamId=${otherTeam.id}`, coach.cookie)).status).toBe(403);
        // Without a team a scoped coach gets their own teams' overview.
        const overview = await json<{ people: { personId: string }[] }>(
          await get("/availability", coach.cookie),
        );
        expect(overview.people.map((p) => p.personId)).toEqual([adult.id]);

        const staff = await t.userWith([clubWide("staff")]);
        expect((await get("/availability", staff.cookie)).status).toBe(403);
        const admin = await t.userWith([clubWide("admin")]);
        const all = await json<{ people: { status: string }[] }>(
          await get("/availability", admin.cookie),
        );
        expect(all.people.map((p) => p.status).sort()).toEqual(["limited", "unavailable"]);
      }));
  });
}

describeDb("health helpers", () => {
  it("derives availability from open injuries", () => {
    expect(deriveAvailability([])).toBe("available");
    expect(deriveAvailability([{ status: "cleared", availability: "unavailable" }])).toBe(
      "available",
    );
    expect(deriveAvailability([{ status: "active", availability: "limited" }])).toBe("limited");
    expect(deriveAvailability([{ status: "return_to_play", availability: "unavailable" }])).toBe(
      "limited",
    );
    expect(
      deriveAvailability([
        { status: "active", availability: "limited" },
        { status: "active", availability: "unavailable" },
      ]),
    ).toBe("unavailable");
  });

  it("counts whole years", () => {
    expect(ageOn("2008-10-17", "2026-10-16")).toBe(17);
    expect(ageOn("2008-10-16", "2026-10-16")).toBe(18);
  });
});
