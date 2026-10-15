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
    src/modules/<m>/ one folder per domain module (added from M1 on)
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

Each domain module (members, teams, events, …) lives in `apps/server/src/modules/<name>/`:

| File | Responsibility |
| --- | --- |
| `schema.ts` | Drizzle tables for the module |
| `routes.ts` | Hono sub-app: HTTP, input validation (zod from `@rsp/shared`), permission checks |
| `service.ts` | Business logic; takes a db handle and plain inputs; no HTTP types |
| `*.test.ts` | Vitest: service tests and route tests against a real Postgres |

Routes are mounted by chaining `.route("/<name>", routes)` in `src/app.ts` so that `AppType`
keeps the full route map; the web app's typed client (`apps/web/src/api.ts`) depends on it.
Request/response schemas live in `packages/shared/src/<module>.ts`.

## Domain model (first cut, refined in M1)

- **Person**: any human the club deals with (athlete, parent, coach, member). Has name,
  birth date, contacts, member number. Does not need a login.
- **User**: a login (Better Auth). Linked to at most one Person. Minors usually have no user;
  their guardians act for them.
- **Guardianship**: Person (guardian) ↔ Person (minor), with relationship and consent flags.
- **Season**: e.g. 2026/27. Teams, rosters and fees are per season.
- **Team** (escalão): age group or squad within a sport/section, per season.
- **TeamMembership**: Person in Team for a Season with a function (athlete, head coach,
  assistant coach, team manager/delegado).
- **RoleAssignment**: User has Role, optionally scoped to a Team (see below).
- **Venue / Space / Booking**: club facilities (fields, which may split into halves or
  thirds, rooms) and time-slot bookings with conflict checks. Events later attach to bookings.
- Later modules add Incident, EquipmentItem, Loan, EvaluationTemplate, Evaluation,
  Prospect, Event, Attendance, CallUp, FeePlan, Charge, Payment, HealthRecord,
  AvailabilityStatus, Document, Notification, TransportPlan, AuditLog.

## Roles and permissions

Authentication (who you are) is Better Auth. Authorization (what you may do) is ours:

- **Roles** (club-confirmed list, see `REQUIREMENTS.md`): `admin` (direção), `staff`
  (secretaria), `treasurer`, `stores` (economato), `coach`, `team_manager` (delegado),
  `scout`, `recruiter`, clinical roles `doctor`, `nurse`, `physio`, `nutritionist`,
  `psychologist`, plus `sociologist`, `athlete`, `guardian`, `member` (sócio).
- A user can hold several roles. `coach` and `team_manager` assignments are **scoped to
  teams**; others are club-wide. `athlete`/`guardian` rights apply to the person themself
  and their linked minors.
- **Permissions** are fine-grained strings (`members.read`, `events.write`, `fees.manage`, …).
  The role → permission matrix is code in `packages/shared/src/permissions.ts`, so the UI
  can hide what the API would refuse, and changes are reviewed in PRs.
- **Data sensitivity tiers** (designed in M2): `general` (names, teams, schedule),
  `personal` (contacts, birth dates, documents), `health` (diagnoses, treatment, nutrition,
  psychology: GDPR art. 9). Each clinical role reads only `health` data of its own discipline;
  coaches see a derived **availability status** (available / limited / unavailable) and
  never the diagnosis. Every read of `health` data is written to the audit log.
- The API enforces every check server-side via one helper (`requirePermission(perm, scope)`);
  the UI only mirrors it. Each module's route tests cover allowed and denied cases.

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
  with zod at startup.
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
