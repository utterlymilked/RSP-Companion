# ADR 0003: Authentication, roles and privacy tiers

- Status: Accepted
- Date: 2026-10-15

## Context

M2 decides who can log in, how, and what each person may see. The club confirmed a long role
list that includes clinical staff (doctor, nurse, physio, nutritionist, psychologist), and
most athletes are minors, so health data (GDPR art. 9) of children will be stored from M13.
The rules must hold on the server for every route, be visible to the web app so it can hide
what the API refuses, and be reviewable in a PR. Accounts are few (staff, coaches, some
parents), the club has no IT staff, and email is the only channel we can rely on.

## Decision

**Authentication: Better Auth, configured narrowly** (`apps/server/src/modules/auth/auth.ts`).
- Cookie sessions stored in Postgres (30 days, refreshed daily), email + password (scrypt,
  minimum 10 characters), magic links (10 minutes, hashed, single use) and password reset by
  email (1 hour; resetting revokes every session). Mounted at `/api/auth/*`.
- **No public sign-up.** Accounts come from invitations or from the bootstrap script. Magic
  links never create accounts. Better Auth's own plugins for roles (admin, organization) are
  not used; authorization is ours.
- Better Auth's four tables are declared in our Drizzle schema with our names (`users`,
  `sessions`, `accounts`, `verifications`), UUID keys and `timestamptz`, so they go through
  the normal migration workflow. `users.person_id` links a login to at most one person.
- **Invitations** (`invitations` table): an admin invites an email with roles and an
  optional person; the token (32 random bytes) is emailed once and only its SHA-256 is
  stored; it expires after 7 days and works once. Accepting creates the user (email
  verified by the link), the credential, the role assignments and the person link in one
  transaction. Inviting an email that already has a login is refused: grant roles instead.
- **Admin bootstrap**: `pnpm admin:create --email … --name …` reads the password from stdin,
  creates the user and grants `admin`; it refuses once an admin exists (unless `--force`).
- Email goes through a small `Mailer` (SMTP via nodemailer, console in development, memory in
  tests). Email copy is Portuguese with English below until users have a locale (M3).
- Hardening: Better Auth's origin check and rate limiter (client IP from `X-Forwarded-For`
  behind Caddy); Hono's CSRF check on our routes; `SameSite=Lax` cookies; production
  requires SMTP and an `https` `APP_URL`.

**Authorization: roles → permissions, with scopes** (`packages/shared/src/permissions.ts`).
- `role_assignments(user, role, team?, class?)`. A user can hold several roles. `coach` and
  `team_manager` name exactly one team or one class (turma); every other role is club-wide.
  A check constraint enforces it. Class scope is included because the Escola de Futebol
  coaches turmas, not competition teams.
- Fine-grained permission strings (`people.read`, `users.manage`, `health.physio.read`, …)
  and one `ROLE_PERMISSIONS` matrix in the shared package. `hasPermission(grants, permission,
  scope)` is the single rule: a club-wide grant covers everything, a scoped grant covers a
  resource only if the resource belongs to that team or class. The API uses it through
  `requirePermission(permission, scopeOf?)`; the web app gets the same matrix and
  `GET /api/me` returns the user's roles and effective permissions.
- Rights over **one's own record and one's wards' records** (athlete, guardian) come from
  the data (`users.person_id`, `guardianships`), not from a role.
- Role changes take effect on the next request: grants are read from the database for each
  request, never cached in the session. The last admin cannot be removed.

**Privacy tiers**.
- `general` (names, teams, schedules), `personal` (contacts, birth dates, identifiers),
  `health` (clinical data, M13). Each `persons` column has a tier (ADR 0002); a read
  returns only the columns of the reader's tier (`personTierFor` + `personColumns(tier)`).
- Personal tier: the person, their guardians, and roles with `people.read_personal` in
  scope (admin, staff, treasurer, clinical roles, sociologist club-wide; coach and team
  manager for their own team or class). General tier: `people.read` (adds stores, scout,
  recruiter). Athlete, guardian and member roles carry no permissions over other people.
- Health tier: only the clinical roles, **each for its own discipline** (doctor and nurse:
  medical; physio; nutritionist: nutrition; psychologist: psychology). Admin (direção) has
  no health access. Coaches and team managers get `availability.read` for the derived
  status (M13), never the record. M13 must call `authorizeHealthRead()` before returning any
  health data; it checks the permission and writes the audit entry.

**Audit log** (`audit_log`, append-only from the app): every health read, every personal-tier
read of someone who is not the reader or their ward, role grants and revocations, person
links, invitations and admin bootstrap. Entries hold ids and non-personal details only;
references are set to null when the user or person is deleted, so erasure (M17) leaves no
personal data behind. Admins read it at `GET /api/audit-log`.

## Alternatives considered

- **Better Auth's admin/organization plugins for roles.** They model one role string per
  user (or per organisation) and have no notion of team scope or data tiers; we would still
  need our own checks, with two sources of truth.
- **Lucia / hand-written sessions.** Less dependency, but we would own password hashing,
  reset and magic-link token handling, which is where security bugs live.
- **Postgres row-level security.** Strong isolation, but rules would live in SQL policies the
  web app cannot mirror, and every query would need a per-request role. Revisit for M13's
  health tables if a second layer is wanted.
- **Store `role` on the user row.** Simpler, but a user often holds several roles (a coach
  who is also a guardian and a sócio) and coach rights are per team.
- **Audit every personal read, including lists.** Lists return the general tier only, and
  reads by the person or their guardian are not sensitive; logging them would bury the
  entries that matter.

## Consequences

- New modules add their permissions to `PERMISSIONS` and the matrix in the same PR, and test
  allowed and denied cases per role (and per scope for coach / team manager).
- Adding a role or audit action is a Postgres enum migration.
- Whether coaches and delegados should see guardians' contacts and birth dates is a club
  decision; the default (yes, for their own team or class) is asked in the questionnaire and
  changes by editing the matrix.
- The web app (M3) builds login, invitation (`/invite?token=`), magic-link and reset screens
  on these endpoints, using `better-auth/client`.
- Development data includes two logins (`admin@rsp.test`, `treinador@rsp.test`, password
  `rsp-dev-password`); the seed refuses to run in production.
