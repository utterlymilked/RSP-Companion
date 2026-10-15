# RSP Companion: guide for Claude Code sessions

Club management app (client + server, role-based) for Real Sport Clube Massamá, a small club
in Portugal. Read this first; read other docs only when the task needs them.

- Architecture and conventions in depth: `docs/ARCHITECTURE.md`
- Task list, tiers and status: `docs/ROADMAP.md` (update the task's status in your PR)
- Decisions: `docs/adr/` (add an ADR for anything expensive to reverse)
- What the club asked for: `docs/REQUIREMENTS.md` (business answers; keep it current)

## Stack

TypeScript, Node 22, pnpm workspaces. API: Hono + zod, Drizzle ORM on PostgreSQL 17,
Better Auth. Web: React 19 + Vite PWA, TanStack Query, Tailwind, react-i18next.
Tooling: Biome (lint + format), Vitest, GitHub Actions. Rationale: `docs/adr/0001-stack.md`.

## Layout

- `apps/server`: API. `src/app.ts` builds the Hono app and exports `AppType`; `src/index.ts`
  starts the Node server; `src/env.ts` validates config. Domain code goes in
  `src/modules/<module>/` (`schema.ts`, `service.ts`, tests); `src/db/` holds the Drizzle
  client, schema index and seed; migrations in `drizzle/`.
- `apps/web`: PWA. `src/api.ts` is the typed client (`hc<AppType>`). Screens go in
  `src/features/<module>/`.
- `packages/shared` (`@rsp/shared`): zod schemas, types, constants, permission matrix.
  Consumed as TS source, no build step; its internal imports use `.ts` extensions.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm install` | install everything (cloud sessions run this automatically) |
| `pnpm dev` | API on :3000 and web on :5173 (proxies `/api`) |
| `pnpm check` | lint + typecheck + test: run before every push |
| `pnpm lint:fix` | apply Biome formatting and safe fixes |
| `pnpm build` | build all packages |
| `pnpm --filter @rsp/server test` | tests for one package |
| `docker compose up -d` | local Postgres (`postgres://rsp:rsp@localhost:5432/rsp`); copy `.env.example` to `.env` |
| `pnpm db:generate --name <x>` | generate a SQL migration from schema changes (skill: `db-migration`) |
| `pnpm db:migrate` | apply pending migrations to `DATABASE_URL` |
| `pnpm db:seed [--reset]` | load fake development data |

Server tests need Postgres: they recreate `<db>_test` and run all migrations each time.
Without `DATABASE_URL` they are skipped locally (and fail in CI). Cloud sessions start a
local Postgres in the session hook.

## Conventions

- Strict TypeScript; no `any` unless justified in a comment. ES modules; server-relative
  imports end in `.js`.
- Validate every request body/query with a zod schema from `@rsp/shared`; reuse it on the client.
- Chain route registrations in `app.ts` (`.route(...)`) so `AppType` stays complete.
- Authorization is enforced on the server for every route; the UI only hides what the API
  would refuse. Add allowed and denied tests for each protected route.
- Money in integer cents; timestamps `timestamptz` in UTC, shown in `Europe/Lisbon`;
  calendar dates as `date` strings (`YYYY-MM-DD`).
- Services take `db: Db` first (a database or transaction) and plain inputs. Schema changes
  follow `.claude/skills/db-migration/SKILL.md`. Every `persons` column has a sensitivity
  tier; select people via `personColumns(tier)`. Health data never goes in M1 tables.
- User-facing strings via i18n keys; `pt-PT` is the default locale. API returns error codes.
- Code, comments, commits and docs in English; UI copy in Portuguese (with English translation).
- Keep each PR to one roadmap task. Draft PR first, CI green before asking for review.
- Update this file when stack, commands, conventions or architecture change.

## Workflow for roadmap tasks

1. Read the task in `docs/ROADMAP.md` and only the files it touches (grep/glob first).
2. Branch, implement with tests, `pnpm check`, push, open a draft PR using the template.
3. Mark the task status in `docs/ROADMAP.md`. Stop and wait for Pedro before the next task.
