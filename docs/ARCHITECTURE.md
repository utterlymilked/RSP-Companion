# Architecture

How RSP Companion is put together. Stack rationale is in [ADR 0001](adr/0001-stack.md)
(server) and [ADR 0004](adr/0004-mobile-client.md) (client); the build plan is in
[ROADMAP.md](ROADMAP.md).

## System overview

```
 iOS / Android app (Expo)        browsers (same code, web build)
              │  HTTPS                    │
              └────────────┬──────────────┘
                           ▼
 ┌───────────────────────── VPS (EU) ─────────────────────────┐
 │  Caddy (TLS, compression)                                  │
 │     │                                                      │
 │     ▼                                                      │
 │  app container (Node 22)                                   │
 │   ├─ /api/*  Hono API  ── Drizzle ──►  Postgres 17         │
 │   └─ /*      static web build (apps/mobile/dist)           │
 └────────────────────────────────────────────────────────────┘
        │ SMTP (email)     │ nightly pg_dump     │ files              │ push (M15)
        ▼                  ▼                     ▼                    ▼
   email provider   S3-compatible bucket  S3-compatible bucket  Expo Push Service
                    (backups)             (documents, later)    → APNs / FCM
```

One deployable image for the server and the web build; the native apps are built with EAS
and published to the App Store and Google Play. In development Expo's dev server runs on
port 8081: the web build there proxies `/api` to the API on port 3000, and phones (Expo Go)
call the API directly at `EXPO_PUBLIC_API_URL`.

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
  mobile/            Expo app for iOS, Android and web. Entry: expo-router (app/_layout.tsx)
    app/             routes (Expo Router): screens, layouts, deep links
    src/features/<m>/ one folder per domain module's components and hooks
    src/api.ts       typed API client; src/auth/ Better Auth client and useMe()
    src/ui/          primitives (Screen, Button, TextField, ListItem); src/theme.ts tokens
    test/            screen tests (Jest + React Native Testing Library)
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
so that `AppType` keeps the full route map; the app's typed client
(`apps/mobile/src/api.ts`) depends on it.
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

## Client (apps/mobile)

One Expo codebase for iOS, Android and web; full reasoning in
[ADR 0004](adr/0004-mobile-client.md).

- **Routes** live in `app/` (Expo Router); a route file stays thin and renders components
  from `src/features/<module>/`. Every route is also a deep link (`rsp://…` in dev, the app's
  HTTPS domain in production via universal links / App Links) and a web URL.
- **API**: `src/api.ts` exports `hc<AppType>(apiBaseUrl())`; web uses the same origin,
  native uses `EXPO_PUBLIC_API_URL` (set per EAS build profile). Server state goes through
  TanStack Query.
- **Auth**: Better Auth's Expo client; the session token lives in `expo-secure-store` on
  native and in an httpOnly cookie on web.
- **Styling**: `StyleSheet` with theme tokens and a few shared primitives; no web-only CSS.
- **Offline**: an allowlist of `general`-tier queries is persisted and shown with its age when
  offline; `health` and `personal` data are never persisted; attendance and incident drafts
  queue offline and replay with an idempotency key.
- **Push**: `expo-notifications` registers the device; the API stores Expo push tokens and
  sends through Expo's push service. Payloads never contain personal or health data.
- **Navigation**: `app/_layout.tsx` reads `GET /api/me` (`useMe()`); `Stack.Protected`
  shows the `(app)` tabs when signed in and the sign-in screens otherwise; `invite` and
  `reset-password` are public. Tabs and home areas are filtered by permission in
  `src/navigation.ts`.
- **Releases**: EAS Build and Submit for store builds, EAS Update for JavaScript-only fixes,
  `expo export --platform web` for the web build, served by the API server when
  `WEB_DIST_DIR` is set (`src/http/web.ts`).

## Cross-cutting concerns

- **i18n**: `pt-PT` default, `en` secondary. UI strings in `apps/mobile/src/i18n/<locale>.json`.
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
