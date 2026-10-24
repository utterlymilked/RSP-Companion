# SFF RSC: guide for Claude Code sessions

Club management app (client + server, role-based) for Real Sport Clube Massamá, a small club
in Portugal. It is a **mobile app** (App Store and Google Play) with a web version from the
same code. Read this first; read other docs only when the task needs them.

- Architecture and conventions in depth: `docs/ARCHITECTURE.md`
- Modules, tiers and switches (release / beta / alpha): `docs/MODULES.md`, ADR 0025. New features are modules: add them to the catalogue and `ROUTE_MODULES` (see that doc)
- Production server, deploys, backups and restore: `docs/OPERATIONS.md`
- Task list, tiers and status: `docs/ROADMAP.md` (update the task's status in your PR)
- Decisions: `docs/adr/` (add an ADR for anything expensive to reverse)
- What the club asked for: `docs/REQUIREMENTS.md` (business answers; keep it current)
- UI rules (which selection control, layout, touch targets): `docs/UI_GUIDELINES.md`; read it
  before building or changing a screen

## Stack

TypeScript, Node 22, pnpm workspaces. API: Hono + zod, Drizzle ORM on PostgreSQL 17,
Better Auth. Client: Expo (React Native + web) with Expo Router, TanStack Query,
react-i18next, `StyleSheet` theme tokens; EAS for store builds. Tooling: Biome (lint +
format), Vitest (server, shared), Jest + React Native Testing Library (app), GitHub Actions.
Rationale: `docs/adr/0001-stack.md` (server), `docs/adr/0004-mobile-client.md` (client,
offline, push, store accounts).

## Layout

- `apps/server`: API. `src/app.ts` exports `createApp(deps)` and `AppType`; `src/index.ts`
  wires db, Better Auth and mail and starts the Node server; `src/env.ts` validates config. Domain code goes in
  `src/modules/<module>/` (`schema.ts`, `service.ts`, tests); `src/db/` holds the Drizzle
  client, schema index and seed; migrations in `drizzle/`.
- `apps/mobile`: Expo app for iOS, Android and web. Routes in `app/` (Expo Router), kept
  thin; components and hooks in `src/features/<module>/`. `src/api.ts` is the typed client
  (`hc<AppType>`), `src/auth/` the Better Auth client and `useMe()`, `src/ui/` the primitives,
  `src/theme.ts` the tokens (no colours or sizes outside it), `src/i18n/<locale>.json` the
  strings. Bottom tabs Reservas, Scouting, Perfil and Definições (`src/navigation.ts`); the rest opens from Definições. React Native components only
  (`View`, `Text`, …), no DOM elements. Screen tests go in `test/` (every file in `app/` is a
  route).
- OTA updates: merges to `main` also publish the Android JS bundle (served by the API, `apps/server/src/http/ota.ts`); only native changes need a new APK and a `runtimeVersion` bump in `apps/mobile/app.json` (`docs/OPERATIONS.md#over-the-air-updates`).
- `deploy/`: Compose stack deployed twice, staging (`/opt/rsc`) and prod (`/opt/rsc/prod`, manual releases, ADR 0017) (app, Postgres, Caddy) and backup/restore scripts;
  the root `Dockerfile` builds the one production image. Runbook: `docs/OPERATIONS.md`.
- `packages/shared` (`@rsc/shared`): zod schemas, types, constants, permission matrix.
  Consumed as TS source, no build step; its internal imports use `.ts` extensions.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm install` | install everything (cloud sessions run this automatically) |
| `pnpm dev` | API on :3000 and Expo on :8081 (web at `localhost:8081` proxies `/api`; phones via Expo Go with `EXPO_PUBLIC_API_URL=http://<LAN IP>:3000` in `apps/mobile/.env.local`) |
| `pnpm check` | lint + typecheck + test: run before every push |
| `pnpm lint:fix` | apply Biome formatting and safe fixes |
| `pnpm build` | build all packages (server bundle in `apps/server/dist` via esbuild; the app's web export in `apps/mobile/dist`) |
| `docker build -t rsc-companion .` | the production image (API plus web build); see `docs/OPERATIONS.md` |
| `pnpm --filter @rsc/mobile exec expo install <pkg>` | add an Expo/React Native dependency at the version the SDK expects |
| `pnpm --filter @rsc/server test` | tests for one package |
| `docker compose up -d` | local Postgres (`postgres://rsc:rsc@localhost:5432/rsc`); copy `.env.example` to `.env` |
| `pnpm db:generate --name <x>` | generate a SQL migration from schema changes (skill: `db-migration`) |
| `pnpm db:migrate` | apply pending migrations to `DATABASE_URL` |
| `pnpm next:numbers` | next free migration and ADR number (looks at your tree and `origin/main`) |
| `pnpm check:numbers` | fails on duplicate migration/ADR numbers or a broken migration journal (runs in CI) |
| `pnpm db:rebase` | after merging main, re-creates your one unmerged migration on top of it (journal and snapshot included) |
| `pnpm db:seed [--reset]` | load fake demo data for every module around today (logins `admin@rsc.test`, `treinador@rsc.test`, `pais@rsc.test` and others in `DEMO_LOGINS`, password `rsc-dev-password`); on staging use the Ops task `seed-demo` (empty database) or `reset-demo` (refresh, keeps real logins) |
| `pnpm people:import <file.csv> [--apply]` | import people, guardians, member numbers and rosters from a CSV export (dry run without `--apply`) |
| `pnpm bookings:import <file.csv> [--apply]` | import the room-booking sheet (spaces and departments must exist; dry run without `--apply`) |
| `pnpm events:import <file.csv> [--apply]` | import the matches sheet as events (teams and external venues matched by name; dry run without `--apply`) |
| `pnpm feedback:export [--out docs/feedback]` | write the collected tester feedback as Markdown (Ops task `export-feedback` prints it from staging); see `docs/feedback/README.md` |
| `pnpm admin:create --email <e> --name <n>` | bootstrap the first admin; password on stdin |

Players and teams import from Excel in the app (`/api/imports`, ADR 0015); `persons` is the single identity, with `identity_code` and pseudonymous (alias-only) players.

Document uploads need `STORAGE_DIR` or `STORAGE_S3_*` (see `.env.example`); tests use in-memory storage.
Server tests need Postgres: they recreate `<db>_test` and run all migrations each time.
Without `DATABASE_URL` they are skipped locally (and fail in CI). Cloud sessions start a
local Postgres in the session hook.

## Conventions

- Strict TypeScript; no `any` unless justified in a comment. ES modules; server-relative
  imports end in `.js`.
- Validate every request body/query with a zod schema from `@rsc/shared`; reuse it on the client.
- Chain route registrations in `app.ts` (`.route(...)`) so `AppType` stays complete.
- Authorization is enforced on the server for every route (`requirePermission` /
  `principalOf` from `src/modules/access/`); the UI only hides what the API would refuse.
  New permissions go in `packages/shared/src/permissions.ts`. Add allowed and denied tests
  for each protected route (`testApp(db).userWith(roles)` in `src/test/app.ts` signs a user
  in). Health data is read only after `authorizeHealthRead()`. See `docs/adr/0003-*`.
- Money in integer cents; timestamps `timestamptz` in UTC, shown in `Europe/Lisbon`;
  calendar dates as `date` strings (`YYYY-MM-DD`).
- Services take `db: Db` first (a database or transaction) and plain inputs. Schema changes
  follow `.claude/skills/db-migration/SKILL.md`. Every `persons` column has a sensitivity
  tier; select people via `personColumns(tier)`. Health data never goes in M1 tables.
- UI follows `docs/UI_GUIDELINES.md`: single choices go through `Choice` (segmented for 2-5
  short options, `Select` otherwise), several through `MultiSelect`; never walls of chips or
  buttons. Check new screens at phone and desktop widths.
- User-facing strings via i18n keys; `pt-PT` is the default locale. API returns error codes.
- Pitch parts: a field's halves/thirds are child `spaces` kept by `syncParts`; overlap is the
  geometry in `packages/shared/src/pitch.ts` (ADR 0016). Never hard-code the field layout.
- Client offline rules: persist only allowlisted `general`-tier queries; never persist
  `health` or `personal` data; push payloads carry ids, not personal data (ADR 0004).
- Code, comments, commits and docs in English; UI copy in Portuguese (with English translation).
- Parallel PRs: other threads merge while yours is open. Before the final push and before
  merging, `git fetch origin main && git merge origin/main`, re-run `pnpm check`, and only then
  push. Claim numbered things late: pick the migration and ADR number (`pnpm next:numbers`) when
  you commit them, not when you start, and renumber after every merge of main (never edit a
  number already on main). Conflicts in `drizzle/meta/*`: run `pnpm db:rebase`, do not hand-merge.
  `pnpm-lock.yaml`: take main's, then `pnpm install`. The ADR index is the directory itself (no
  table to edit). Keep edits to shared files (`ROADMAP.md`, `CLAUDE.md`, `UI_GUIDELINES.md`)
  small and local so they merge cleanly.
- Keep each PR to one roadmap task. Draft PR first, CI green before asking for review.
- Update this file when stack, commands, conventions or architecture change.

## Workflow for roadmap tasks

1. Read the task in `docs/ROADMAP.md` and only the files it touches (grep/glob first).
2. Branch, implement with tests, `pnpm check`, push, open a draft PR using the template.
3. Mark the task status in `docs/ROADMAP.md`. Stop and wait for Pedro before the next task.
