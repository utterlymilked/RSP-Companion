# Architecture

How RSC Companion is put together. Stack rationale is in [ADR 0001](adr/0001-stack.md)
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

Production is one Docker Compose stack on the VPS (`deploy/compose.yml`): the app image from
GHCR, Postgres and Caddy. Pushes to `main` build and deploy the image; the database is dumped
nightly to object storage. Runbook: [OPERATIONS.md](OPERATIONS.md).

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
| `routes.ts` | Hono sub-app: HTTP, input validation (zod from `@rsc/shared`), permission checks |
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
  login. Each column has a sensitivity tier (`PERSON_FIELD_TIERS` in `@rsc/shared`).
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
  from `src/features/<module>/`. Every route is also a deep link (`rsc://…` in dev, the app's
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

## People and teams registry (M5)

- **API** (all under `/api`, permissions in `packages/shared/src/permissions.ts`):
  `GET/POST /people`, `GET/PATCH /people/:id`, `GET/POST /people/:id/guardians`,
  `DELETE /people/:id/guardians/:guardianId`, `GET/POST /people/:id/memberships`,
  `PATCH /people/:id/memberships/:membershipId`; `GET/POST /teams`, `GET/PATCH /teams/:id`,
  `POST /teams/:id/members`, `POST /teams/:id/members/:personId/leave`; `GET /classes`,
  `GET /classes/:id`, `POST /classes/:id/members`, `.../leave`; `POST /staff-assignments`,
  `DELETE /staff-assignments/:id`; `GET /lookups/seasons`, `GET /lookups/organisations`.
- **Visibility**: lists return the general tier only. Coaches and team managers see only
  people, teams and classes in their scope (`readScope()` in `modules/access`). A person's
  guardians come back with the tier the reader has over the child; member numbers are
  personal tier. Writes need club-wide `people.write` / `teams.write` (admin, staff).
- **Errors**: unique violations are `409 conflict` (federation id, member number, team name),
  foreign-key violations `404`, check violations `400` (`http/db-errors.ts`).
- **Importing people** (`pnpm people:import <file.csv> [--organisation <name>] [--apply]`):
  reads a CSV exported from the club's sheets at runtime (never committed). Headers are
  matched by Portuguese or English aliases (`Nome`, `Data de Nascimento`, `Nº Sócio`,
  `Equipa`, `Turma`, `Encarregado de Educação`, `Email EE`, `Telefone EE`, `Parentesco`, …;
  list in `modules/people/import.ts`). Existing people are matched by licence number, else by
  name and birth date, and only empty fields are filled. Without `--apply` everything runs in
  a transaction that is rolled back and a summary is printed. Output has counts and line
  numbers only. On the server, run it from a shell in the app container with the file copied
  in; the club's real sheets have not been mapped yet (REQUIREMENTS.md).

## Rooms and fields booking (M6)

Decision record: [ADR 0005](adr/0005-bookings.md). Code: `apps/server/src/modules/bookings/`,
`packages/shared/src/bookings.ts` and `lisbon.ts`, app screens `(app)/bookings.tsx` and
`booking/`.

- **Model**: `venues` (home complex, external grounds) → `spaces` (campo 1, auditório, sala
  de reuniões, gabinete…). `space_components` makes a space a combination of others of the
  same venue (campo 2+3), one level deep. `bookings` hold space, department, optional team,
  activity, status, `starts_at` / `ends_at` (timestamptz), target group, expected and actual
  attendance. `booking_series` groups the occurrences of a weekly recurrence.
- **Conflicts**: bookings in the *blocking* statuses (`to_confirm`, `confirmed`, `done`)
  occupy their space and every overlapping combination. Creating or changing such a booking
  is checked under a Postgres advisory lock; a clash is `409 booking_conflict` with the
  clashing bookings in `error.issues`. A series is all or nothing. Other statuses free the
  space. The check is in the service, not a database constraint, because combinations
  cannot be expressed as an exclusion constraint.
- **Time**: stored in UTC, shown and recurred in Europe/Lisbon (`lisbon.ts`), so a weekly
  19:00 training stays 19:00 across the clock changes. The week view sends Lisbon dates.
- **API**: `GET /facilities` (venues, spaces, departments), `POST /facilities/venues`,
  `POST /facilities/spaces`, `PATCH /facilities/spaces/:id`; `GET /bookings?from&to[&spaceId
  &departmentId&status]` (at most 93 days), `POST /bookings` (optional `repeat`),
  `GET/PATCH /bookings/:id` (`applyTo: "following"` changes the rest of a series, except
  space and time); `GET /bookings/feed`, `POST /bookings/feed/rotate`; `GET
  /calendar/<token>.ics`.
- **Permissions**: `bookings.read` for every role except athlete, guardian and member (the
  calendar holds no personal data); `bookings.write` for admin and staff club-wide and for
  coach and team manager limited to their team: they create only `to_confirm` requests with
  their `teamId`, edit attendance, and may only withdraw (`cancelled`) a booking of their team.
  `facilities.write` (venues and spaces) for admin and staff. Reading is allowed for team-
  limited grants too; only writing is scoped.
- **Calendar feed**: calendar apps cannot sign in, so each user has one secret link
  (`calendar_feeds.token`, rotatable). It works only while the user holds `bookings.read` and
  lists the blocking statuses from 30 days back to 400 days ahead.
- **Importing the booking sheet** (`pnpm bookings:import <file.csv> [--apply]`): CSV of the
  MARCAÇÃO tab. Headers matched by alias (`Infraestrutura`, `Gabinete`, `Data`, `Atividade`,
  `Início`, `Fim`, `Estado`, `Público alvo`, `Previstos`, `Reais`, `Observações`; list in
  `modules/bookings/import.ts`). Spaces and departments must already exist (create them in
  the app or seed) and are matched by name ignoring case and accents. Re-running skips
  identical bookings; overlaps and unknown names are reported by line number.

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

## Incidents (M7)

Decision record: [ADR 0006](adr/0006-incidents.md). Code: `apps/server/src/modules/incidents/`,
`packages/shared/src/incidents.ts`, app screens `(app)/incidents.tsx`, `incident/new.tsx` and
`incident/[incidentId].tsx`.

- **Endpoints**: `GET /incidents[?type&status&teamId]`, `POST /incidents` (201, or 200 when the
  `clientKey` was already used by the same reporter), `GET/PATCH /incidents/:id`.
- **Visibility** is per row (`viewOf`): reporter full; injuries full only with
  `incidents.read_injury`, summary for other readers; everything else by `incidents.read`
  scope. Responses always carry `view`, `description`, `followUp` and `people` (null/empty in a
  summary) so clients have one type.

## Equipment and stores (M8)

Code: `apps/server/src/modules/equipment/`, `packages/shared/src/equipment.ts`, app screens
`(app)/equipment.tsx`, `equipment/new.tsx` and `equipment/[itemId].tsx`.

- **Items** are one row per size (`name` + `size` unique). **Stock is never stored**: it is the
  sum of `stock_movements.delta`, an append-only ledger (receipt, adjustment, loss, sale, loan,
  return). `appendMovement` locks the item row and refuses to go below zero (409
  `insufficient_stock`).
- **Loans** go to one person or one team (database check) and are returned whole; creating or
  returning a loan appends the matching movement in the same transaction.
- **Sales** record buyer and unit price (defaulting to the item's price); M12 will read them to
  create charges in the fees ledger.
- **Endpoints**: `GET/POST /equipment/items`, `GET/PATCH /equipment/items/:id`,
  `POST /equipment/items/:id/movements`, `GET/POST /equipment/loans`,
  `POST /equipment/loans/:id/return`.
- **Permissions**: `equipment.read` / `equipment.write` for admin, staff and stores, club-wide
  only (coaches do not see the economato yet). No personal data beyond ids.

## Evaluations and scouting (M9)

Decision record: [ADR 0007](adr/0007-evaluations-scouting.md). Code:
`apps/server/src/modules/evaluations/` and `scouting/`, `packages/shared/src/evaluations.ts`
and `scouting.ts`, app screens `(app)/scouting.tsx`, `scouting/*`, `evaluation/*`.

- **Endpoints**: `GET/POST /evaluations/templates`, `PATCH /evaluations/templates/:id`,
  `GET /evaluations?personId=` (history), `POST /evaluations`;
  `GET/POST /scouting/prospects`, `GET/PATCH /scouting/prospects/:id`,
  `POST /scouting/prospects/:id/reports`.
- **Permissions**: `evaluations.read|write` are checked per athlete with `personScope` (coach:
  own team; team manager: read); `evaluations.manage` and `scouting.*` as in the ADR.
- Scores are validated in `createEvaluation` (criterion of the template, within `scaleMax`).

