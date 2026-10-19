import type { ProspectPosition } from "./scouting.ts";

/*
 * Athlete model for scouting sheets (docs/SCOUTING_MODEL.md). Attributes follow the FA "4 Corner
 * Model" (technical, tactical, physical, psychological) on a 1-10 scale; archetypes are weighted
 * attribute sets per position group; heat maps are a coarse 6x3 zone grid.
 */

export const ATTRIBUTE_CORNERS = ["technical", "tactical", "physical", "psychological"] as const;
export type AttributeCorner = (typeof ATTRIBUTE_CORNERS)[number];

export const POSITION_GROUPS = ["gk", "cb", "fb", "mid", "wing", "fwd"] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Rating scale of every attribute. */
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 10;

interface AttributeDef {
  corner: AttributeCorner;
  /** Position groups the attribute is rated for (goalkeepers get their own set). */
  groups: readonly PositionGroup[];
}

const OUTFIELD = ["cb", "fb", "mid", "wing", "fwd"] as const;
const ALL = POSITION_GROUPS;

export const ATTRIBUTES = {
  firstTouch: { corner: "technical", groups: OUTFIELD },
  passing: { corner: "technical", groups: OUTFIELD },
  dribbling: { corner: "technical", groups: OUTFIELD },
  finishing: { corner: "technical", groups: OUTFIELD },
  duels: { corner: "technical", groups: OUTFIELD },
  gkReflexes: { corner: "technical", groups: ["gk"] },
  gkHandling: { corner: "technical", groups: ["gk"] },
  gkAerial: { corner: "technical", groups: ["gk"] },
  gkDistribution: { corner: "technical", groups: ["gk"] },
  gkOneOnOne: { corner: "technical", groups: ["gk"] },
  positioning: { corner: "tactical", groups: ALL },
  vision: { corner: "tactical", groups: OUTFIELD },
  movement: { corner: "tactical", groups: OUTFIELD },
  pressing: { corner: "tactical", groups: OUTFIELD },
  pace: { corner: "physical", groups: OUTFIELD },
  stamina: { corner: "physical", groups: OUTFIELD },
  strength: { corner: "physical", groups: ALL },
  agility: { corner: "physical", groups: ALL },
  composure: { corner: "psychological", groups: ALL },
  workRate: { corner: "psychological", groups: ALL },
  coachability: { corner: "psychological", groups: ALL },
} as const satisfies Record<string, AttributeDef>;
export type AttributeKey = keyof typeof ATTRIBUTES;
export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES) as AttributeKey[];

export type Scores = Partial<Record<AttributeKey, number>>;

export const attributesFor = (group: PositionGroup): AttributeKey[] =>
  ATTRIBUTE_KEYS.filter((k) => (ATTRIBUTES[k].groups as readonly PositionGroup[]).includes(group));

export const attributesOfCorner = (group: PositionGroup, corner: AttributeCorner) =>
  attributesFor(group).filter((k) => ATTRIBUTES[k].corner === corner);

/** Position group of one of the form's position codes. */
const GROUP_OF: Record<ProspectPosition, PositionGroup> = {
  gr: "gk",
  dc: "cb",
  dd: "fb",
  de: "fb",
  mdc: "mid",
  mc: "mid",
  mo: "mid",
  md: "wing",
  me: "wing",
  ed: "wing",
  ee: "wing",
  sa: "fwd",
  pl: "fwd",
};
export const positionGroupOf = (position: ProspectPosition): PositionGroup => GROUP_OF[position];

/** The group a prospect is rated in: the first listed position, else midfield. */
export function groupOfPositions(positions: readonly string[] | null | undefined): PositionGroup {
  const first = positions?.find((p): p is ProspectPosition => Object.hasOwn(GROUP_OF, p));
  return first ? positionGroupOf(first) : "mid";
}

export const ARCHETYPES = {
  sweeperKeeper: { groups: ["gk"], key: ["gkDistribution", "positioning", "composure", "agility"] },
  shotStopper: { groups: ["gk"], key: ["gkReflexes", "gkHandling", "gkOneOnOne", "agility"] },
  commandingKeeper: { groups: ["gk"], key: ["gkAerial", "gkHandling", "strength", "composure"] },
  ballPlayingDefender: {
    groups: ["cb"],
    key: ["passing", "vision", "composure", "firstTouch"],
  },
  stopper: { groups: ["cb", "fb"], key: ["duels", "strength", "pressing", "positioning"] },
  sweeper: { groups: ["cb"], key: ["pace", "positioning", "vision", "composure"] },
  attackingFullBack: { groups: ["fb"], key: ["pace", "stamina", "dribbling", "passing"] },
  invertedFullBack: { groups: ["fb"], key: ["passing", "vision", "firstTouch", "positioning"] },
  deepPlaymaker: { groups: ["mid"], key: ["passing", "vision", "composure", "positioning"] },
  boxToBox: { groups: ["mid"], key: ["stamina", "pressing", "strength", "movement"] },
  ballWinner: { groups: ["mid"], key: ["duels", "pressing", "strength", "workRate"] },
  advancedPlaymaker: {
    groups: ["mid", "wing"],
    key: ["vision", "passing", "dribbling", "firstTouch"],
  },
  speedWinger: { groups: ["wing"], key: ["pace", "dribbling", "agility", "stamina"] },
  insideForward: {
    groups: ["wing", "fwd"],
    key: ["finishing", "movement", "dribbling", "agility"],
  },
  poacher: { groups: ["fwd"], key: ["finishing", "movement", "composure", "positioning"] },
  targetMan: { groups: ["fwd"], key: ["strength", "duels", "finishing", "positioning"] },
  falseNine: { groups: ["fwd"], key: ["passing", "vision", "firstTouch", "dribbling"] },
  pressingForward: { groups: ["fwd"], key: ["pressing", "stamina", "workRate", "pace"] },
} as const satisfies Record<
  string,
  { groups: readonly PositionGroup[]; key: readonly AttributeKey[] }
>;
export type ArchetypeKey = keyof typeof ARCHETYPES;
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as [ArchetypeKey, ...ArchetypeKey[]];

export const archetypesFor = (group: PositionGroup): ArchetypeKey[] =>
  ARCHETYPE_KEYS.filter((k) => (ARCHETYPES[k].groups as readonly PositionGroup[]).includes(group));

/** Mean of the rated attributes per key, over any number of score sets (reports). */
export function averageScores(sets: readonly Scores[]): Scores {
  const out: Scores = {};
  for (const key of ATTRIBUTE_KEYS) {
    const vals = sets.map((s) => s[key]).filter((v): v is number => typeof v === "number");
    if (vals.length > 0)
      out[key] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Overall score (1-10): mean of the attributes rated for the group, or null when none. */
export function overallScore(scores: Scores, group: PositionGroup): number | null {
  const vals = attributesFor(group)
    .map((k) => scores[k])
    .filter((v): v is number => typeof v === "number");
  return vals.length === 0 ? null : Math.round(mean(vals) * 10) / 10;
}

/** Mean per corner (the 4-axis summary radar); corners without ratings are omitted. */
export function cornerScores(
  scores: Scores,
  group: PositionGroup,
): Partial<Record<AttributeCorner, number>> {
  const out: Partial<Record<AttributeCorner, number>> = {};
  for (const corner of ATTRIBUTE_CORNERS) {
    const vals = attributesOfCorner(group, corner)
      .map((k) => scores[k])
      .filter((v): v is number => typeof v === "number");
    if (vals.length > 0) out[corner] = Math.round(mean(vals) * 10) / 10;
  }
  return out;
}

/** Archetypes of the group ranked by fit (mean of their key attributes); needs 3 of the 4 rated. */
export function rankArchetypes(
  scores: Scores,
  group: PositionGroup,
): { archetype: ArchetypeKey; fit: number }[] {
  const ranked: { archetype: ArchetypeKey; fit: number }[] = [];
  for (const archetype of archetypesFor(group)) {
    const vals = ARCHETYPES[archetype].key
      .map((k) => scores[k])
      .filter((v): v is number => typeof v === "number");
    if (vals.length >= 3) ranked.push({ archetype, fit: Math.round(mean(vals) * 10) / 10 });
  }
  return ranked.sort((a, b) => b.fit - a.fit);
}

/** Share (0-100) of `pool` strictly below `value`, counting ties as half. */
export function percentileIn(pool: readonly number[], value: number): number {
  if (pool.length === 0) return 50;
  const below = pool.filter((v) => v < value).length;
  const equal = pool.filter((v) => v === value).length;
  return Math.round(((below + equal / 2) / pool.length) * 100);
}

/** Heat map: 6 zones along the pitch (own goal to opponent's) by 3 across (left to right). */
export const HEAT_COLS = 6;
export const HEAT_ROWS = 3;
export const HEAT_ZONES = HEAT_COLS * HEAT_ROWS;
export const HEAT_MAX = 3;

/** Mean of zone grids (each `HEAT_ZONES` long, row-major), or null when there are none. */
export function averageHeat(grids: readonly number[][]): number[] | null {
  if (grids.length === 0) return null;
  return Array.from({ length: HEAT_ZONES }, (_, i) => mean(grids.map((g) => g[i] ?? 0)));
}

/**
 * Bins pitch coordinates (0-100 along and across, as in the Wyscout and Opta feeds) into a zone
 * grid with 0-3 intensity, for when a data provider supplies touch locations.
 */
export function heatFromPoints(points: readonly { x: number; y: number }[]): number[] {
  const counts = new Array<number>(HEAT_ZONES).fill(0);
  for (const { x, y } of points) {
    const col = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor((x / 100) * HEAT_COLS)));
    const row = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor((y / 100) * HEAT_ROWS)));
    const zone = row * HEAT_COLS + col;
    counts[zone] = (counts[zone] ?? 0) + 1;
  }
  const max = Math.max(...counts);
  return counts.map((c) => (max === 0 ? 0 : Math.round((c / max) * HEAT_MAX)));
}

/** Portuguese NIF: 9 digits, first digit 1-9, mod-11 check digit. */
export function isValidNif(nif: string): boolean {
  if (!/^[1-9]\d{8}$/.test(nif)) return false;
  const sum = [...nif.slice(0, 8)].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return Number(nif[8]) === (check >= 10 ? 0 : check);
}

/** Lower-case, accent-free, single-spaced name for matching. */
export const normaliseName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Similarity (0-1) of two person names: shared tokens over the shorter name, so that
 * "João Silva" matches "João Pedro Silva Santos". First and last tokens count extra.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = normaliseName(a).split(" ").filter(Boolean);
  const tb = normaliseName(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const shared = ta.filter((t) => tb.includes(t)).length;
  let score = shared / Math.min(ta.length, tb.length);
  if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) score = Math.max(score, 0.95);
  if (ta[0] !== tb[0] && ta[ta.length - 1] !== tb[tb.length - 1]) score *= 0.6;
  return Math.min(1, score);
}
