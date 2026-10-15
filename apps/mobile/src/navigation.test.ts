import { permissionsOf } from "@rsc/shared";
import { areasFor, canOpenTab } from "./navigation";

const grantsOf = (role: Parameters<typeof permissionsOf>[0][number]["role"]) =>
  permissionsOf([{ role, teamId: null, classId: null }]);

describe("tabs", () => {
  it("shows user administration only to admins", () => {
    expect(canOpenTab("users", grantsOf("admin"))).toBe(true);
    expect(canOpenTab("users", grantsOf("member"))).toBe(false);
    expect(canOpenTab("index", [])).toBe(true);
    expect(canOpenTab("account", [])).toBe(true);
  });
});

describe("home areas", () => {
  it("lists health only for clinical roles, never for admin", () => {
    expect(areasFor(grantsOf("physio"))).toContain("health");
    expect(areasFor(grantsOf("admin"))).not.toContain("health");
  });

  it("lists nothing for a user without permissions", () => {
    expect(areasFor([])).toEqual([]);
  });
});
