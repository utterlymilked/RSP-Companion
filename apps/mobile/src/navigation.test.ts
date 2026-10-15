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

it("shows people and teams tabs to roles that may read them", () => {
  expect(canOpenTab("people", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("teams", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("people", grantsOf("athlete"))).toBe(false);
  expect(canOpenTab("teams", grantsOf("member"))).toBe(false);
});

it("shows the bookings tab to roles that read the calendar, including team coaches", () => {
  expect(canOpenTab("bookings", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("bookings", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("bookings", grantsOf("athlete"))).toBe(false);
});

it("shows the incidents tab to roles that read incidents", () => {
  expect(canOpenTab("incidents", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("incidents", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("incidents", grantsOf("stores"))).toBe(false);
  expect(canOpenTab("incidents", grantsOf("athlete"))).toBe(false);
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
