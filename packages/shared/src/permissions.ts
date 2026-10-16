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
  "events.read", // trainings, matches and club events (general tier, no personal data)
  "events.write", // create and change events; team-scoped roles: events of their team
  "callups.read", // call-ups, RSVPs and attendance of events (team-scoped for coaches)
  "callups.write", // call people up and take attendance; team-scoped roles: their team
  "incidents.read", // incident log: club-wide, or the incidents of the user's team
  "incidents.write", // report incidents; team-scoped roles: for their team
  "incidents.manage", // change status and follow-up of any incident
  "incidents.read_injury", // full detail of injury reports (clinical roles); others see a summary
  "equipment.read", // economato: items, stock and loans (no personal data)
  "equipment.write", // items, stock movements, loans and sales
  "fees.read", // fee plans, charges, payments and overdue reports (club-wide)
  "fees.write", // plans, charges, payments and cancellations
  "evaluations.read", // evaluations and history of athletes in scope
  "evaluations.write", // evaluate athletes in scope
  "evaluations.manage", // evaluation templates (criteria and scale)
  "scouting.read", // external prospects and their reports
  "scouting.write", // create prospects, move them along the pipeline, write reports
  "documents.read", // kind, title and expiry of documents, never the file; scoped roles: their team
  "documents.write", // upload and delete documents (not medical exams) and open their files
  "announcements.write", // send announcements to the club (club-wide) or to a team (scoped roles)
  "availability.read", // derived status (available / limited / unavailable), never the diagnosis
  "health.consent", // record guardian consent for health records (no clinical data)
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
  "events.read",
  "incidents.read",
  "incidents.write",
  "incidents.read_injury",
  "availability.read",
  "health.consent",
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
    "events.read",
    "bookings.write",
    "events.write",
    "callups.read",
    "callups.write",
    "facilities.write",
    "incidents.read",
    "incidents.write",
    "incidents.manage",
    "equipment.read",
    "equipment.write",
    "fees.read",
    "fees.write",
    "evaluations.read",
    "evaluations.write",
    "evaluations.manage",
    "scouting.read",
    "scouting.write",
    "documents.read",
    "documents.write",
    "availability.read",
    "health.consent",
    "announcements.write",
  ],
  staff: [
    "people.read",
    "people.read_personal",
    "people.write",
    "teams.read",
    "teams.write",
    "bookings.read",
    "events.read",
    "bookings.write",
    "events.write",
    "callups.read",
    "callups.write",
    "facilities.write",
    "incidents.read",
    "incidents.write",
    "incidents.manage",
    "equipment.read",
    "equipment.write",
    "evaluations.read",
    "evaluations.write",
    "evaluations.manage",
    "scouting.read",
    "scouting.write",
    "documents.read",
    "documents.write",
    "health.consent",
    "announcements.write",
  ],
  treasurer: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "events.read",
    "fees.read",
    "fees.write",
  ],
  stores: [
    "people.read",
    "teams.read",
    "bookings.read",
    "events.read",
    "incidents.write",
    "equipment.read",
    "equipment.write",
  ],
  coach: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "events.read",
    "bookings.write",
    "events.write",
    "callups.read",
    "callups.write",
    "incidents.read",
    "incidents.write",
    "evaluations.read",
    "evaluations.write",
    "documents.read",
    "availability.read",
    "announcements.write",
  ],
  team_manager: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "events.read",
    "bookings.write",
    "events.write",
    "callups.read",
    "callups.write",
    "incidents.read",
    "incidents.write",
    "evaluations.read",
    "documents.read",
    "availability.read",
    "announcements.write",
  ],
  scout: [
    "people.read",
    "teams.read",
    "bookings.read",
    "events.read",
    "scouting.read",
    "scouting.write",
  ],
  recruiter: [
    "people.read",
    "teams.read",
    "bookings.read",
    "events.read",
    "scouting.read",
    "scouting.write",
  ],
  doctor: clinical("medical"),
  nurse: clinical("medical"),
  physio: clinical("physio"),
  nutritionist: clinical("nutrition"),
  psychologist: clinical("psychology"),
  sociologist: [
    "people.read",
    "people.read_personal",
    "teams.read",
    "bookings.read",
    "events.read",
  ],
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
