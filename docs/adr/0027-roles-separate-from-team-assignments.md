# ADR 0027: Roles are capabilities; teams come from staff assignments

- Status: Accepted (Pedro, 2026-10-25: "having a trainer role and being the trainer to a specific thing are separate concepts; you can be a trainer to multiple teams")
- Date: 2026-10-25
- Amends: ADR 0003 (scopes of `coach` and `team_manager`)

## Context

`role_assignments` carried a team or class for `coach` and `team_manager`, so "is a coach" and
"coaches this team" were one row. Giving the role meant picking a team, a coach of three teams
needed three role rows, and a login could not be a coach before someone chose a team.
`staff_assignments` (person, function, team or class, season, dates) already records who works
with which team, so the same fact lived in two places.

## Decision

- `role_assignments(user_id, role)` is a plain capability, unique per user and role. No team,
  no class. Every role is granted the same way.
- Which teams or classes a coach or delegado works with is read from `staff_assignments` of the
  user's own person (the `owner` link in `user_persons`, ADR 0024). A person can have any number
  of them, each with dates.
- `loadPrincipal` turns the two into the `RoleGrant[]` that authorization already uses
  (`{ role, teamId, classId }`), so `hasPermission` and every route stay as they are:
  - non-scoped roles: one club-wide grant;
  - `coach`: one grant per current assignment with function head, assistant, goalkeeper or
    fitness coach;
  - `team_manager`: one grant per current assignment with function `team_manager`.
  "Current" means the season is the current one (or contains today) and today is inside the
  assignment's own dates. A scoped role with no current assignment, or on a login with no
  person, grants nothing yet: the menus stay empty until the person is assigned.
- The role alone never gives access to a team, and an assignment alone never gives a role.
- API: `RoleGrantInput` is `{ role }`; `UserRole` lists the names of the teams it currently
  reaches. Assigning someone to a team is `POST /api/staff-assignments` (`teams.write`), shown
  on the user screen.

## Migration (0038)

Existing scoped role rows keep their meaning: each becomes a `staff_assignments` row for the
user's person (head coach or team manager, in the team's or class's own season, skipped when an
equivalent exists). A login with a scoped role and no person gets a person named after the
login, linked as owner. Duplicate role rows collapse to one, then the team and class columns and
the scope check are dropped. Pending invitations keep their roles without a scope and, when they
name a person, get the assignment too.

## Consequences

- One place per fact; "coach of two teams" is two assignments, not two roles.
- Staff records must be right for access to work, so the team screen and the user screen are
  where an administrator maintains them.
- The same split applies to any future role that works on one team (for example a scout of one
  age group): add its functions to the map in `packages/shared/src/roles.ts`.
