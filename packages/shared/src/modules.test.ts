import { describe, expect, it } from "vitest";
import {
  changeModule,
  defaultEnabled,
  MODULE_IDS,
  MODULES,
  type ModuleId,
  resolveModules,
  visibleModules,
} from "./modules.ts";

const rank = { release: 0, beta: 1, alpha: 2 } as const;

describe("catalogue", () => {
  it("only depends on known modules of the same or a higher tier", () => {
    for (const id of MODULE_IDS) {
      for (const dep of MODULES[id].deps) {
        expect(MODULE_IDS, `${id} -> ${dep}`).toContain(dep);
        expect(rank[MODULES[dep as ModuleId].tier]).toBeLessThanOrEqual(rank[MODULES[id].tier]);
      }
    }
  });
});

describe("defaults", () => {
  it("turns release on everywhere, beta on staging only, alpha nowhere", () => {
    expect(defaultEnabled("reservations", "prod")).toBe(true);
    expect(defaultEnabled("scouting", "prod")).toBe(false);
    expect(defaultEnabled("scouting", "staging")).toBe(true);
    expect(defaultEnabled("events", "staging")).toBe(false);
    expect(defaultEnabled("events", "prod")).toBe(false);
    expect(defaultEnabled("events", "dev")).toBe(true);
  });

  it("never turns on planned modules", () => {
    expect(resolveModules("dev").athletes).toBe(false);
  });
});

describe("changeModule", () => {
  it("enabling turns on dependencies", () => {
    const r = changeModule("staging", {}, "transport", true);
    if ("error" in r) throw new Error(r.error);
    const on = resolveModules("staging", r.overrides);
    expect([on.transport, on.callups, on.events, on.persons]).toEqual([true, true, true, true]);
  });

  it("disabling turns off dependents", () => {
    const r = changeModule("staging", {}, "persons", false);
    if ("error" in r) throw new Error(r.error);
    expect(resolveModules("staging", r.overrides).persons).toBe(false);
    const all = changeModule("dev", {}, "persons", false);
    if ("error" in all) throw new Error(all.error);
    const on = resolveModules("dev", all.overrides);
    expect([on.persons, on.callups, on.transport, on.health, on.reservations]).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("a stale override cannot enable a module whose dependency is off", () => {
    expect(resolveModules("dev", { persons: false }).callups).toBe(false);
  });

  it("refuses release modules and modules the stack lacks", () => {
    expect(changeModule("prod", {}, "reservations", false)).toEqual({ error: "module_locked" });
    expect(changeModule("prod", {}, "events", true)).toEqual({ error: "module_unavailable" });
    expect(changeModule("prod", {}, "athletes", true)).toEqual({ error: "module_unavailable" });
  });
});

describe("visibleModules", () => {
  it("shows beta modules in production to testers only", () => {
    const on = { scouting: true };
    expect(visibleModules("prod", on, false)).not.toContain("scouting");
    expect(visibleModules("prod", on, true)).toContain("scouting");
    expect(visibleModules("prod", {}, true)).not.toContain("scouting");
    expect(visibleModules("staging", {}, false)).toContain("scouting");
    expect(visibleModules("prod", {}, false)).toEqual([
      "reservations",
      "settings",
      "users",
      "teams",
    ]);
  });
});
