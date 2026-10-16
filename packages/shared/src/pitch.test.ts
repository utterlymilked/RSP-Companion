import { describe, expect, it } from "vitest";
import {
  overlappingSpaceIds,
  PITCH_UNITS,
  partLabel,
  partMark,
  partName,
  partSpan,
  type SpaceGeometry,
} from "./pitch.ts";

const plain = (id: string, componentIds: string[] = []): SpaceGeometry => ({
  id,
  parentId: null,
  partCount: null,
  partIndex: null,
  componentIds,
});
const part = (id: string, parentId: string, count: number, index: number): SpaceGeometry => ({
  id,
  parentId,
  partCount: count,
  partIndex: index,
  componentIds: [],
});

/** Campo 2 divisible in halves and thirds, plus a second pitch and a room. */
const spaces = [
  plain("c2"),
  part("h1", "c2", 2, 1),
  part("h2", "c2", 2, 2),
  part("t1", "c2", 3, 1),
  part("t2", "c2", 3, 2),
  part("t3", "c2", 3, 3),
  plain("c3"),
  part("c3h1", "c3", 2, 1),
  plain("room"),
];
const blocks = (id: string) => [...overlappingSpaceIds(id, spaces)].sort();

describe("pitch overlap matrix", () => {
  it("whole pitch blocks every part of itself and nothing else", () => {
    expect(blocks("c2")).toEqual(["c2", "h1", "h2", "t1", "t2", "t3"]);
  });

  it("a half blocks the whole, itself and the thirds it touches", () => {
    expect(blocks("h1")).toEqual(["c2", "h1", "t1", "t2"]);
    expect(blocks("h2")).toEqual(["c2", "h2", "t2", "t3"]);
  });

  it("a third blocks the whole, itself and the halves it touches", () => {
    expect(blocks("t1")).toEqual(["c2", "h1", "t1"]);
    expect(blocks("t2")).toEqual(["c2", "h1", "h2", "t2"]);
    expect(blocks("t3")).toEqual(["c2", "h2", "t3"]);
  });

  it("is symmetric", () => {
    for (const a of spaces) {
      for (const b of overlappingSpaceIds(a.id, spaces)) {
        expect(overlappingSpaceIds(b, spaces).has(a.id)).toBe(true);
      }
    }
  });

  it("keeps other pitches and rooms independent", () => {
    expect(blocks("c3")).toEqual(["c3", "c3h1"]);
    expect(blocks("c3h1")).toEqual(["c3", "c3h1"]);
    expect(blocks("room")).toEqual(["room"]);
  });

  it("a combination occupies what its components occupy", () => {
    const withCombo = [...spaces, plain("c23", ["c2", "c3"])];
    expect([...overlappingSpaceIds("c23", withCombo)].sort()).toEqual(
      ["c2", "c23", "c3", "c3h1", "h1", "h2", "t1", "t2", "t3"].sort(),
    );
    expect(overlappingSpaceIds("t3", withCombo).has("c23")).toBe(true);
    expect(overlappingSpaceIds("room", withCombo).has("c23")).toBe(false);
  });
});

describe("part spans and names", () => {
  it("covers the pitch exactly for every division", () => {
    for (const n of [2, 3, 4]) {
      expect(partSpan(n, 1).from).toBe(0);
      expect(partSpan(n, n).to).toBe(PITCH_UNITS);
      for (let i = 1; i < n; i++) expect(partSpan(n, i).to).toBe(partSpan(n, i + 1).from);
    }
  });

  it("names and marks parts", () => {
    expect(partLabel(2, 2)).toBe("Metade B");
    expect(partLabel(3, 1)).toBe("Terço 1");
    expect(partLabel(4, 4)).toBe("Quarto 4");
    expect(partName("Campo 2", 3, 2)).toBe("Campo 2 · Terço 2");
    expect(partMark(2, 1)).toBe("A");
    expect(partMark(3, 3)).toBe("3");
  });
});
