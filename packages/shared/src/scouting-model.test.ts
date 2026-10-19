import { describe, expect, it } from "vitest";
import {
  averageScores,
  groupOfPositions,
  heatFromPoints,
  isValidNif,
  nameSimilarity,
  percentileIn,
  rankArchetypes,
} from "./scouting-model.ts";

describe("scouting model", () => {
  it("checks the NIF check digit", () => {
    expect(isValidNif("999999990")).toBe(true);
    expect(isValidNif("999999991")).toBe(false);
    expect(isValidNif("12345678")).toBe(false);
    expect(isValidNif("023456789")).toBe(false);
  });

  it("matches names across accents and middle names", () => {
    expect(nameSimilarity("João Silva", "Joao Pedro Silva Santos")).toBeGreaterThan(0.9);
    expect(nameSimilarity("João Silva", "Maria Costa")).toBeLessThan(0.3);
  });

  it("averages scores, ranks archetypes needing 3 of 4 key attributes, and groups positions", () => {
    expect(averageScores([{ passing: 6 }, { passing: 9, vision: 4 }])).toEqual({
      passing: 7.5,
      vision: 4,
    });
    const ranked = rankArchetypes(
      { finishing: 9, movement: 8, composure: 8, positioning: 7 },
      "fwd",
    );
    expect(ranked[0]?.archetype).toBe("poacher");
    expect(rankArchetypes({ finishing: 9 }, "fwd")).toEqual([]);
    expect(groupOfPositions(["ed", "pl"])).toBe("wing");
    expect(groupOfPositions([])).toBe("mid");
  });

  it("bins pitch coordinates into zones and ranks percentiles", () => {
    const heat = heatFromPoints([
      { x: 95, y: 10 },
      { x: 96, y: 12 },
      { x: 5, y: 90 },
    ]);
    expect(heat[5]).toBe(3);
    expect(heat[12]).toBe(2);
    expect(percentileIn([1, 2, 3, 4], 3)).toBe(63);
  });
});
