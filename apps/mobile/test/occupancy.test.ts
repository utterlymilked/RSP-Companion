import {
  type BookingSummary,
  contiguousChain,
  layoutLanes,
  makerOf,
  relatedSpaceIds,
  type SpaceSummary,
  stateAt,
  whoOf,
} from "../src/features/bookings/occupancy";
import {
  partsOf,
  pitchOf,
  placeSpaces,
  planOrder,
  shortName,
} from "../src/features/bookings/planLayout";
import {
  daySlots,
  durationLabel,
  fitDuration,
  freeStarts,
  groupStarts,
} from "../src/features/bookings/slots";
import { monthGrid, shortDayTitle, weekTitle } from "../src/features/bookings/time";

const space = (id: string, name: string, componentIds: string[] = []): SpaceSummary => ({
  id,
  name,
  kind: "field",
  capacity: null,
  active: true,
  componentIds,
  divisions: [],
  parentId: null,
  partCount: null,
  partIndex: null,
});
const part = (id: string, parentId: string, count: number, index: number): SpaceSummary => ({
  ...space(id, `${parentId} ${count}/${index}`),
  parentId,
  partCount: count,
  partIndex: index,
});
const spaces = [
  space("c1", "Campo 1"),
  space("c2", "Campo 2"),
  space("c3", "Campo 3"),
  space("c23", "Campo 2+3", ["c2", "c3"]),
  { ...space("aud", "Auditório"), kind: "auditorium" },
  space("x", "Pavilhão"),
];
const booking = (
  id: string,
  spaceId: string,
  startsAt: string,
  endsAt: string,
  status: BookingSummary["status"] = "confirmed",
): BookingSummary => ({
  id,
  spaceId,
  spaceName: spaceId,
  departmentName: "Direção RSC",
  activity: "training",
  status,
  title: null,
  startsAt: `2026-10-20T${startsAt}:00.000Z`,
  endsAt: `2026-10-20T${endsAt}:00.000Z`,
});
const at = (time: string) => new Date(`2026-10-20T${time}:00.000Z`);

it("links a combined space with its components both ways", () => {
  expect([...relatedSpaceIds("c2", spaces)].sort()).toEqual(["c2", "c23"]);
  expect([...relatedSpaceIds("c23", spaces)].sort()).toEqual(["c2", "c23", "c3"]);
  expect([...relatedSpaceIds("c1", spaces)]).toEqual(["c1"]);
});

it("tells whether a space is free, requested or taken at an instant", () => {
  const list = [
    booking("a", "c23", "17:00", "18:30"),
    booking("b", "c1", "17:30", "18:30", "to_confirm"),
    booking("c", "c1", "19:00", "20:00", "cancelled"),
    booking("d", "c3", "20:00", "21:00"),
  ];
  expect(stateAt("c2", at("17:15"), list, spaces)).toMatchObject({
    state: "busy",
    until: list[0]?.endsAt,
  });
  expect(stateAt("c1", at("17:45"), list, spaces).state).toBe("pending");
  // A cancelled booking never blocks.
  expect(stateAt("c1", at("19:15"), list, spaces)).toEqual({
    state: "free",
    booking: null,
    until: null,
  });
  // Campo 2+3 is free at 19:00 until Campo 3 is taken at 20:00.
  expect(stateAt("c23", at("19:00"), list, spaces)).toMatchObject({
    state: "free",
    until: list[3]?.startsAt,
  });
  // A booking ends exactly when the next state starts.
  expect(stateAt("c2", at("18:30"), list, spaces).state).toBe("free");
});

it("puts overlapping bookings in side-by-side lanes", () => {
  const laid = layoutLanes([
    booking("a", "c1", "17:00", "18:00"),
    booking("b", "c2", "17:30", "18:30"),
    booking("c", "c3", "18:00", "19:00"),
    booking("d", "c1", "20:00", "21:00"),
  ]);
  const byId = Object.fromEntries(laid.map((l) => [l.item.id, l]));
  expect(byId.a).toMatchObject({ lane: 0, lanes: 2, group: 0 });
  expect(byId.b).toMatchObject({ lane: 1, lanes: 2, group: 0 });
  // "c" starts when "a" ends, so it reuses lane 0 of the same group.
  expect(byId.c).toMatchObject({ lane: 0, lanes: 2, group: 0 });
  expect(byId.d).toMatchObject({ lane: 0, lanes: 1, group: 1 });
});

it("places the club's spaces on the plan and keeps the rest apart", () => {
  const { areas, combinations, others } = placeSpaces(spaces);
  expect(areas.find((a) => a.short === "Auditório")?.space?.id).toBe("aud");
  expect(areas.find((a) => a.short === "Reuniões 1")?.space).toBeNull();
  expect(combinations.map((c) => c.space.id)).toEqual(["c23"]);
  expect(others.map((s) => s.id)).toEqual(["x"]);
  expect(planOrder(spaces).map((s) => s.id)).toEqual(["c1", "c2", "c3", "c23", "aud", "x"]);
  expect(shortName({ name: "Gabinete de recrutamento/metodologia" })).toBe("Recrut.");
  expect(shortName({ name: "Pavilhão" })).toBe("Pavilhão");
});

it("lays out months and titles", () => {
  const days = monthGrid("2026-10-20");
  expect(days).toHaveLength(42);
  expect(days[0]).toBe("2026-09-28");
  expect(days[41]).toBe("2026-11-08");
  expect(weekTitle("2026-10-12", "pt-PT")).toBe("12 – 18 out.");
  expect(weekTitle("2026-09-28", "pt-PT")).toBe("28 set. – 4 out.");
  expect(shortDayTitle("2026-10-16", "pt-PT")).toBe("Sexta 16 out.");
});

it("offers the half hours free for the whole length, after now", () => {
  const list = [
    booking("a", "c23", "17:00", "18:30"), // 18:00–19:30 in Lisbon (summer time)
    booking("b", "c1", "08:00", "20:00", "cancelled"),
  ];
  const day = "2026-10-20";
  const starts = freeStarts("c2", day, 90, list, spaces, at("15:10"));
  // Now is 16:10 in Lisbon: the first start is 16:30, and 16:30 fits before 18:00.
  expect(starts[0]).toBe(16 * 60 + 30);
  expect(starts).not.toContain(17 * 60);
  expect(starts).toContain(19 * 60 + 30);
  // The last start ends by closing time (23:00).
  expect(starts.at(-1)).toBe(21 * 60 + 30);
  // A cancelled booking never blocks.
  expect(freeStarts("c1", day, 60, list, spaces, at("05:00"))[0]).toBe(8 * 60);
  expect(groupStarts([8 * 60, 13 * 60, 19 * 60]).map((g) => g.key)).toEqual([
    "morning",
    "afternoon",
    "evening",
  ]);
  expect(durationLabel(90)).toBe("1h30");
  expect(durationLabel(120)).toBe("2h");
  expect(durationLabel(30)).toBe("30min");
});

it("greys out only the starts inside a booking, and caps the length before it", () => {
  const list = [{ ...booking("a", "c23", "17:00", "18:30"), teamName: "Sub-13" }];
  const slots = daySlots("c2", "2026-10-20", list, spaces, at("05:00"));
  // 18:00–19:30 Lisbon: only 18:00, 18:30 and 19:00 are inside it; 17:30 and 19:30 are free.
  const taken = slots.filter((s) => s.booking).map((s) => s.start);
  expect(taken).toEqual([18 * 60, 18 * 60 + 30, 19 * 60]);
  expect(slots.find((s) => s.start === 18 * 60)?.booking?.id).toBe("a");
  expect(slots.find((s) => s.start === 19 * 60 + 30)?.booking).toBeNull();
  // 17:30 is free but only half an hour fits before the booking.
  const before = slots.find((s) => s.start === 17 * 60 + 30);
  expect(before?.booking).toBeNull();
  expect(before?.maxDuration).toBe(30);
  expect(fitDuration(before as { maxDuration: number }, 90)).toBe(30);
  expect(fitDuration({ maxDuration: 100 }, 90)).toBe(90);
  expect(fitDuration({ maxDuration: 100 }, 120)).toBe(90);
  // After the booking the session runs until closing at most.
  expect(slots.find((s) => s.start === 19 * 60 + 30)?.maxDuration).toBe(3 * 60 + 30);
  expect(slots.at(-1)?.start).toBe(22 * 60 + 30);
  expect(slots.at(-1)?.maxDuration).toBe(30);
});

it("names who has a booking: the team, else its maker, else the department", () => {
  const base = { teamName: null, createdByName: null, departmentName: "Direção" };
  expect(whoOf({ ...base, teamName: "Sub-13", createdByName: "Rui" })).toBe("Sub-13");
  expect(makerOf({ ...base, teamName: "Sub-13", createdByName: "Rui" })).toBe("Rui");
  expect(whoOf({ ...base, createdByName: "Rui" })).toBe("Rui");
  expect(makerOf({ ...base, createdByName: "Rui" })).toBeNull();
  expect(whoOf(base)).toBe("Direção");
});

it("offers a start exactly when a booking ends, but not one minute earlier", () => {
  // 17:00–18:30Z is 18:00–19:30 in Lisbon (summer time).
  const list = [booking("a", "c2", "17:00", "18:30")];
  const day = "2026-10-20";
  const starts = (minutes: number) => freeStarts("c2", day, minutes, list, spaces, at("05:00"));
  // 1h30 from 19:30 is free; from 19:00 it overlaps the last half hour.
  expect(starts(90)).toContain(19 * 60 + 30);
  expect(starts(90)).not.toContain(19 * 60);
  // A session ending exactly at 18:00 fits before it; one ending 18:30 does not.
  expect(starts(60)).toContain(17 * 60);
  expect(starts(90)).not.toContain(17 * 60);
});

it("chains back-to-back bookings, in the same space or one it combines with", () => {
  const list = [
    booking("a", "c2", "15:00", "16:00"),
    booking("b", "c2", "16:00", "17:30"),
    booking("c", "c23", "17:30", "18:00"),
    booking("d", "c2", "18:30", "19:00"), // a gap before it
    booking("e", "c1", "16:00", "17:00"), // another space
  ];
  const ids = (id: string) =>
    contiguousChain(list.find((b) => b.id === id) as BookingSummary, list, spaces).map((b) => b.id);
  expect(ids("b")).toEqual(["a", "b", "c"]);
  expect(ids("a")).toEqual(["a", "b", "c"]);
  expect(ids("d")).toEqual(["d"]);
  expect(ids("e")).toEqual(["e"]);
});

describe("pitch parts", () => {
  const pitch = { ...space("p", "Campo 2"), divisions: [2, 3] };
  const parts = [
    part("h1", "p", 2, 1),
    part("h2", "p", 2, 2),
    part("t1", "p", 3, 1),
    part("t2", "p", 3, 2),
    part("t3", "p", 3, 3),
  ];
  const all = [space("c1", "Campo 1"), pitch, ...parts];

  it("relates a half to the whole and the thirds it touches, not to the other half", () => {
    expect([...relatedSpaceIds("h1", all)].sort()).toEqual(["h1", "p", "t1", "t2"]);
    expect([...relatedSpaceIds("t3", all)].sort()).toEqual(["h2", "p", "t3"]);
    expect([...relatedSpaceIds("p", all)].sort()).toEqual(["h1", "h2", "p", "t1", "t2", "t3"]);
    expect([...relatedSpaceIds("c1", all)]).toEqual(["c1"]);
  });

  it("keeps parts off the plan and lists them after their pitch", () => {
    const { areas, others } = placeSpaces(all);
    expect(areas.find((a) => a.short === "Campo 2")?.space?.id).toBe("p");
    expect(others).toEqual([]);
    expect(planOrder(all).map((s) => s.id)).toEqual(["c1", "p", "h1", "h2", "t1", "t2", "t3"]);
    expect(partsOf(all, "p", 3).map((s) => s.id)).toEqual(["t1", "t2", "t3"]);
    expect(pitchOf(parts[0] as SpaceSummary, all).id).toBe("p");
  });

  it("shows a pitch taken when one of its halves is booked", () => {
    const booked = [
      {
        id: "b",
        spaceId: "h2",
        spaceName: "x",
        departmentName: "d",
        activity: "training" as const,
        status: "confirmed" as const,
        title: null,
        startsAt: "2026-11-02T18:00:00.000Z",
        endsAt: "2026-11-02T19:00:00.000Z",
      },
    ];
    const at = new Date("2026-11-02T18:30:00.000Z");
    expect(stateAt("p", at, booked, all).state).toBe("busy");
    expect(stateAt("t3", at, booked, all).state).toBe("busy");
    expect(stateAt("h1", at, booked, all).state).toBe("free");
    expect(stateAt("t1", at, booked, all).state).toBe("free");
  });
});
