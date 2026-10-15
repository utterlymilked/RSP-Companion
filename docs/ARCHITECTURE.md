# Architecture

How RSP Companion is put together. Stack rationale is in [ADR 0001](adr/0001-stack.md);
the build plan is in [ROADMAP.md](ROADMAP.md).

## System overview

```
 Phones / desktops (installable PWA)
              │  HTTPS
              ▼
 ┌───────────────────────── VPS (EU) ─────────────────────────┐
 │  Caddy (TLS, compression)                                  │
 │     │                                                      │
 │     ▼                                                      │
 │  app container (Node 22)                                   │
 │   ├─ /api/*  Hono API  ── Drizzle ──►  Postgres 17         │
 │   └─ /*      static web build (apps/web/dist)              │
 └────────────────────────────────────────────────────────────┘
        │ SMTP (email)        │ nightly pg_dump        │ files
        ▼                     ▼                        ▼
   email provider      S3-compatible bucket     S3-compatible bucket
                       (backups)                (documents, later)
```

One deployable image. In development the web app runs on Vite's dev server and proxies
`/api` to the API on port 3000.

## Repository layout

```
apps/
  server/            Hono API (Node). Entry: src/index.ts, routes: src/app.ts
    src/modules/<m>/ one folder per domain module (schema, service, routes, tests)
    src/db/          Drizzle client, schema index, relations, migrator, seed
    src/http/        error type, zod validation helper, app dependencies and context types
    src/mail/        mailer (SMTP / console / memory) and email templates
    src/scripts/     CLI entry points (migrate, seed, create-admin)
    src/test/        test database harness, factories, testApp (signed-in requests)
    drizzle/         generated SQL migrations (committed)
  web/               React + Vite PWA. Entry: src/main.tsx
    src/features/<m>/ one folder per domain module's screens
packages/
  shared/            zod schemas, types, constants, permission matrix shared by both apps
docs/
  ARCHITECTURE.md    this file
  ROADMAP.md         task breakdown and status
  adr/               architecture decision records
.claude/             Claude Code settings, hooks, skills
```

## Module structure (server)

Each domain module (people, teams, events, …) lives in `apps/server/src/modules/<name>/`:

| File | Responsibility |
| --- | --- |
| `schema.ts` | Drizzle tables for the module |
| `routes.ts` | Hono sub-app: HTTP, input validation (zod from `@rsp/shared`), permission checks |
| `service.ts` | Business logic; takes a db handle and plain inputs; no HTTP types |
| `*.test.ts` | Vitest: service tests and route tests against a real Postgres |

`createApp(deps)` in `src/app.ts` builds the app from its dependencies (`db`, `auth`, `mailer`,
`appUrl`), so tests run it on a rolled-back transaction. Each module exports a factory
`<module>Routes(deps)` returning a Hono sub-app, mounted by chaining `.route("/<name>", …)`
so that `AppType` keeps the full route map; the web app's typed client
(`apps/web/src/api.ts`) depends on it.
Request/response schemas live in `packages/shared/src/<module>.ts`.

## Domain model

Core tables from M1; details, constraints and the reasoning in
[ADR 0002](adr/0002-core-data-model.md).

```
organisations ─┬─ departments (gabinetes)
               │
persons ───────┼─ guardianships (guardian ↔ child, one primary)
               ├─ memberships (sócio number per organisation)
               │
seasons ───────┼─ age_groups (escalões: birth-year range, category)
               ├─ classes (turmas: code, monthly fee) ─┬─ class_age_groups
               │                                       ├─ class_schedules (weekday, times)
               │                                       └─ class_members (athletes)
               ├─ teams (competition squads) ── team_members (athletes)
               └─ staff_assignments (person, function, employer, gabinete, team or class)
```

- **Person**: any human the club deals with (athlete, guardian, coach, member). Needs no
  login. Each column has a sensitivity tier (`PERSON_FIELD_TIERS` in `@rsp/shared`).
- **User**: a login (Better Auth) linked to at most one Person; holds RoleAssignments. Minors usually have no
  user; their guardians act for them.
- **Organisation / Department**: the club, SAD, Escola de Futebol, partners and renters, and
  their gabinetes. They employ staff and (M6) book spaces.
- **Season / AgeGroup / Class / Team**: escalões are per season; classes (turmas) are
  training groups with schedule and fee; teams are competition squads.
- **StaffAssignment**: what a person does in a season (coach of a team or class, nutritionist
  in a gabinete). Descriptive only; access rights come from RoleAssignment (M2).
- Later modules add Venue, Space, Booking, Incident, EquipmentItem, Loan,
  EvaluationTemplate, Evaluation, Prospect, Event, Attendance, CallUp, FeePlan, Charge,
  Payment, HealthRecord, AvailabilityStatus, Document, Notification, TransportPlan.
- M2 adds `users`, `sessions`, `accounts`, `verifications` (Better Auth), `role_assignments`,
  `invitations` and `audit_log` ([ADR 0003](adr/0003-auth-roles-privacy.md)).

## Database

- Drizzle ORM over node-postgres. `createDb(url)` in `apps/server/src/db/index.ts` returns
  the handle; services take a `Db` (a database or a transaction) as first argument.
- Schema per module in `src/modules/<m>/schema.ts`, re-exported from `src/db/schema.ts`;
  relations for the query API in `src/db/relations.ts`.
- Migrations: SQL generated by drizzle-kit into `apps/server/drizzle/`, committed, applied by
  `src/scripts/migrate.ts` (`pnpm db:migrate`). How to change the schema:
  `.claude/skills/db-migration/SKILL.md`.
- Tests: the Vitest global setup recreates a `*_test` database and applies all migrations;
  each test runs inside a rolled-back transaction (`withRollback` in `src/test/db.ts`).
- Seed: `pnpm db:seed [--reset]` loads invented development data; refuses in production.

## Roles and permissions

Authentication (who you are) is Better Auth; authorization (what you may do) is ours. Full
reasoning in [ADR 0003](adr/0003-auth-roles-privacy.md).

- **Login**: Better Auth at `/api/auth/*` with cookie sessions in Postgres, email + password,
  magic links and password reset by email. No public sign-up: users come from invitations
  (`POST /api/invitations`, accepted at `POST /api/invitations/accept`) or the bootstrap
  script (`pnpm admin:create`). Email goes through `src/mail/` (SMTP, console in dev).
- **Roles** (club-confirmed list, `ROLES` in `packages/shared/src/roles.ts`): `admin`
  (direção), `staff` (secretaria), `treasurer`, `stores` (economato), `coach`,
  `team_manager` (delegado), `scout`, `recruiter`, clinical roles `doctor`, `nurse`,
  `physio`, `nutritionist`, `psychologist`, plus `sociologist`, `athlete`, `guardian`,
  `member` (sócio). Stored in `role_assignments`; a user can hold several.
- **Scopes**: `coach` and `team_manager` name exactly one team or one class (turma); all
  other roles are club-wide. Rights over one's own record and one's wards' records come from
  `users.person_id` and `guardianships`, not from a role.
- **Permissions** are strings (`people.read`, `users.manage`, `health.physio.read`, …). The
  role → permission matrix and `hasPermission(grants, permission, scope)` live in
  `packages/shared/src/permissions.ts`, so the UI hides what the API would refuse, and
  changes are reviewed in PRs. `GET /api/me` returns the user's roles and permissions.
- **Enforcement**: a middleware in `src/app.ts` loads the principal (user, person, grants)
  for every request; routes use `requirePermission(permission, scopeOf?)` or `principalOf(c)`
  from `src/modules/access/`. Each module's route tests cover allowed and denied cases.
- **Data sensitivity tiers**: `general` (names, teams, schedule), `personal` (contacts,
  birth dates, identifiers), `health` (diagnoses, treatment, nutrition, psychology: GDPR
  art. 9). `personTierFor()` picks the tier for a reader and a person; queries project
  columns with `personColumns(tier)`. Each clinical role reads only `health` data of its own
  discipline, admin none; coaches see a derived **availability status** (M13), never the
  diagnosis. Health reads go through `authorizeHealthRead()`.
- **Audit log** (`audit_log`, `GET /api/audit-log` for admins): every health read, personal
  reads of someone other than oneself or one's ward, role and invitation changes. Ids and
  non-personal details only.

## Cross-cutting concerns

- **i18n**: `pt-PT` default, `en` secondary. UI strings in `apps/web/src/i18n/<locale>.json`.
  API returns error codes, not sentences; the client translates.
- **Dates and money**: store timestamps as `timestamptz` (UTC); display in `Europe/Lisbon`.
  Money as integer cents (`EUR`). Never floats.
- **Privacy (GDPR)**: minimal personal data, EU hosting, guardian consent for minors,
  per-field visibility by role (e.g. health info only to staff/coaches of that team),
  audit log for access to sensitive data (from M2), export and erasure on request (M17).
- **Errors**: API errors are `{ error: { code, message? } }` with proper HTTP status.
- **Config**: environment variables only (`.env` locally, see `.env.example`); validated
  with zod at startup (`apps/server/src/env.ts`).
- **Testing**: unit tests for services; route tests with `app.request()`; integration tests
  run against Postgres (docker compose locally, a service container in CI).

## Standalone repositories

Some pieces are useful beyond this club and change on their own schedule. They go in
separate repos and are consumed as packages:

| Candidate | Why separate | When |
| --- | --- | --- |
| `pt-payments`: Multibanco reference / MB WAY client for a Portuguese payment gateway (e.g. ifthenpay, Eupago) | Reusable by any PT club/association, has its own test suite against a sandbox, isolates provider secrets and webhook signature logic | M12 |
| `fixtures-import`: importer of fixtures/results from the regional football association site | Brittle scraping that breaks independently of the app; run as a scheduled job | Optional, after M11, only if the club wants it |

One-off tools (e.g. importing the club's current spreadsheets) stay in this repo under
`scripts/`.
