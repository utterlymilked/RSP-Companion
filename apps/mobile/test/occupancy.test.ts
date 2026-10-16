import {
  type BookingSummary,
  layoutLanes,
  relatedSpaceIds,
  type SpaceSummary,
  stateAt,
} from "../src/features/bookings/occupancy";
import { placeSpaces, planOrder, shortName } from "../src/features/bookings/planLayout";
import { monthGrid, shortDayTitle, weekTitle } from "../src/features/bookings/time";

const space = (id: string, name: string, componentIds: string[] = []): SpaceSummary => ({
  id,
  name,
  kind: "field",
  capacity: null,
  active: true,
  componentIds,
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
