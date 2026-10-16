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
    src/storage/     file storage (S3, local directory, memory) and signed download tokens
    src/mail/        mailer (SMTP / console / memory) and email templates
    src/scripts/     CLI entry points (migrate, seed, create-admin)
    src/test/        test database harness, factories, testApp (signed-in requests)
    drizzle/         generated SQL migrations (committed)
  mobile/            Expo app for iOS, Android and web. Entry: expo-router (app/_layout.tsx)
    app/             routes (Expo Router): screens, layouts, deep links
    src/features/<m>/ one folder per domain module's components and hooks
    src/api.ts       typed API client; src/auth/ Better Auth client and useMe()
    src/ui/          primitives (Screen, Card, Button, ListItem, Tile, Badge, Fab, ...);
                     src/theme.ts tokens (club colours, light and dark)
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
  login. Each column has a sensitivity tier (`PERSON_FIELD_TIERS` in `@rsc/shared`). It is
  the one digital identity: `identity_code` is its non-personal handle, `is_pseudonymous`
  marks a player kept under an alias, and facets (player profile, team membership, staff
  assignment, login, guardianship, membership) hang off it (ADR 0015).
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
  diagnosis. Health reads go through `authorizeHealthRead()` and writes through
  `authorizeHealthWrite()` (ADR 0008).
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
  `reset-password` are public. The bottom bar has five tabs (Início, Agenda, Equipas,
  Mensagens, Mais); every other module is a hidden tab opened from "Mais", grouped by
  `moreItems()`. Both are filtered by permission in `src/navigation.ts`.
- **Look**: colours, radius, spacing and shadow come only from `src/theme.ts` (club blue,
  yellow, black and red from the crest). Screens compose `src/ui/` primitives: `Card` and
  `Section` to group, `Tile` for shortcuts and figures, `Badge` for status, `Fab` for "new",
  `BackBar` on detail screens and `EmptyState` when a list is empty. Choices use `Choice`,
  `Select` and `MultiSelect` (`src/ui/Select.tsx`: a dropdown on wide screens, a bottom
  sheet on phones, searchable when long); rules in `docs/UI_GUIDELINES.md`.
- **Releases**: EAS Build and Submit for store builds, EAS Update for JavaScript-only fixes,
  `expo export --platform web` for the web build, served by the API server when
  `WEB_DIST_DIR` is set (`src/http/web.ts`). Web caching: pages are `Cache-Control:
  no-cache` (revalidated on every visit) and the content-hashed bundles under
  `/_expo/static/` are `immutable` for a year, so a deploy reaches browsers on their next
  visit. A tab left open compares its build's `EXPO_PUBLIC_APP_VERSION` with
  `/api/health`'s `version` when it comes back into view and reloads once if they differ
  (`src/web-update.ts`). No service worker, so nothing else can serve a stale release.

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
- **App screen** (`(app)/bookings.tsx`, `src/features/bookings/`): fields and rooms are
  separate categories (`slots.ts`, `categoryOf`), each with four views over one week or month
  of `GET /bookings`, and a week strip to pick the day. *Planta*: `planLayout.ts` holds a
  schematic plan of the complex on a 100-wide grid, matched to spaces by normalised name and
  cropped to the category; `occupancy.ts` (`stateAt`) colours each space free, pending
  (`to_confirm`) or busy now (another day shows its booking count), counting combinations
  both ways. Tapping a space opens a bottom sheet with its free start times (`freeStarts`:
  half hours free for the chosen length, 08:00-23:00) and the day's bookings. *Dia* is a
  column per space, *Semana* seven day columns (overlaps in lanes, more than two become a
  count that opens the day), *Mês* a count per day plus the iCal link.
- **Booking flow** (`booking/new.tsx`): steps space, day, time, details, like TheFork
  (`docs/UI_GUIDELINES.md`); route params (`spaceId`, `date`, `start`, `end`, `category`)
  skip the steps already known, so a free slot lands on the confirmation. Replace the plan
  coordinates in `planLayout.ts` when the club's real plans arrive.

## Cross-cutting concerns

- **i18n**: `pt-PT` default whatever the phone's language, `en` on request (PT | EN switch on the
  sign-in and account screens, saved on the device). UI strings in `apps/mobile/src/i18n/<locale>.json`.
  API returns error codes, not sentences; the client translates.
- **Dates and money**: store timestamps as `timestamptz` (UTC); display in `Europe/Lisbon`.
  Money as integer cents (`EUR`). Never floats.
- **Privacy (GDPR)**: minimal personal data, EU hosting, guardian consent for minors,
  per-field visibility by role (e.g. health info only to staff/coaches of that team),
  audit log for access to sensitive data (from M2), consents, export and erasure on request,
  retention job and privacy notice (M17, ADR 0012).
- **Dashboard** (`modules/dashboard`): club-wide counts for the home screen and CSV exports,
  gated by the permissions of the underlying modules (M18, ADR 0013).
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

## Calendar and events (M10)

Module `events` (`apps/server/src/modules/events/`). An `events` row is a training, a match or
a club event of a team (or the whole club) with a status (scheduled, postponed, cancelled,
played). Match-only data (competition type, round, format, opponent, home/away, kit, transport,
medical cover) lives in `event_matches`, one row per match, required for matches and refused
for other kinds. Recurring trainings share an `event_series`.

- **Space reservation goes through M6.** Creating an event with `spaceId` and `departmentId`
  creates the bookings first (`createBookings`: conflict-checked, all or nothing, 409
  `booking_conflict`) and links each event to its booking. Changing an event's time or status
  is passed to its booking (scheduled to confirmed, postponed, cancelled, played to done).
  Away matches use an external `venueId` or a free-text `location` and have no booking.
- **Permissions**: `events.read` is club-wide (no personal data); `events.write` is club-wide
  for admin and staff and team-scoped for coaches and delegados, whose bookings stay
  `to_confirm` requests, as for bookings.
- **Import**: `pnpm events:import` reads the matches sheet; it creates events only, the field
  reservations come from `bookings:import`. Re-runs skip matches with the same team, start and
  opponent.
- **Client**: Agenda tab (`app/(app)/events.tsx`), `app/event/new.tsx`, `app/event/[eventId].tsx`.


## Call-ups and attendance (M11)

Module `callups` (`apps/server/src/modules/callups/`), mounted at `/api/callups`. One table,
`event_participants` (unique per event and person): a row is a call-up (convocatória) and also
holds the answer (`rsvp`: pending, going, not_going, plus an optional note) and the attendance
(`present`, `absent`, `excused`). General tier only; no health data.

- **Permissions**: `callups.read` / `callups.write` for admin, staff, coach and delegado;
  coaches and delegados are limited to the events of their team (club events need a club-wide
  grant). Athletes and guardians have no permission: they answer for themselves and their
  wards (`isSelfOrWard`) and see their own call-ups through `GET /api/callups/mine`.
- **Offline attendance**: `PUT /events/:id/attendance` takes marks with the device time
  (`markedAt`); a mark never overwrites a newer one, so replaying a queue is harmless. The
  app keeps unsent marks in `AsyncStorage` (`src/features/callups/outbox.ts`) and flushes them
  on screen open and when the connection returns.
- **Notifications**: `POST /events/:id` notifies the newly called-up people and their guardians
  (M15, generic text and a link to the event).
- **Stats**: `GET /stats?teamId&from&to`, per person: called, present, absent, excused and the
  share present among marked sessions.
- **Client**: `app/event/callups/[eventId].tsx`, `MyCallUps` on the home screen,
  `AttendanceStats` on the team screen.

## Documents and expiry tracking (M14)

Module `documents` (`apps/server/src/modules/documents/`), mounted at `/api/documents`, with the
file storage in `src/storage/` (ADR 0009). One table, `documents`; the bytes live in the bucket.

- **Permissions**: `documents.read` lists kind, title and expiry; `documents.write` uploads,
  deletes and opens files, except `medical_exam`, which only the medical roles touch (health
  tier, audited as `health.*`). Other file reads and changes are audited as `document.read` /
  `document.write`.
- **Upload**: raw body plus query string, 10 MB, PDF/JPEG/PNG sniffed by first bytes.
  `GET /:id/url` returns a 5 minute signed URL; the app opens it with `Linking.openURL`.
- **Expiry**: `GET /expiring` (see ADR 0009); scoped roles get their own teams.
- **Configuration**: `STORAGE_S3_*` or `STORAGE_DIR` (`.env.example`, OPERATIONS.md).
- **Client**: Documentos tab (`app/(app)/documents.tsx`), `app/documents/[personId].tsx`,
  picker and upload helpers in `src/features/documents/upload.ts`; a link from the health record.

## Announcements and notifications (M15)

Module `notifications` (`apps/server/src/modules/notifications/`), mounted at
`/api/announcements` and `/api/notifications` (ADR 0010); push sender in `src/push/`.

- **Tables**: `announcements`, `notifications` (the inbox), `push_devices`,
  `notification_preferences`.
- **Permissions**: `announcements.write` (club-wide for admin and secretaria, per team for coach
  and delegado). Everything under `/api/notifications` is the signed-in user's own.
- **Delivery**: `notifyUsers(channels, userIds, notice)` writes the inbox rows, then pushes
  (Expo, generic text, ids only) and emails according to preferences; failures there are logged,
  not raised. Other modules call it from their routes (call-ups today).
- **Reminders**: `startReminderJob` (started in `src/index.ts`) sends document-expiry reminders
  once per Lisbon day.
- **Client**: Avisos tab (`app/(app)/notifications.tsx`), `app/announcement/new.tsx`,
  `src/features/notifications/` (token registration, tap handling), switches on the account
  screen. `AppDeps.push` is a `memoryPush()` in tests.

## Transport (M16)

Module `transport` (`apps/server/src/modules/transport/`), mounted at `/api/transport`
(ADR 0011).

- **Tables**: `transport_rides` (event, kind `club_van` | `carpool`, seats, pickup point and
  time, driver person), `transport_passengers` (unique per event and person).
- **Access**: no new permissions. Managers are whoever holds `callups.read` / `callups.write`
  over the event's team; participants are the user and their wards called up for the event.
- **Privacy**: the driver's phone is read from `persons` at request time and returned only to
  the driver and to people who ride with them; passenger names go to managers and, for
  participants, only their own people.
- **Client**: `app/event/transport/[eventId].tsx`, reached from the event and from the home
  call-ups.


## Privacy tooling (M17)

Module `privacy` (`apps/server/src/modules/privacy/`), mounted at `/api/privacy` (ADR 0012).

- **Tables**: `consents` (person, kind `image_rights` | `transport`, given by, given on,
  withdrawn on; one active per person and kind) and `privacy_requests` (kind, status, who
  asked, how it was resolved; the person reference is nulled on erasure).
- **Services**: `service.ts` (consents, requests, account deletion), `export.ts` (one JSON
  document per person, health records excluded), `erasure.ts` (blockers, files first, then
  one transaction), `retention.ts` (the periodic purge started from `src/index.ts`).
- **Access**: people act on themselves and their wards through the data; `consents.read`
  (scoped for coaches and delegados), `consents.write` (office) and `privacy.manage`
  (admin: request queue, export of anyone, erasure). The audit log viewer uses `audit.read`.
- **Client**: `app/privacy/index.tsx` (public notice at `/privacy`),
  `app/privacy/[personId].tsx` (consents, export, erasure), `app/privacy/requests.tsx`
  (office queue), `app/audit.tsx` (audit viewer); the account screen lists the user's own
  people and offers account deletion.
