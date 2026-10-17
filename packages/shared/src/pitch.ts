/**
 * Pitch divisions: how a field (campo) can be booked whole or in parts.
 *
 * A divisible pitch is a normal space (the whole pitch) plus one space per part, created from
 * its `divisions` (e.g. `[2, 3]` = two halves and three thirds). Along the pitch's length it is
 * `PITCH_UNITS` units long; part `i` of `n` covers units `[(i-1)·U/n, i·U/n)`. Two spaces
 * cannot be booked at the same time when their footprints overlap on the same pitch, so:
 * the whole blocks every part; a half blocks the whole and the thirds it touches; two
 * halves, or two thirds, never block each other. Server and app share this code.
 */

/** Divisible by every allowed division, so every part has whole-unit edges. */
export const PITCH_UNITS = 12;
/** Ways a pitch can be split: halves, thirds, quarters. */
export const PITCH_DIVISIONS = [2, 3, 4] as const;
export type PitchDivision = (typeof PITCH_DIVISIONS)[number];

/** The fields of a space that decide what it overlaps with. */
export interface SpaceGeometry {
  id: string;
  /** The whole pitch this space is a part of; null for ordinary spaces and whole pitches. */
  parentId: string | null;
  partCount: number | null;
  partIndex: number | null;
  /** The spaces a combined space is made of (see space_components). */
  componentIds: string[];
}

/** A stretch of one pitch (or of a plain space, which counts as a whole pitch of its own). */
export interface Footprint {
  root: string;
  from: number;
  to: number;
}

/** Units `[from, to)` that part `index` (1-based) of `count` covers. */
export function partSpan(count: number, index: number): { from: number; to: number } {
  const size = PITCH_UNITS / count;
  return { from: (index - 1) * size, to: index * size };
}

/** What a space occupies: its stretch of the pitch, or for a combination its components'. */
export function footprintOf(
  space: SpaceGeometry,
  byId: ReadonlyMap<string, SpaceGeometry>,
): Footprint[] {
  if (space.parentId && space.partCount && space.partIndex) {
    return [{ root: space.parentId, ...partSpan(space.partCount, space.partIndex) }];
  }
  if (space.componentIds.length > 0) {
    return space.componentIds.flatMap((id) => {
      const component = byId.get(id);
      return component ? footprintOf({ ...component, componentIds: [] }, byId) : [];
    });
  }
  return [{ root: space.id, from: 0, to: PITCH_UNITS }];
}

const touches = (a: Footprint[], b: Footprint[]) =>
  a.some((x) => b.some((y) => x.root === y.root && x.from < y.to && y.from < x.to));

/** Every space that cannot be used at the same time as `spaceId`, itself included. */
export function overlappingSpaceIds(spaceId: string, spaces: SpaceGeometry[]): Set<string> {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const mine = byId.get(spaceId);
  if (!mine) return new Set([spaceId]);
  const footprint = footprintOf(mine, byId);
  const result = new Set([spaceId]);
  for (const other of spaces) {
    if (touches(footprint, footprintOf(other, byId))) result.add(other.id);
  }
  return result;
}

/** "Metade A", "Terço 2", "Quarto 4": the part's name next to the pitch's. */
export function partLabel(count: number, index: number): string {
  if (count === 2) return `Metade ${String.fromCharCode(64 + index)}`;
  if (count === 3) return `Terço ${index}`;
  if (count === 4) return `Quarto ${index}`;
  return `Parte ${index}/${count}`;
}

/** Stored name of a part, e.g. "Campo 2 · Terço 1". */
export const partName = (pitchName: string, count: number, index: number) =>
  `${pitchName} · ${partLabel(count, index)}`;

/** The short mark drawn on a part of the plan: "A", "B" for halves, "1".."4" otherwise. */
export const partMark = (count: number, index: number) =>
  count === 2 ? String.fromCharCode(64 + index) : String(index);
