import type { SpaceSummary } from "./occupancy";

/**
 * Schematic plan of the home complex, drawn on a 100 × PLAN_HEIGHT grid (x and width in
 * percent of the plan's width). It is not to scale: the club has not sent its real floor plans
 * yet (questionnaire question "plantas"). When they arrive, only this file changes.
 *
 * Bookable areas match a space by name (accents and case ignored), so a space renamed or added
 * in the back office without an area here still shows, under the plan, as "Outros espaços".
 */
export const PLAN_HEIGHT = 140;

export type Marking = "full" | "half-left" | "half-right";

export interface PlanArea {
  /** Normalised space names this area stands for (see `normaliseName`). */
  names: string[];
  /** Label drawn on the plan; small rooms use a short one. */
  short: string;
  kind: "field" | "room" | "fixed";
  x: number;
  y: number;
  w: number;
  h: number;
  marking?: Marking;
}

/** Decorations under the areas: the athletics track and the building's outline. */
export const PLAN_BACKDROP = {
  track: { x: 2, y: 2, w: 96, h: 52 },
  building: { x: 2, y: 100, w: 96, h: 38 },
};

export const PLAN_AREAS: PlanArea[] = [
  {
    names: ["campo 1"],
    short: "Campo 1",
    kind: "field",
    x: 13,
    y: 8,
    w: 74,
    h: 40,
    marking: "full",
  },
  {
    names: ["campo 2"],
    short: "Campo 2",
    kind: "field",
    x: 2,
    y: 60,
    w: 47.5,
    h: 36,
    marking: "full",
  },
  {
    names: ["campo 3"],
    short: "Campo 3",
    kind: "field",
    x: 50.5,
    y: 60,
    w: 47.5,
    h: 36,
    marking: "full",
  },
  { names: ["auditorio"], short: "Auditório", kind: "room", x: 3.5, y: 101.5, w: 36, h: 17 },
  {
    names: ["sala de treino de forca", "ginasio"],
    short: "Treino de força",
    kind: "room",
    x: 40.5,
    y: 101.5,
    w: 30,
    h: 17,
  },
  { names: [], short: "Balneários", kind: "fixed", x: 71.5, y: 101.5, w: 25, h: 17 },
  {
    names: ["sala de reunioes 1"],
    short: "Reuniões 1",
    kind: "room",
    x: 3.5,
    y: 119.5,
    w: 21,
    h: 17,
  },
  {
    names: ["sala de reunioes 2"],
    short: "Reuniões 2",
    kind: "room",
    x: 25.5,
    y: 119.5,
    w: 18,
    h: 17,
  },
  {
    names: ["gabinete da direcao"],
    short: "Direção",
    kind: "room",
    x: 44.5,
    y: 119.5,
    w: 17,
    h: 17,
  },
  { names: ["gabinete def"], short: "DEF", kind: "room", x: 62.5, y: 119.5, w: 16, h: 17 },
  {
    names: ["gabinete de recrutamento/metodologia"],
    short: "Recrut.",
    kind: "room",
    x: 79.5,
    y: 119.5,
    w: 17,
    h: 17,
  },
];

/** "Sala de Reuniões  1" → "sala de reunioes 1". */
export function normaliseName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PlacedArea extends PlanArea {
  space: SpaceSummary | null;
}

/** A combined space whose components are all on the plan, drawn as an outline around them. */
export interface PlacedCombination {
  space: SpaceSummary;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Matches the club's spaces to the plan: drawn areas, combinations and the rest. */
export function placeSpaces(spaces: SpaceSummary[]) {
  const active = spaces.filter((s) => s.active && !s.parentId);
  const byName = new Map(active.map((s) => [normaliseName(s.name), s]));
  const areas: PlacedArea[] = PLAN_AREAS.map((area) => ({
    ...area,
    space: area.names.map((n) => byName.get(n)).find(Boolean) ?? null,
  }));
  const placedIds = new Set(areas.flatMap((a) => (a.space ? [a.space.id] : [])));
  const combinations: PlacedCombination[] = [];
  for (const space of active) {
    if (space.componentIds.length < 2) continue;
    const parts = areas.filter((a) => a.space && space.componentIds.includes(a.space.id));
    if (parts.length !== space.componentIds.length) continue;
    const x = Math.min(...parts.map((p) => p.x));
    const y = Math.min(...parts.map((p) => p.y));
    const right = Math.max(...parts.map((p) => p.x + p.w));
    const bottom = Math.max(...parts.map((p) => p.y + p.h));
    combinations.push({ space, x, y, w: right - x, h: bottom - y });
    placedIds.add(space.id);
  }
  const others = active.filter((s) => !placedIds.has(s.id));
  return { areas, combinations, others };
}

/** The active parts of a whole pitch, split `count` ways, in order along the pitch. */
export function partsOf(spaces: SpaceSummary[], pitchId: string, count?: number) {
  return spaces
    .filter((s) => s.active && s.parentId === pitchId && (!count || s.partCount === count))
    .sort(
      (a, b) => (a.partCount ?? 0) - (b.partCount ?? 0) || (a.partIndex ?? 0) - (b.partIndex ?? 0),
    );
}

/** The whole pitch a space belongs to: itself unless it is a part. */
export function pitchOf(space: SpaceSummary, spaces: SpaceSummary[]): SpaceSummary {
  return (space.parentId && spaces.find((s) => s.id === space.parentId)) || space;
}

/**
 * Spaces in plan order (fields first, then rooms as drawn), then the rest by name. Each whole
 * pitch is followed by its parts.
 */
export function planOrder(spaces: SpaceSummary[]): SpaceSummary[] {
  const { areas, combinations, others } = placeSpaces(spaces);
  const drawn = areas.flatMap((a) => (a.space ? [a.space] : []));
  const fields = drawn.filter((s) => s.kind === "field");
  const rooms = drawn.filter((s) => s.kind !== "field");
  return [...fields, ...combinations.map((c) => c.space), ...rooms, ...others].flatMap((s) => [
    s,
    ...partsOf(spaces, s.id),
  ]);
}

/** The short plan label of a space, or its name. */
export function shortName(space: { name: string }): string {
  const key = normaliseName(space.name);
  return PLAN_AREAS.find((a) => a.names.includes(key))?.short ?? space.name;
}
