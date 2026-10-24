# Modules

Every feature is a module (ADR 0024). The source of truth is `MODULES` in
`packages/shared/src/modules.ts`; this table is the readable copy and the thing to review with
the club. Tier rules: **release** = production, always on; **beta** = production for testers
only, off by default there, on in staging; **alpha** = staging only, off by default.

Priority order for the first production release: reservations, scouting, settings, athletes,
users, persons, profile, registration, approvals.

| Module | Tier | Version | Needs | What it covers (routes `/api/...`) |
| --- | --- | --- | --- | --- |
| reservations | release | 1.0.0 | | Fields and rooms, spaces/pitch parts, bookings, `.ics` feed (`facilities`, `bookings`, `calendar`) |
| settings | release | 1.0.0 | | Club settings (booking approvers) and the Definições tab (`settings`) |
| users | release | 1.0.0 | | Logins, invitations, roles (`users`, `invitations`) |
| teams | release | 1.0.0 | | Teams, classes, staff assignments, lookups; team pickers of reservations (`teams`, `classes`, `staff-assignments`, `lookups`) |
| scouting | beta | 1.0.0 | | Prospects, reports, comparison, clubs list, public trial request (`scouting`, `clubs`, `trial-requests`) |
| persons | beta | 1.0.0 | | People, identities, Excel import (`people`, `imports`) |
| profile | beta | 1.0.0 | | The user's own account screen (appearance, notifications, own privacy) |
| feedback | beta | 1.0.0 | | Tester feedback widget and inbox (`feedback`) |
| athletes | beta | planned | | Athletes independent of persons/users (see data model discussion) |
| registration | beta | planned | profile, persons, approvals | Self-registration with email verification |
| approvals | beta | planned | persons | Approval queue for director/HR |
| home | alpha | 1.0.0 | | Home dashboard (`dashboard`) |
| events | alpha | 1.0.0 | teams, reservations | Trainings, matches, club events (`events`) |
| callups | alpha | 1.0.0 | events, persons | Call-ups, RSVP, attendance (`callups`) |
| transport | alpha | 1.0.0 | events, callups | Rides to matches (`transport`) |
| notifications | alpha | 1.0.0 | | Notification inbox and push (`notifications`) |
| messages | alpha | 1.0.0 | notifications | Announcements (`announcements`) |
| incidents | alpha | 1.0.0 | persons | Incidents and injuries (`incidents`) |
| equipment | alpha | 1.0.0 | persons | Items, stock, loans (`equipment`) |
| documents | alpha | 1.0.0 | persons | Documents and expiry (`documents`) |
| fees | alpha | 1.0.0 | persons | Fees, payments, overdue (`fees`) |
| evaluations | alpha | 1.0.0 | persons | Athlete evaluations (`evaluations`) |
| health | alpha | 1.0.0 | persons | Clinical records by discipline (`health`) |
| privacy | alpha | 1.0.0 | persons | Data-subject requests, export, erasure (`privacy`) |
| audit | alpha | 1.0.0 | | Access log (`audit-log`) |
| cmd | alpha | planned | registration | Chave Móvel Digital identification (roadmap only) |

Notes:

- `teams` is release only because reservations need the team pickers; no team screen is in the
  menu bar. `persons` stays beta although users link to people: the data layer is shared and
  not gated, only the people routes and screens are.
- Without `profile` (beta, off in production by default) ordinary users cannot reach the
  account screen (password, appearance); see the open question to Pedro.
- Changing a module's behaviour: bump its `version` in the catalogue.

## How to work with modules

- Add a feature: one line in `MODULES` (tier, deps), its first API path segment in
  `ROUTE_MODULES` (`apps/server/src/modules/catalogue/middleware.ts`), `module` on its tab or
  More entry in `apps/mobile/src/navigation.ts`, and its name/description in `modules.items.*`
  of both locale files.
- Switch on a stack: Definições > Módulos (needs `modules.manage`; `developer` has it).
- Tests run as stack `dev` (everything on); pass `testApp(db, { stack })` to test gating.
