import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  fromLisbon,
  localDateString,
  localTimeString,
  parseLocal,
  startOfLisbonDay,
  toLisbon,
} from "./lisbon.ts";

describe("Lisbon time", () => {
  it("converts between UTC and Lisbon wall-clock time in winter and summer", () => {
    expect(toLisbon(new Date("2026-01-15T19:00:00Z"))).toMatchObject({ hour: 19, minute: 0 });
    expect(toLisbon(new Date("2026-07-15T19:00:00Z"))).toMatchObject({ hour: 20, minute: 0 });
    const summer = parseLocal("2026-07-15", "20:00");
    expect(summer && fromLisbon(summer).toISOString()).toBe("2026-07-15T19:00:00.000Z");
  });

  it("keeps the wall-clock time when moving days across the clock change", () => {
    const before = parseLocal("2026-10-24", "19:00");
    if (!before) throw new Error("bad date");
    const after = addLocalDays(before, 2); // clocks go back on 2026-10-25
    expect(localDateString(after)).toBe("2026-10-26");
    expect(localTimeString(toLisbon(fromLisbon(after)))).toBe("19:00");
    expect(fromLisbon(after).toISOString()).toBe("2026-10-26T19:00:00.000Z");
  });

  it("finds the start of a Lisbon day and rejects bad dates", () => {
    expect(startOfLisbonDay("2026-07-15")?.toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(startOfLisbonDay("2026-02-30")).toBeNull();
    expect(parseLocal("2026-07-15", "24:00")).toBeNull();
    expect(parseLocal("15/07/2026")).toBeNull();
  });
});
