import { describe, expect, it } from "vitest";
import { createIncidentSchema } from "./incidents.ts";

const base = {
  type: "facilities",
  occurredAt: "2026-11-15T12:00:00Z",
  description: "Porta partida",
};

describe("createIncidentSchema origin", () => {
  it("accepts an escalão for a competition and a turma for the school", () => {
    expect(
      createIncidentSchema.safeParse({ ...base, origin: "competition", originGroup: "sub13" })
        .success,
    ).toBe(true);
    expect(
      createIncidentSchema.safeParse({ ...base, origin: "school", originGroup: "T93" }).success,
    ).toBe(true);
    expect(
      createIncidentSchema.safeParse({ ...base, origin: "school", originGroup: "TWF" }).success,
    ).toBe(true);
  });
  it("rejects a group of the other origin or without an origin", () => {
    expect(
      createIncidentSchema.safeParse({ ...base, origin: "school", originGroup: "sub13" }).success,
    ).toBe(false);
    expect(
      createIncidentSchema.safeParse({ ...base, origin: "other", originGroup: "T11" }).success,
    ).toBe(false);
    expect(createIncidentSchema.safeParse({ ...base, originGroup: "sub9" }).success).toBe(false);
  });
});
