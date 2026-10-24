import { permissionsOf } from "@rsc/shared";
import { canOpenTab, firstTab, moreItems, TABS } from "./navigation";

const grantsOf = (role: Parameters<typeof permissionsOf>[0][number]["role"]) =>
  permissionsOf([{ role, teamId: null, classId: null }]);
const keys = (items: { key: string }[]) => items.map((i) => i.key);

it("keeps the bottom bar to reservations, scouting, profile and settings", () => {
  expect(TABS.filter((t) => "bar" in t && t.bar).map((t) => t.name)).toEqual([
    "bookings",
    "scouting",
    "account",
    "more",
  ]);
});

describe("modules", () => {
  it("hides screens of modules that are off, whatever the permissions", () => {
    expect(canOpenTab("events", grantsOf("staff"), ["reservations"])).toBe(false);
    expect(canOpenTab("events", grantsOf("staff"), ["events"])).toBe(true);
    expect(keys(moreItems(grantsOf("admin"), ["users"]).club)).toEqual([]);
    expect(keys(moreItems(grantsOf("admin"), ["users"]).management)).toEqual(["users"]);
  });

  it("lands on the first bar tab the user can open when Home is off", () => {
    expect(firstTab(grantsOf("staff"), ["reservations", "settings"])).toBe("/bookings");
    expect(firstTab([], ["settings"])).toBe("/more");
  });
});

describe("tabs", () => {
  it("shows user administration only to admins", () => {
    expect(canOpenTab("users", grantsOf("admin"))).toBe(true);
    expect(canOpenTab("users", grantsOf("member"))).toBe(false);
    expect(canOpenTab("index", [])).toBe(true);
    expect(canOpenTab("more", [])).toBe(true);
    expect(canOpenTab("account", [])).toBe(true);
  });
});

it("shows people and teams to roles that may read them", () => {
  expect(canOpenTab("people", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("teams", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("people", grantsOf("athlete"))).toBe(false);
  expect(canOpenTab("teams", grantsOf("member"))).toBe(false);
});

it("shows bookings to roles that read the calendar, including team coaches", () => {
  expect(canOpenTab("bookings", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("bookings", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("bookings", grantsOf("athlete"))).toBe(false);
});

it("shows incidents to roles that read incidents", () => {
  expect(canOpenTab("incidents", grantsOf("staff"))).toBe(true);
  expect(canOpenTab("incidents", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("incidents", grantsOf("stores"))).toBe(false);
  expect(canOpenTab("incidents", grantsOf("athlete"))).toBe(false);
});

it("shows health to clinical roles and to roles that see availability", () => {
  expect(canOpenTab("health", grantsOf("physio"))).toBe(true);
  expect(canOpenTab("health", grantsOf("coach"))).toBe(true);
  expect(canOpenTab("health", grantsOf("treasurer"))).toBe(false);
  expect(canOpenTab("health", grantsOf("athlete"))).toBe(false);
});

describe("the Mais screen", () => {
  it("lists health for clinical roles and those who see availability, not for the treasurer", () => {
    expect(keys(moreItems(grantsOf("physio")).management)).toContain("health");
    expect(keys(moreItems(grantsOf("treasurer")).management)).not.toContain("health");
  });

  it("opens the audit log and the privacy requests for admins only", () => {
    const admin = moreItems(grantsOf("admin")).management;
    expect(keys(admin)).toEqual(expect.arrayContaining(["audit", "privacy"]));
    expect(admin.find((i) => i.key === "privacy")?.href).toBe("/privacy/requests");
    expect(keys(moreItems(grantsOf("staff")).management)).not.toContain("privacy");
  });

  it("lists only the permission-free screens for a user without permissions", () => {
    expect(keys(moreItems([]).club)).toEqual(["home", "notifications"]);
    expect(moreItems([]).management).toEqual([]);
    expect(moreItems([], [])).toEqual({ club: [], management: [] });
  });
});
