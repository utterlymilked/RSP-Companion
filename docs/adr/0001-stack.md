# ADR 0001: Technology stack

- Status: Accepted; client choice (PWA, styling, no app stores) superseded by
  [ADR 0004](0004-mobile-client.md)
- Date: 2026-10-15

## Context

RSP Companion is a club management app for Real Sport Clube Massamá, a small club in
Portugal. Users are directors, staff, coaches, athletes, parents/guardians and members, mostly
on phones. The club has little money and no dedicated IT staff, and the code is written and
maintained mainly by Claude Code sessions, one focused task per session.

That gives these constraints, in order of weight:

1. **Low running cost**: single-digit euros per month, no per-seat SaaS fees.
2. **Low maintenance**: few moving parts, boring tech, one language end to end.
3. **Cheap to work on for an AI agent**: types that catch mistakes at compile time, one place
   to look for each concern, fast checks, no code generation steps to forget.
4. **Mobile first, no app stores**: install from a link, works on iOS and Android.
5. **EU data protection**: personal data of minors (youth teams) must stay in the EU and be
   handled under GDPR.

## Decision

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere, Node 22 LTS | One language for client, server and shared types. |
| Repo | pnpm workspaces monorepo (`apps/server`, `apps/web`, `packages/shared`) | Shared types without publishing packages; one PR per feature touches both sides. |
| API server | [Hono](https://hono.dev) on `@hono/node-server` | Small, fast, standards-based. Its typed client (`hc`) gives end-to-end types from route definitions with no codegen. |
| Validation | zod (v4), schemas in `packages/shared` | Same schema validates on the server and types the client. |
| Database | PostgreSQL 17 | Reliable, free, relational data fits the domain (people, teams, seasons, payments). |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL-like, fully typed, plain SQL migration files that are easy to review. |
| Auth | Better Auth (Drizzle adapter), email + password and magic link | Self-hosted, no per-user fees, sessions in our DB. Club roles live in our own tables (see ARCHITECTURE.md). |
| Web client | React 19 + Vite, installable PWA | One codebase for phones and desktop, no app store accounts or review, push notifications supported on installed PWAs. |
| Data fetching | TanStack Query over the typed Hono client | Caching and offline-friendly patterns without a custom layer. |
| Styling | Tailwind CSS (added with the web shell task) | No design system to maintain; fast for agents to write consistently. |
| i18n | react-i18next, `pt-PT` default, `en` secondary | The club operates in Portuguese. |
| Lint/format | Biome | One fast tool instead of ESLint + Prettier. |
| Tests | Vitest (unit + API integration against a real Postgres), Playwright for a few end-to-end flows later | Same runner everywhere; integration tests on the real DB catch query and migration bugs. |
| CI | GitHub Actions: lint, typecheck, test, build | Free for this usage. |
| Deployment | One Docker image (server serves the built web app) + Postgres + Caddy on a small EU VPS via Docker Compose; nightly `pg_dump` to S3-compatible storage | One box is enough for a club's traffic. Current costs: [OPERATIONS.md](../OPERATIONS.md#costs). |
| Email | Any SMTP provider (default suggestion: Brevo free tier, EU) | Free at club volumes; swappable. |

## Alternatives considered

- **Supabase / Firebase (BaaS)**. Less code for auth and storage, but row-level security
  rules spread business logic into the database/console, free tiers pause or cap, and
  migrating away later is costly. Rejected for maintainability; Supabase's managed Postgres
  remains a valid host for our own database.
- **Native mobile apps (React Native / Flutter)**. Better device integration, but app store
  fees, review cycles and two release pipelines. Not worth it for this audience; revisit only
  if a PWA limit actually bites.
- **Next.js full stack**. Capable, but mixes server/client concerns and ties hosting
  expectations to Vercel-style platforms. A plain API + SPA is simpler to reason about and
  to host on one cheap box.
- **Python/Django**. Admin for free, but two languages and no shared types with the client.
- **NestJS / Express**. Heavier (Nest) or untyped routing (Express) compared with Hono.

## Consequences

- Shared code in `packages/shared` is consumed as TypeScript source (no build step); apps
  compile it as part of their own build.
- Everything runs on one VPS: simple and cheap, but a single point of failure. Mitigated by
  automated backups and a documented restore (roadmap task M4).
- Better Auth handles identity only; authorization (club roles, team scoping) is our code and
  must be tested thoroughly.
- If budget is zero, the same image can run on a free tier (e.g. Fly.io/Render with Neon
  Postgres) at the cost of cold starts; the code does not change.

## Open questions

- Hosting budget and who owns the accounts (VPS, domain, email provider).
