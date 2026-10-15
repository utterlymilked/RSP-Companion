import { HEALTH_DISCIPLINES, type HealthDiscipline, type Role } from "./roles.ts";

/**
 * Fine-grained permissions. Modules add theirs here as they land; the API checks them with
 * requirePermission() and the web app uses the same matrix to hide what the API would refuse.
 */
export const PERMISSIONS = [
  "users.manage", // invite users, grant and revoke roles, link users to people
  "audit.read",
  "people.read", // general tier (names, teams) of people in scope
  "people.read_personal", // personal tier (contacts, birth dates, identifiers) in scope
  "people.write",
  "teams.read",
  "teams.write",
  "bookings.read", // the rooms and fields calendar (general tier, no personal data)
  "bookings.write", // create and change bookings; team-scoped roles: bookings of their team
  "facilities.write", // venues and spaces
  "availability.read", // derived status (available / limited / unavailable), never the diagnosis
  ...HEALTH_DISCIPLINES.flatMap((d) => [`health.${d}.read`, `health.${d}.write`] as const),
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permission to read or write the health records of one discipline. */
export const healthPermission = (discipline: HealthDiscipline, access: "read" | "write") =>
  `health.${discipline}.${access}` as const satisfies Permission;

const clinical = (discipline: HealthDiscipline): Permission[] => [
  "people.read",
  "people.read_personal",
  "teams.read",
  "bookings.read",
  "availability.read",
  healthPermission(discipline, "read"),
  healthPermission(discipline, "write"),
];

/**
 * The role → permission matrix. Changes here change who can see what: they need review, and
 * the matrix test in apps/server pins the health-tier rules. Rights a person has over their
 * own record and their wards' records (as athlete or guardian) come from the data, not from
 * this table. No role outside the clinical ones reads health data, admin included.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    "users.manage",
    "audit.read",
    "people.read",
    "people.read_personal",
    "people.write",
    "teams.read",
    "teams.write",
    "bookings.read",
    "bookings.write",
    "facilities.write",
    "availability.read",
  ],
  staff: [
    "people.read",
    "people.read_personal",
    "people.write",
    "teams.read",
    "teams.write",
    "bookings.read",
    "bookings.write",
    "facilities.write",
  ],
  treasurer: ["people.read", "people.read_personal", "teams.read", "bookings.read"],
  stores: ["people.read", "teams.read", "bookings.read"],
  coach: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "bookings.write",
    "availability.read",
  ],
  team_manager: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "bookings.write",
    "availability.read",
  ],
  scout: ["people.read", "teams.read", "bookings.read"],
  recruiter: ["people.read", "teams.read", "bookings.read"],
  doctor: clinical("medical"),
  nurse: clinical("medical"),
  physio: clinical("physio"),
  nutritionist: clinical("nutrition"),
  psychologist: clinical("psychology"),
  sociologist: ["people.read", "people.read_personal", "teams.read", "bookings.read"],
  athlete: [],
  guardian: [],
  member: [],
};

/** A role held by a user, club-wide or limited to one team or class. */
export interface RoleGrant {
  role: Role;
  teamId: string | null;
  classId: string | null;
}

/**
 * Where a resource lives, for scoped roles: the teams and classes of the person or record
 * being accessed. Omit it for club-wide resources (only club-wide grants then apply).
 */
export interface AccessScope {
  teamIds: readonly string[];
  classIds: readonly string[];
}

const grantCovers = (grant: RoleGrant, scope: AccessScope | undefined) => {
  if (grant.teamId === null && grant.classId === null) return true;
  if (!scope) return false;
  return (
    (grant.teamId !== null && scope.teamIds.includes(grant.teamId)) ||
    (grant.classId !== null && scope.classIds.includes(grant.classId))
  );
};

/** True when one of `grants` gives `permission` over a resource in `scope`. */
export function hasPermission(
  grants: readonly RoleGrant[],
  permission: Permission,
  scope?: AccessScope,
): boolean {
  return grants.some(
    (grant) => ROLE_PERMISSIONS[grant.role].includes(permission) && grantCovers(grant, scope),
  );
}

/** Every permission a user has anywhere (club-wide or in some team), e.g. to build menus. */
export function permissionsOf(grants: readonly RoleGrant[]): Permission[] {
  const held = new Set(grants.flatMap((grant) => ROLE_PERMISSIONS[grant.role]));
  return PERMISSIONS.filter((permission) => held.has(permission));
}
