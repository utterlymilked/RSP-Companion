import { describe, expect, it } from "vitest";
import { roleGrantInputSchema } from "./auth.ts";
import {
  hasPermission,
  healthPermission,
  PERMISSIONS,
  permissionsOf,
  ROLE_PERMISSIONS,
  type RoleGrant,
} from "./permissions.ts";
import {
  HEALTH_DISCIPLINES,
  type HealthDiscipline,
  ROLES,
  type Role,
  SCOPED_ROLE_FUNCTIONS,
} from "./roles.ts";

const club = (role: Role): RoleGrant => ({ role, teamId: null, classId: null });

/** The health-tier rule from ADR 0003: each clinical role, its own discipline only. */
const CLINICAL: Partial<Record<Role, HealthDiscipline>> = {
  doctor: "medical",
  nurse: "medical",
  physio: "physio",
  nutritionist: "nutrition",
  psychologist: "psychology",
};

describe("ROLE_PERMISSIONS", () => {
  it("only lists known permissions", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(permission);
    }
  });

  it.each(ROLES)("gives %s health access to its own discipline only", (role) => {
    for (const discipline of HEALTH_DISCIPLINES) {
      const own = CLINICAL[role] === discipline;
      for (const access of ["read", "write"] as const) {
        expect(hasPermission([club(role)], healthPermission(discipline, access))).toBe(own);
      }
    }
  });

  it("keeps user administration, privacy requests and the audit log to admins", () => {
    for (const role of ROLES) {
      expect(hasPermission([club(role)], "users.manage")).toBe(
        role === "admin" || role === "developer",
      );
      expect(hasPermission([club(role)], "audit.read")).toBe(
        role === "admin" || role === "developer",
      );
      expect(hasPermission([club(role)], "privacy.manage")).toBe(
        role === "admin" || role === "developer",
      );
    }
  });
});

describe("hasPermission with scoped grants", () => {
  const coachOfTeam: RoleGrant = { role: "coach", teamId: "team-1", classId: null };
  const coachOfClass: RoleGrant = { role: "coach", teamId: null, classId: "class-1" };

  it("applies a team grant only to resources of that team", () => {
    expect(hasPermission([coachOfTeam], "people.read", { teamIds: ["team-1"], classIds: [] })).toBe(
      true,
    );
    expect(hasPermission([coachOfTeam], "people.read", { teamIds: ["team-2"], classIds: [] })).toBe(
      false,
    );
    expect(hasPermission([coachOfTeam], "people.read")).toBe(false);
  });

  it("applies a class grant only to resources of that class", () => {
    expect(
      hasPermission([coachOfClass], "people.read", { teamIds: [], classIds: ["class-1"] }),
    ).toBe(true);
    expect(
      hasPermission([coachOfClass], "people.read", { teamIds: ["class-1"], classIds: [] }),
    ).toBe(false);
  });

  it("lets club-wide grants cover any scope", () => {
    expect(hasPermission([club("staff")], "people.read", { teamIds: ["x"], classIds: [] })).toBe(
      true,
    );
  });

  it("never lets a scoped role reach health data", () => {
    const scope = { teamIds: ["team-1"], classIds: [] };
    for (const d of HEALTH_DISCIPLINES) {
      expect(hasPermission([coachOfTeam], healthPermission(d, "read"), scope)).toBe(false);
    }
  });
});

describe("incident permissions", () => {
  it("gives full injury reports to clinical roles only", () => {
    for (const role of ROLES) {
      const clinical = role in CLINICAL;
      expect(hasPermission([club(role)], "incidents.read_injury")).toBe(clinical);
    }
  });

  it("lets only the office manage incidents", () => {
    for (const role of ROLES) {
      expect(hasPermission([club(role)], "incidents.manage")).toBe(
        role === "admin" || role === "staff" || role === "developer",
      );
    }
  });
});

describe("feedback permissions", () => {
  it("lets testers and admins send feedback, and only admins read it", () => {
    for (const role of ROLES) {
      expect(hasPermission([club(role)], "feedback.submit")).toBe(
        role === "tester" || role === "admin" || role === "developer",
      );
      expect(hasPermission([club(role)], "feedback.read")).toBe(
        role === "admin" || role === "developer",
      );
    }
  });
});

describe("permissionsOf", () => {
  it("unions the permissions of every grant, in matrix order", () => {
    expect(permissionsOf([club("stores"), club("physio")])).toEqual([
      "people.read",
      "people.read_personal",
      "teams.read",
      "bookings.read",
      "bookings.request",
      "events.read",
      "incidents.read",
      "incidents.write",
      "incidents.read_injury",
      "equipment.read",
      "equipment.write",
      "availability.read",
      "health.consent",
      "health.physio.read",
      "health.physio.write",
    ]);
    expect(permissionsOf([])).toEqual([]);
  });
});

describe("roleGrantInputSchema", () => {
  it("takes a role only: which teams a coach works with is a staff assignment (ADR 0027)", () => {
    expect(roleGrantInputSchema.parse({ role: "coach" })).toEqual({ role: "coach" });
    expect(roleGrantInputSchema.safeParse({ role: "captain" }).success).toBe(false);
  });

  it("maps each scoped role to the staff functions that give it a team", () => {
    expect(SCOPED_ROLE_FUNCTIONS.coach).toContain("assistant_coach");
    expect(SCOPED_ROLE_FUNCTIONS.team_manager).toEqual(["team_manager"]);
  });
});

describe("developer role", () => {
  it("has every permission except clinical records and injury detail", () => {
    const held = permissionsOf([club("developer")]);
    expect(held.filter((p) => /^health\.\w+\.(read|write)$/.test(p))).toEqual([]);
    expect(held).not.toContain("incidents.read_injury");
    expect(held).toContain("users.manage");
    expect(held).toContain("availability.read");
  });
});
