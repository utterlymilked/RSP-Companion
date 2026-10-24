import { describe, expect, it } from "vitest";
import { ATHLETE_ATTRIBUTE_TYPES, athleteNameSchema } from "./athletes.ts";

describe("athleteNameSchema", () => {
  it("accepts names with accents, hyphens and apostrophes", () => {
    for (const ok of ["João-Pedro", "D'Ávila", "Zé", "Gui 9", "Jr."]) {
      expect(athleteNameSchema.safeParse(ok).success, ok).toBe(true);
    }
  });
  it("rejects too short, punctuation-only and symbols", () => {
    for (const bad of ["", "A", " - ", "...", "Rui<script>", "x".repeat(161)]) {
      expect(athleteNameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("has a catalogue", () => {
    expect(ATHLETE_ATTRIBUTE_TYPES).toContain("date_of_birth");
  });
});
