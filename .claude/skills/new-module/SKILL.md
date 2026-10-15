---
name: new-module
description: Add a feature module to RSC Companion end to end (schema, service, routes, shared schemas, permissions, screens, tests, docs). Use for any roadmap task that adds an API plus screens; the people and teams registry (M5) is the reference implementation.
---

# Adding a module

Reference implementation: **people and teams** (M5). Copy its shape, not its content.
Read `CLAUDE.md` first; schema changes also follow `.claude/skills/db-migration/SKILL.md`.

## Order of work

1. **Shared schemas** (`packages/shared/src/<module>.ts`, exported from `index.ts`): zod
   schemas for every request body and query, plus any enum arrays. Forms send `""` for empty
   fields: use `blankToNull` (see `people.ts`) so the client can reuse the same schema.
2. **Permissions** (`packages/shared/src/permissions.ts`): add `<module>.read` / `.write` to
   `PERMISSIONS` and to `ROLE_PERMISSIONS` for each role that gets it. Decide per role
   whether the grant is club-wide or team/class scoped (scoped roles pass a scope).
3. **Schema + migration** if tables change (db-migration skill). Constraints named
   `<table>_<rule>`; unique/check/foreign-key rules live in the database.
4. **Service** (`apps/server/src/modules/<module>/service.ts`): plain functions
   `(db: Db, input)`, no Hono types. Lists select explicit general-tier columns; personal
   data only through `personColumns(tier)` after `personTierFor`.
5. **Routes** (`routes.ts`): chain handlers on a `new Hono<AppEnv>()`, validate every
   input with `validate(...)`, guard with `requirePermission(...)` (writes first, then
   `validate`), and wrap writes in `writeOrApiError(db, tx => ...)` so constraint failures
   become 409 / 404 / 400 instead of 500 and do not poison test transactions. Register in
   `src/app.ts` with `.route(...)`. Audit reads of someone else's personal data.
6. **Server tests**: service tests plus route tests with `testApp(db).userWith(roles)`:
   allowed and denied per role, per scope for coach / team manager, 401 anonymous, and the
   constraint cases (409). Use the factories in `src/test/factories.ts`.
7. **Screens** (`apps/mobile`): thin routes in `app/`, typed calls through `src/api.ts`
   (`jsonOrThrow`, `errorKey`), strings in both `src/i18n/pt-PT.json` and `en.json`, a tab in
   `src/navigation.ts` gated by a permission. Screen tests in `test/` (mock `expo-router`,
   `src/auth/*` and `src/api`; `await fireEvent...`).
8. **Docs**: ROADMAP status, ARCHITECTURE if the shape changed, REQUIREMENTS for new club
   answers, an ADR for anything expensive to reverse, CLAUDE.md if commands or conventions
   changed.
9. `pnpm check`, push, draft PR with the template, CI green.

## Gotchas

- `personColumns()` returns a `Partial`, which loses required keys in client types: for
  lists select the columns explicitly.
- A failing statement aborts the surrounding Postgres transaction. Tests run in one, so any
  write that can fail on a constraint must go through a savepoint (`db.transaction`).
- Never put real names, contacts or health data in tests, fixtures or docs.
