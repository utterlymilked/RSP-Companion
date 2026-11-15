import { describe, expect, it } from "vitest";
import { STANDARD_TEAM_NAMES } from "./service.js";

describe("STANDARD_TEAM_NAMES", () => {
  it("lists Sub-7 to Sub-19 and both senior sides", () => {
    expect(STANDARD_TEAM_NAMES).toHaveLength(15);
    expect(STANDARD_TEAM_NAMES[0]).toBe("Sub-7");
    expect(STANDARD_TEAM_NAMES).toContain("Sub-19");
    expect(STANDARD_TEAM_NAMES.slice(-2)).toEqual(["Seniores A", "Seniores B"]);
  });
});
