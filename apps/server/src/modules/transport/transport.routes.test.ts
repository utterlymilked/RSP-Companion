import { expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson, makeSeason, makeTeam } from "../../test/factories.js";
import { guardianships } from "../people/schema.js";
import { teamMembers } from "../teams/schema.js";

const coachOf = (teamId: string) => ({ role: "coach" as const, teamId, classId: null });
const json = async <T>(res: Response) => (await res.json()) as T;
type Ride = {
  id: string;
  seats: number;
  taken: number;
  driverPhone: string | null;
  canManage: boolean;
  passengers: { personId: string }[];
  mine: string[];
};

async function setup(db: Db) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const refs = { seasonId: season.id, organisationId: org.id };
  const [team, otherTeam] = [await makeTeam(db, refs), await makeTeam(db, refs)];
  const [anna, bruno, carla] = [
    await makePerson(db),
    await makePerson(db),
    await makePerson(db, { phone: "+351900000001" }),
  ];
  await db.insert(teamMembers).values([
    { teamId: team.id, personId: anna.id, joinedOn: "2026-09-01" },
    { teamId: team.id, personId: bruno.id, joinedOn: "2026-09-01" },
  ]);
  await db
    .insert(guardianships)
    .values({ guardianId: carla.id, childId: anna.id, relationship: "mother" });
  const t = testApp(db);
  const staff = await t.userWith([clubWide("staff")]);
  const created = await t.request("/api/events", {
    cookie: staff.cookie,
    json: {
      kind: "training",
      teamId: team.id,
      startsAt: "2026-11-07T14:00:00Z",
      endsAt: "2026-11-07T16:00:00Z",
    },
  });
  const event = (await json<{ events: { id: string }[] }>(created)).events[0]?.id as string;
  await t.request(`/api/callups/events/${event}`, { cookie: staff.cookie, json: {} });
  const coach = await t.userWith([coachOf(team.id)]);
  const rides = async (cookie: string) =>
    json<{ rides: Ride[] }>(await t.request(`/api/transport/events/${event}`, { cookie }));
  return { team, otherTeam, anna, bruno, carla, t, staff, coach, event, rides };
}

describeDb("transport API", () => {
  it("lets only the event's managers create vans, and refuses strangers", () =>
    withRollback(async (db) => {
      const { otherTeam, t, coach, event } = await setup(db);
      const url = `/api/transport/events/${event}/rides`;
      const body = { kind: "club_van", seats: 8, label: "Carrinha 1", pickupPoint: "Sede" };
      expect((await t.request(url, { json: body })).status).toBe(401);
      const other = await t.userWith([coachOf(otherTeam.id)]);
      expect((await t.request(url, { cookie: other.cookie, json: body })).status).toBe(403);
      expect(
        (await t.request(`/api/transport/events/${event}`, { cookie: other.cookie })).status,
      ).toBe(403);
      expect(
        (await t.request(url, { cookie: coach.cookie, json: { ...body, seats: 0 } })).status,
      ).toBe(400);
      expect((await t.request(url, { cookie: coach.cookie, json: body })).status).toBe(201);
    }));

  it("seats passengers up to the seat count and moves them between rides", () =>
    withRollback(async (db) => {
      const { anna, bruno, t, coach, event, rides } = await setup(db);
      const mk = async (seats: number) =>
        (
          await json<{ id: string }>(
            await t.request(`/api/transport/events/${event}/rides`, {
              cookie: coach.cookie,
              json: { kind: "club_van", seats },
            }),
          )
        ).id;
      const [small, big] = [await mk(1), await mk(5)];
      const seat = (ride: string, person: string, method = "PUT") =>
        t.request(`/api/transport/rides/${ride}/passengers/${person}`, {
          cookie: coach.cookie,
          method,
        });
      expect((await seat(small, anna.id)).status).toBe(204);
      expect(await json<{ error: { code: string } }>(await seat(small, bruno.id))).toEqual({
        error: { code: "ride_full" },
      });
      // Seating the same person again is not a second seat; moving frees the first ride.
      expect((await seat(small, anna.id)).status).toBe(204);
      expect((await seat(big, anna.id)).status).toBe(204);
      expect((await seat(small, bruno.id)).status).toBe(204);
      const list = (await rides(coach.cookie)).rides;
      expect(list.map((r) => r.taken).sort()).toEqual([1, 1]);
      // Not called up: refused.
      const stranger = await makePerson(db);
      expect(await json<{ error: { code: string } }>(await seat(big, stranger.id))).toEqual({
        error: { code: "not_called_up" },
      });
      // Shrinking below the passengers is refused.
      const shrink = await t.request(`/api/transport/rides/${small}`, {
        cookie: coach.cookie,
        method: "PATCH",
        json: { seats: 1 },
      });
      expect(shrink.status).toBe(204);
      expect((await seat(big, bruno.id)).status).toBe(204);
      expect((await seat(small, bruno.id, "DELETE")).status).toBe(404);
      const tooSmall = await t.request(`/api/transport/rides/${big}`, {
        cookie: coach.cookie,
        method: "PATCH",
        json: { seats: 1 },
      });
      expect(tooSmall.status).toBe(409);
    }));

  it("lets a guardian offer a carpool and keeps the driver's phone for riders", () =>
    withRollback(async (db) => {
      const { anna, bruno, carla, t, coach, event, rides } = await setup(db);
      const parent = await t.userWith([], { personId: carla.id });
      const athlete = await t.userWith([], { personId: bruno.id });
      const offer = {
        kind: "carpool",
        driverPersonId: carla.id,
        seats: 3,
        pickupPoint: "Café",
      };
      const url = `/api/transport/events/${event}/rides`;
      // Vans, or someone else as driver, are not for participants.
      expect(
        (await t.request(url, { cookie: parent.cookie, json: { ...offer, kind: "club_van" } }))
          .status,
      ).toBe(403);
      expect(
        (
          await t.request(url, {
            cookie: parent.cookie,
            json: { ...offer, driverPersonId: bruno.id },
          })
        ).status,
      ).toBe(403);
      const created = await t.request(url, { cookie: parent.cookie, json: offer });
      expect(created.status).toBe(201);
      const ride = (await json<{ id: string }>(created)).id;

      // Bruno's own phone is not Carla's: before riding he does not see Carla's number.
      let seen = (await rides(athlete.cookie)).rides[0];
      expect(seen?.driverPhone).toBeNull();
      expect(seen?.canManage).toBe(false);
      const join = (cookie: string, person: string) =>
        t.request(`/api/transport/rides/${ride}/passengers/${person}`, { cookie, method: "PUT" });
      expect((await join(athlete.cookie, anna.id)).status).toBe(403);
      expect((await join(athlete.cookie, bruno.id)).status).toBe(204);
      seen = (await rides(athlete.cookie)).rides[0];
      expect(seen?.driverPhone).toBe("+351900000001");
      expect(seen?.passengers.map((p) => p.personId)).toEqual([bruno.id]);

      // The coach sees seats and names but never the phone of a driver they do not ride with.
      const managed = (await rides(coach.cookie)).rides[0];
      expect(managed?.driverPhone).toBeNull();
      expect(managed?.passengers).toHaveLength(1);

      // The driver may remove a passenger; an unrelated athlete may not change the ride.
      expect(
        (
          await t.request(`/api/transport/rides/${ride}/passengers/${bruno.id}`, {
            cookie: parent.cookie,
            method: "DELETE",
          })
        ).status,
      ).toBe(204);
      const patch = (cookie: string, body: object) =>
        t.request(`/api/transport/rides/${ride}`, { cookie, method: "PATCH", json: body });
      expect((await patch(athlete.cookie, { seats: 2 })).status).toBe(403);
      expect((await patch(parent.cookie, { seats: 2 })).status).toBe(204);
      expect((await patch(parent.cookie, { driverPersonId: bruno.id })).status).toBe(403);
      expect(
        (
          await t.request(`/api/transport/rides/${ride}`, {
            cookie: athlete.cookie,
            method: "DELETE",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request(`/api/transport/rides/${ride}`, {
            cookie: parent.cookie,
            method: "DELETE",
          })
        ).status,
      ).toBe(204);
    }));

  it("keeps vans for managers to assign", () =>
    withRollback(async (db) => {
      const { bruno, t, coach, event } = await setup(db);
      const athlete = await t.userWith([], { personId: bruno.id });
      const van = (
        await json<{ id: string }>(
          await t.request(`/api/transport/events/${event}/rides`, {
            cookie: coach.cookie,
            json: { kind: "club_van", seats: 4 },
          }),
        )
      ).id;
      expect(
        (
          await t.request(`/api/transport/rides/${van}/passengers/${bruno.id}`, {
            cookie: athlete.cookie,
            method: "PUT",
          })
        ).status,
      ).toBe(403);
    }));
});
