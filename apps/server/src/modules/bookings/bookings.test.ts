import { toLisbon } from "@rsc/shared";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { ApiError } from "../../http/errors.js";
import { describeDb, withRollback } from "../../test/db.js";
import { makeBooking, makeDepartment, makeOrganisation, makeSpace } from "../../test/factories.js";
import { bookings, spaces } from "./schema.js";
import {
  buildIcs,
  conflictingSpaceIds,
  createBookings,
  createSpace,
  findConflicts,
  listBookings,
  occurrences,
  syncParts,
  updateBooking,
  updateSpace,
} from "./service.js";

const at = (iso: string) => new Date(iso);
const base = {
  activity: "training" as const,
  title: null,
  targetGroup: null,
  expectedAttendance: null,
  notes: null,
  teamId: null,
  status: "confirmed" as const,
  repeat: null,
};

async function setup(db: Parameters<Parameters<typeof withRollback>[0]>[0]) {
  const org = await makeOrganisation(db);
  const dept = await makeDepartment(db, org.id);
  const campo2 = await makeSpace(db);
  const campo3 = await makeSpace(db, { venueId: campo2.venueId });
  const campo23 = await makeSpace(db, { venueId: campo2.venueId, parts: [campo2, campo3] });
  return { dept, campo2, campo3, campo23 };
}

const conflictOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
};

it("repeats weekly at the same Lisbon time across the end of summer time", () => {
  // Tue 2026-10-20 19:00 Lisbon (WEST, UTC+1); clocks go back on Sun 2026-10-25.
  const list = occurrences(
    { startsAt: at("2026-10-20T18:00:00Z"), endsAt: at("2026-10-20T19:30:00Z") },
    { everyWeeks: 1, until: "2026-11-10" },
  );
  expect(list).toHaveLength(4);
  expect(list.map((o) => toLisbon(o.startsAt).hour)).toEqual([19, 19, 19, 19]);
  expect(list[1]?.startsAt.toISOString()).toBe("2026-10-27T19:00:00.000Z");
  expect(toLisbon(list[3]?.endsAt as Date).minute).toBe(30);
});

it("rejects a recurrence that ends before it starts or is too long", () => {
  const range = { startsAt: at("2026-10-20T18:00:00Z"), endsAt: at("2026-10-20T19:00:00Z") };
  expect(() => occurrences(range, { everyWeeks: 1, until: "2026-10-01" })).toThrow(ApiError);
  expect(() => occurrences(range, { everyWeeks: 1, until: "2028-10-01" })).toThrow(ApiError);
});

describeDb("conflicts", () => {
  it("knows which spaces overlap: a field, its parts and the combinations it is in", () =>
    withRollback(async (db) => {
      const { campo2, campo3, campo23 } = await setup(db);
      expect((await conflictingSpaceIds(db, campo2.id)).sort()).toEqual(
        [campo2.id, campo23.id].sort(),
      );
      expect((await conflictingSpaceIds(db, campo23.id)).sort()).toEqual(
        [campo2.id, campo3.id, campo23.id].sort(),
      );
    }));

  it("rejects overlapping bookings of one space but allows back-to-back ones", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const refs = { spaceId: campo2.id, departmentId: dept.id };
      const first = {
        ...base,
        ...refs,
        startsAt: at("2026-11-02T18:00:00Z"),
        endsAt: at("2026-11-02T19:00:00Z"),
      };
      await createBookings(db, first, null);
      const clash = await conflictOf(
        createBookings(
          db,
          { ...first, startsAt: at("2026-11-02T18:30:00Z"), endsAt: at("2026-11-02T20:00:00Z") },
          null,
        ),
      );
      expect(clash.status).toBe(409);
      expect(clash.code).toBe("booking_conflict");
      const next = {
        ...first,
        startsAt: at("2026-11-02T19:00:00Z"),
        endsAt: at("2026-11-02T20:00:00Z"),
      };
      await expect(createBookings(db, next, null)).resolves.toHaveLength(1);
    }));

  it("treats touching ends as free and one minute of overlap as a conflict", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const refs = { spaceId: campo2.id, departmentId: dept.id };
      // 18:00-19:30 UTC held.
      await createBookings(
        db,
        {
          ...base,
          ...refs,
          startsAt: at("2026-11-02T18:00:00Z"),
          endsAt: at("2026-11-02T19:30:00Z"),
        },
        null,
      );
      const range = (from: string, to: string) =>
        findConflicts(db, {
          spaceId: campo2.id,
          startsAt: at(`2026-11-02T${from}:00Z`),
          endsAt: at(`2026-11-02T${to}:00Z`),
        });
      // Starting exactly when it ends, or ending exactly when it starts, does not clash.
      expect(await range("19:30", "21:00")).toEqual([]);
      expect(await range("16:30", "18:00")).toEqual([]);
      // One minute of overlap on either side does.
      expect(await range("19:29", "21:00")).toHaveLength(1);
      expect(await range("16:30", "18:01")).toHaveLength(1);
      // A 1h30 session from 19:00 overlaps; from 19:30 it does not.
      expect(await range("19:00", "20:30")).toHaveLength(1);
    }));

  it("blocks campo 2 while 2+3 is booked, but not campo 3 while campo 2 is", () =>
    withRollback(async (db) => {
      const { dept, campo2, campo3, campo23 } = await setup(db);
      const time = { startsAt: at("2026-11-02T18:00:00Z"), endsAt: at("2026-11-02T19:00:00Z") };
      await makeBooking(db, { spaceId: campo23.id, departmentId: dept.id }, time);
      const request = (spaceId: string) =>
        createBookings(db, { ...base, ...time, spaceId, departmentId: dept.id }, null);
      await conflictOf(request(campo2.id));
      await conflictOf(request(campo3.id));
      // Free it up: campo 3 can be used by itself, then 2+3 is blocked by it.
      await db.delete(bookings);
      await expect(request(campo3.id)).resolves.toHaveLength(1);
      await conflictOf(request(campo23.id));
      await expect(request(campo2.id)).resolves.toHaveLength(1);
    }));

  it("ignores bookings that no longer occupy the space", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const refs = { spaceId: campo2.id, departmentId: dept.id };
      const time = { startsAt: at("2026-11-02T18:00:00Z"), endsAt: at("2026-11-02T19:00:00Z") };
      for (const status of ["cancelled", "voided", "not_confirmed", "to_reschedule"] as const) {
        await makeBooking(db, refs, { ...time, status });
      }
      expect(await findConflicts(db, { spaceId: campo2.id, ...time })).toEqual([]);
    }));

  it("creates a whole series or nothing", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const refs = { spaceId: campo2.id, departmentId: dept.id };
      await makeBooking(db, refs, {
        startsAt: at("2026-11-10T18:00:00Z"),
        endsAt: at("2026-11-10T19:00:00Z"),
      });
      const series = {
        ...base,
        ...refs,
        startsAt: at("2026-11-03T18:00:00Z"),
        endsAt: at("2026-11-03T19:00:00Z"),
        repeat: { everyWeeks: 1, until: "2026-11-24" },
      };
      const error = await conflictOf(createBookings(db, series, null));
      expect(error.issues).toMatchObject([{ conflicts: [{ spaceId: campo2.id }] }]);
      expect(
        await listBookings(db, {
          from: at("2026-11-01T00:00:00Z"),
          to: at("2026-12-01T00:00:00Z"),
        }),
      ).toHaveLength(1);
      // Requested (to_confirm) bookings occupy the space too; unconfirmed series on a free week do not clash.
      const free = await createBookings(
        db,
        { ...series, repeat: { everyWeeks: 2, until: "2026-11-24" } },
        null,
      );
      expect(free).toHaveLength(2);
      expect(new Set(free.map((b) => b.seriesId)).size).toBe(1);
      expect(free[0]?.seriesId).not.toBeNull();
    }));
});

describeDb("updating bookings", () => {
  it("checks conflicts when a booking is confirmed or moved, not when it is cancelled", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const refs = { spaceId: campo2.id, departmentId: dept.id };
      const time = { startsAt: at("2026-11-02T18:00:00Z"), endsAt: at("2026-11-02T19:00:00Z") };
      const held = await makeBooking(db, refs, { ...time, status: "cancelled" });
      await makeBooking(db, refs, time);
      await conflictOf(updateBooking(db, held.id, { status: "confirmed" }) as Promise<unknown>);
      const moved = await makeBooking(db, refs, {
        startsAt: at("2026-11-03T18:00:00Z"),
        endsAt: at("2026-11-03T19:00:00Z"),
      });
      await conflictOf(updateBooking(db, moved.id, time) as Promise<unknown>);
      const [done] =
        (await updateBooking(db, moved.id, { status: "cancelled", actualAttendance: 0 })) ?? [];
      expect(done).toMatchObject({ status: "cancelled", actualAttendance: 0 });
    }));

  it("applies a status to the rest of a series but refuses moving them", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      const series = await createBookings(
        db,
        {
          ...base,
          spaceId: campo2.id,
          departmentId: dept.id,
          startsAt: at("2026-11-03T18:00:00Z"),
          endsAt: at("2026-11-03T19:00:00Z"),
          repeat: { everyWeeks: 1, until: "2026-11-24" },
        },
        null,
      );
      const second = series[1];
      if (!second) throw new Error("series too short");
      await conflictOf(
        updateBooking(db, second.id, {
          applyTo: "following",
          startsAt: at("2026-11-11T18:00:00Z"),
        }) as Promise<unknown>,
      );
      const changed = await updateBooking(db, second.id, {
        applyTo: "following",
        status: "cancelled",
      });
      expect(changed).toHaveLength(3);
      const all = await listBookings(db, {
        from: at("2026-11-01T00:00:00Z"),
        to: at("2026-12-01T00:00:00Z"),
      });
      expect(all.map((b) => b.status)).toEqual([
        "confirmed",
        "cancelled",
        "cancelled",
        "cancelled",
      ]);
    }));

  it("returns null for an unknown booking", () =>
    withRollback(async (db) => {
      expect(
        await updateBooking(db, "00000000-0000-4000-8000-000000000000", { notes: "x" }),
      ).toBeNull();
    }));
});

describeDb("spaces", () => {
  it("only combines plain spaces of the same venue", () =>
    withRollback(async (db) => {
      const { campo2, campo23 } = await setup(db);
      const other = await makeSpace(db);
      const input = {
        venueId: campo2.venueId,
        name: "Combo",
        kind: "field" as const,
        capacity: null,
        divisions: [],
      };
      await conflictOf(createSpace(db, { ...input, componentIds: [other.id] }));
      await conflictOf(createSpace(db, { ...input, componentIds: [campo23.id] }));
      const ok = await createSpace(db, { ...input, componentIds: [campo2.id] });
      expect(ok.componentIds).toEqual([campo2.id]);
    }));
});

describeDb("iCal", () => {
  it("renders escaped, folded UTC events", () =>
    withRollback(async (db) => {
      const { dept, campo2 } = await setup(db);
      await makeBooking(
        db,
        { spaceId: campo2.id, departmentId: dept.id },
        {
          title: `Reunião; direção, ${"longa ".repeat(20)}`,
          status: "to_confirm",
        },
      );
      const items = await listBookings(db, {
        from: at("2026-11-01T00:00:00Z"),
        to: at("2026-12-01T00:00:00Z"),
      });
      const ics = buildIcs(items);
      expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
      expect(ics).toContain("DTSTART:20261102T180000Z");
      expect(ics).toContain("STATUS:TENTATIVE");
      expect(ics).toContain("Reunião; direção\\,");
      for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }));
});

describeDb("pitch parts", () => {
  /** Campo 2 split in halves and thirds, with its parts keyed "A" "B" "1" "2" "3". */
  async function pitch(db: Parameters<Parameters<typeof withRollback>[0]>[0]) {
    const org = await makeOrganisation(db);
    const dept = await makeDepartment(db, org.id);
    const whole = await makeSpace(db);
    await updateSpace(db, whole.id, { divisions: [2, 3] });
    const parts = await db.select().from(spaces).where(eq(spaces.parentId, whole.id));
    const part = (count: number, index: number) => {
      const found = parts.find((p) => p.partCount === count && p.partIndex === index);
      if (!found) throw new Error("part missing");
      return found;
    };
    const slot = {
      startsAt: at("2026-11-02T18:00:00Z"),
      endsAt: at("2026-11-02T19:00:00Z"),
    };
    const book = (spaceId: string) =>
      createBookings(db, { ...base, spaceId, departmentId: dept.id, ...slot }, null);
    const blocked = async (spaceId: string) =>
      (await findConflicts(db, { spaceId, ...slot })).length > 0;
    return { whole, parts, part, book, blocked };
  }

  it("creates one named space per part and switches removed divisions off", () =>
    withRollback(async (db) => {
      const { whole, parts } = await pitch(db);
      expect(parts.map((p) => p.name).sort()).toEqual(
        [
          `${whole.name} · Metade A`,
          `${whole.name} · Metade B`,
          `${whole.name} · Terço 1`,
          `${whole.name} · Terço 2`,
          `${whole.name} · Terço 3`,
        ].sort(),
      );
      expect(parts.every((p) => p.active)).toBe(true);
      await updateSpace(db, whole.id, { divisions: [2] });
      const after = await db.select().from(spaces).where(eq(spaces.parentId, whole.id));
      expect(after.filter((p) => p.active).map((p) => p.partCount)).toEqual([2, 2]);
      // Idempotent: syncing again creates nothing new.
      await syncParts(db, whole.id);
      expect(await db.select().from(spaces).where(eq(spaces.parentId, whole.id))).toHaveLength(5);
    }));

  it("lets a booking of the whole block every part", () =>
    withRollback(async (db) => {
      const { whole, parts, book, blocked } = await pitch(db);
      await book(whole.id);
      for (const p of parts) expect(await blocked(p.id)).toBe(true);
      await conflictOf(book(parts[0]?.id ?? ""));
    }));

  it("lets a booking of a half block the whole and the thirds it touches only", () =>
    withRollback(async (db) => {
      const { whole, part, book, blocked } = await pitch(db);
      await book(part(2, 1).id);
      expect(await blocked(whole.id)).toBe(true);
      expect(await blocked(part(2, 1).id)).toBe(true);
      expect(await blocked(part(3, 1).id)).toBe(true);
      // The second third straddles the middle line, so it touches both halves.
      expect(await blocked(part(3, 2).id)).toBe(true);
      expect(await blocked(part(2, 2).id)).toBe(false);
      expect(await blocked(part(3, 3).id)).toBe(false);
      await expect(book(part(2, 2).id)).resolves.toHaveLength(1);
      await expect(book(part(3, 3).id)).rejects.toBeInstanceOf(ApiError);
    }));

  it("lets thirds be booked side by side and blocks the halves they touch", () =>
    withRollback(async (db) => {
      const { whole, part, book, blocked } = await pitch(db);
      await book(part(3, 1).id);
      await book(part(3, 3).id);
      expect(await blocked(part(3, 2).id)).toBe(false);
      expect(await blocked(whole.id)).toBe(true);
      expect(await blocked(part(2, 1).id)).toBe(true);
      expect(await blocked(part(2, 2).id)).toBe(true);
    }));

  it("does not let one pitch's parts affect another pitch", () =>
    withRollback(async (db) => {
      const { whole, part, book } = await pitch(db);
      const other = await makeSpace(db, { venueId: whole.venueId });
      await book(part(2, 1).id);
      await expect(book(other.id)).resolves.toHaveLength(1);
    }));

  it("keeps a part's bookings when its pitch is moved or its division removed", () =>
    withRollback(async (db) => {
      const { whole, part, book } = await pitch(db);
      const [booking] = await book(part(3, 1).id);
      await updateSpace(db, whole.id, { divisions: [2], name: "Campo X" });
      expect(booking && (await db.select().from(bookings)).length).toBe(1);
      const renamed = await db
        .select()
        .from(spaces)
        .where(eq(spaces.id, part(2, 1).id));
      expect(renamed[0]?.name).toBe("Campo X · Metade A");
    }));

  it("refuses to configure parts directly or to divide a combination", () =>
    withRollback(async (db) => {
      const { whole, part } = await pitch(db);
      await conflictOf(updateSpace(db, part(2, 1).id, { name: "Outra" }));
      const other = await makeSpace(db, { venueId: whole.venueId });
      const combo = await makeSpace(db, { venueId: whole.venueId, parts: [other] });
      await conflictOf(updateSpace(db, combo.id, { divisions: [2] }));
      // A part cannot be a component of a combination either.
      await conflictOf(
        createSpace(db, {
          venueId: whole.venueId,
          name: "Combo parts",
          kind: "field",
          capacity: null,
          divisions: [],
          componentIds: [part(2, 1).id],
        }),
      );
    }));

  it("combinations take the parts of their pitches into account", () =>
    withRollback(async (db) => {
      const { whole, part, book, blocked } = await pitch(db);
      const other = await makeSpace(db, { venueId: whole.venueId });
      const combo = await makeSpace(db, { venueId: whole.venueId, parts: [whole, other] });
      await book(part(3, 3).id);
      expect(await blocked(combo.id)).toBe(true);
      expect(await blocked(other.id)).toBe(false);
    }));
});
