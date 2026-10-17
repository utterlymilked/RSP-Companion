import { describe, expect, it } from "vitest";
import { fromLisbon } from "./lisbon.ts";
import {
  buildTimetable,
  columnSpace,
  type TimetableBooking,
  type TimetableSpace,
  timetableColumns,
} from "./timetable.ts";

const space = (id: string, name: string, more: Partial<TimetableSpace> = {}): TimetableSpace => ({
  id,
  name,
  kind: "field",
  active: true,
  divisions: [],
  parentId: null,
  partCount: null,
  partIndex: null,
  componentIds: [],
  ...more,
});
const spaces = [
  space("c2", "Campo 2", { divisions: [3] }),
  space("t1", "Campo 2 · Terço 1", { parentId: "c2", partCount: 3, partIndex: 1 }),
  space("t2", "Campo 2 · Terço 2", { parentId: "c2", partCount: 3, partIndex: 2 }),
  space("t3", "Campo 2 · Terço 3", { parentId: "c2", partCount: 3, partIndex: 3 }),
  space("c1", "Campo 1"),
  space("c23", "Campo 2+3", { componentIds: ["c2", "c3"] }),
  space("c3", "Campo 3"),
  space("room", "Sala 1", { kind: "room" }),
  space("old", "Campo velho", { active: false }),
];
const at = (day: string, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  const [year, month, d] = day.split("-").map(Number);
  return fromLisbon({
    year: year as number,
    month: month as number,
    day: d as number,
    hour: hour as number,
    minute: minute as number,
  }).toISOString();
};
const booking = (
  id: string,
  spaceId: string,
  start: string,
  end: string,
  status: TimetableBooking["status"] = "confirmed",
): TimetableBooking => ({
  id,
  spaceId,
  status,
  startsAt: at("2026-10-19", start),
  endsAt: at("2026-10-19", end),
});
const DAYS = ["2026-10-19", "2026-10-20"];

describe("buildTimetable", () => {
  it("makes one sheet per active pitch, in name order, without parts or combinations", () => {
    const sheets = buildTimetable(spaces, [], DAYS, "fields");
    expect(sheets.map((s) => s.space.name)).toEqual(["Campo 1", "Campo 2", "Campo 3"]);
    expect(buildTimetable(spaces, [], DAYS, "rooms").map((s) => s.space.id)).toEqual(["room"]);
  });

  it("splits a divisible pitch into columns marked like the plan", () => {
    const [, campo2] = buildTimetable(spaces, [], DAYS, "fields");
    expect(campo2?.columns).toBe(3);
    expect(campo2?.columnMarks).toEqual(["1", "2", "3"]);
    expect(timetableColumns(space("x", "X", { divisions: [2, 4] }))).toBe(4);
  });

  it("puts a part's booking in its stretch of the pitch", () => {
    const [, campo2] = buildTimetable(
      spaces,
      [booking("b", "t2", "18:00", "19:30")],
      DAYS,
      "fields",
    );
    const [block] = campo2?.days[0]?.blocks ?? [];
    expect(block).toMatchObject({
      startMin: 1080,
      endMin: 1170,
      fromUnit: 4,
      toUnit: 8,
      via: false,
    });
    expect(campo2?.days[1]?.blocks).toEqual([]);
  });

  it("shows a whole-pitch booking across every part and a combination as via", () => {
    const sheets = buildTimetable(
      spaces,
      [booking("w", "c2", "17:00", "18:00"), booking("c", "c23", "20:00", "21:00")],
      DAYS,
      "fields",
    );
    const [campo1, campo2, campo3] = sheets;
    expect(campo2?.days[0]?.blocks.map((b) => [b.fromUnit, b.toUnit, b.via])).toEqual([
      [0, 12, false],
      [0, 12, true],
    ]);
    expect(campo3?.days[0]?.blocks.map((b) => b.booking.id)).toEqual(["c"]);
    expect(campo1?.days[0]?.blocks).toEqual([]);
  });

  it("clips to the range and leaves out cancelled bookings", () => {
    const [campo1] = buildTimetable(
      spaces,
      [
        booking("early", "c1", "16:00", "17:30"),
        booking("late", "c1", "21:30", "23:00"),
        booking("gone", "c1", "18:00", "19:00", "cancelled"),
        booking("outside", "c1", "07:00", "08:00"),
      ],
      DAYS,
      "fields",
    );
    expect(campo1?.days[0]?.blocks.map((b) => [b.booking.id, b.startMin, b.endMin])).toEqual([
      ["early", 1020, 1050],
      ["late", 1290, 1320],
    ]);
  });

  it("puts overlapping requests side by side", () => {
    const [campo1] = buildTimetable(
      spaces,
      [booking("a", "c1", "18:00", "19:00"), booking("b", "c1", "18:30", "19:30", "to_confirm")],
      DAYS,
      "fields",
    );
    expect(campo1?.days[0]?.blocks.map((b) => [b.lane, b.lanes])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });
});

describe("columnSpace", () => {
  it("finds the part a column books", () => {
    expect(columnSpace(spaces[0] as TimetableSpace, spaces, 1).id).toBe("t2");
    expect(columnSpace(spaces[4] as TimetableSpace, spaces, 0).id).toBe("c1");
  });
});
