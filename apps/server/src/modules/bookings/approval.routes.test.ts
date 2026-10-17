import { expect, it } from "vitest";
import { clubWide, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import {
  makeDepartment,
  makeOrganisation,
  makeSeason,
  makeSpace,
  makeTeam,
} from "../../test/factories.js";
import { notifications } from "../notifications/schema.js";

async function setup(db: Parameters<Parameters<typeof withRollback>[0]>[0]) {
  const org = await makeOrganisation(db);
  const season = await makeSeason(db);
  const team = await makeTeam(db, { seasonId: season.id, organisationId: org.id });
  const dept = await makeDepartment(db, org.id);
  const space = await makeSpace(db);
  const body = (extra: Record<string, unknown> = {}) => ({
    spaceId: space.id,
    departmentId: dept.id,
    activity: "meeting",
    startsAt: "2026-11-02T18:00:00Z",
    endsAt: "2026-11-02T19:00:00Z",
    ...extra,
  });
  return { team, body, t: testApp(db) };
}
const json = async <T>(res: Response) => (await res.json()) as T;
type Booking = { id: string; status: string };

describeDb("booking approval", () => {
  it("lets a gabinete request, notifies the approvers, and keeps it to its own bookings", () =>
    withRollback(async (db) => {
      const { team, body, t } = await setup(db);
      const direcao = await t.userWith([clubWide("admin")]);
      const doctor = await t.userWith([clubWide("doctor")]);
      const other = await t.userWith([clubWide("scout")]);

      // Asks for "confirmed" but gets a request, and cannot book for a team.
      const res = await t.request("/api/bookings", {
        cookie: doctor.cookie,
        json: body({ status: "confirmed" }),
      });
      expect(res.status).toBe(201);
      const [booking] = (await json<{ bookings: Booking[] }>(res)).bookings;
      expect(booking?.status).toBe("to_confirm");
      expect(
        (
          await t.request("/api/bookings", {
            cookie: doctor.cookie,
            json: body({
              teamId: team.id,
              startsAt: "2026-11-03T18:00:00Z",
              endsAt: "2026-11-03T19:00:00Z",
            }),
          })
        ).status,
      ).toBe(403);

      const inbox = await db.select().from(notifications);
      expect(
        inbox.filter((n) => n.userId === direcao.user.id && n.kind === "booking"),
      ).toHaveLength(1);

      const patch = (cookie: string, json: object) =>
        t.request(`/api/bookings/${booking?.id}`, { method: "PATCH", cookie, json });
      expect((await patch(other.cookie, { status: "cancelled" })).status).toBe(403);
      expect((await patch(doctor.cookie, { status: "confirmed" })).status).toBe(403);

      expect((await patch(direcao.cookie, { status: "confirmed" })).status).toBe(200);
      const after = await db.select().from(notifications);
      expect(
        after.filter((n) => n.userId === doctor.user.id && n.title === "Reserva confirmada"),
      ).toHaveLength(1);
      expect((await patch(doctor.cookie, { status: "cancelled" })).status).toBe(200);
    }));

  it("lets the admin choose which roles approve", () =>
    withRollback(async (db) => {
      const { body, t } = await setup(db);
      const direcao = await t.userWith([clubWide("admin")]);
      const staff = await t.userWith([clubWide("staff")]);
      const coordinator = await t.userWith([clubWide("sociologist")]);
      const me = async (cookie: string) =>
        (await json<{ bookingApprover: boolean }>(await t.request("/api/me", { cookie })))
          .bookingApprover;

      // Default: direção and secretaria.
      expect(await me(staff.cookie)).toBe(true);
      expect(await me(coordinator.cookie)).toBe(false);

      expect(
        (
          await t.request("/api/settings/bookings", {
            method: "PUT",
            cookie: staff.cookie,
            json: { approverRoles: [] },
          })
        ).status,
      ).toBe(403);
      const put = await t.request("/api/settings/bookings", {
        method: "PUT",
        cookie: direcao.cookie,
        json: { approverRoles: ["sociologist"] },
      });
      expect(put.status).toBe(200);
      // Direção always stays an approver; secretaria is out, the sociologist is in.
      expect((await json<{ approverRoles: string[] }>(put)).approverRoles).toEqual([
        "admin",
        "sociologist",
      ]);
      expect(await me(staff.cookie)).toBe(false);
      expect(await me(coordinator.cookie)).toBe(true);

      const asStaff = await t.request("/api/bookings", {
        cookie: staff.cookie,
        json: body({
          status: "confirmed",
          startsAt: "2026-11-05T18:00:00Z",
          endsAt: "2026-11-05T19:00:00Z",
        }),
      });
      expect((await json<{ bookings: Booking[] }>(asStaff)).bookings[0]?.status).toBe("to_confirm");
      const asApprover = await t.request("/api/bookings", {
        cookie: coordinator.cookie,
        json: body({
          status: "confirmed",
          startsAt: "2026-11-04T18:00:00Z",
          endsAt: "2026-11-04T19:00:00Z",
        }),
      });
      expect((await json<{ bookings: Booking[] }>(asApprover)).bookings[0]?.status).toBe(
        "confirmed",
      );
    }));
});
