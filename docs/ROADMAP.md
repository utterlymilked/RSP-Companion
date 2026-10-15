# Roadmap

Work is split into modules sized for **one Claude Code thread and one PR each**: big enough
that session start-up is a small share of the work, small enough to fit comfortably in
context. Tasks run one at a time; Pedro gives the go-ahead before each one starts.

**Tier** sets the model and effort for the thread:

| Tier | Model / effort | Used for |
| --- | --- | --- |
| Light | Haiku, low | docs, copy, config, small isolated fixes, PR babysitting |
| Standard | Sonnet, medium | features, endpoints, screens, tests, ordinary bugs |
| Heavy | Opus, high | architecture, data model, auth/roles, security, cross-cutting refactors |

Status: ✅ done · 🔄 in progress · ⏳ next · ○ planned

## Phase 0: Foundation

### M0 Architecture, roadmap and scaffold ✅ (Heavy)
ADR for the stack, ARCHITECTURE.md, this roadmap, CLAUDE.md, pnpm monorepo with Hono API,
React web app, shared package, Biome, Vitest, CI, cloud session hook.

### M1 Data foundation ⏳ (Heavy)
- Drizzle + Postgres wiring, env config validated with zod, migration workflow
  (`pnpm db:generate`, `pnpm db:migrate`), test DB harness (Postgres service in CI).
- Core tables: Person, Guardianship, Season, Team, TeamMembership. Seed script with fake data.
- Module folder convention in place (`apps/server/src/modules/`).
- Skill: `.claude/skills/db-migration/` (how to change schema safely).
- Done when: migrations apply on a clean DB in CI, service tests for core tables pass.

### M2 Authentication and roles (Heavy)
- Better Auth (email + password, magic link, invites), sessions, password reset email via SMTP.
- User ↔ Person link; RoleAssignment with optional team scope.
- Permission matrix in `packages/shared/src/permissions.ts`; `requirePermission` middleware.
- Admin bootstrap (first admin via CLI script).
- Done when: login/logout/invite work via API; route tests cover allowed/denied per role.

### M3 Web app shell (Standard)
- Tailwind, routing, layout (mobile first), TanStack Query, i18n (pt-PT/en), PWA manifest and
  service worker, login/invite/reset screens, role-aware navigation.
- Server serves the built web app in production.
- Done when: a user can log in on a phone, install the app, and see a role-based home.

### M4 Deployment and backups (Standard)
- Dockerfile (single image), `deploy/compose.yml` (app, Postgres, Caddy), env docs,
  nightly `pg_dump` to S3-compatible storage, documented restore drill, GitHub Action to
  build and push the image. `docs/OPERATIONS.md`.
- Needs: hosting decision and accounts from Pedro.
- Done when: staging is reachable over HTTPS and a backup has been restored once.

## Phase 1: Core club operations

### M5 Members and teams (Standard)
- CRUD for people, guardians, member numbers and status; teams per season and rosters.
- Search/filter lists; CSV import script for the club's existing spreadsheets (`scripts/`).
- Skill: `.claude/skills/new-module/` (schema → service → routes → shared schemas → screens →
  tests), written from this module as the reference implementation.

### M6 Calendar and events (Standard)
- Trainings (recurring), matches (home/away, opponent, venue), club events.
- Venue/field allocation with conflict warnings. Per-user iCal feed.

### M7 Attendance and call-ups (Standard)
- RSVP by athletes/guardians, attendance taken by coaches, match call-ups (convocatórias)
  with notification hook points, attendance stats per athlete.

## Phase 2: Logistics

### M8 Transport (Standard)
- Away-game transport: club van seats and parent carpool offers, assignment of athletes to
  vehicles, pickup point/time, driver contact visible only to participants.

### M9 Equipment and kit (Standard)
- Inventory of balls, bibs, kits with sizes; loans to athletes/teams, returns, stock alerts.

## Phase 3: Money

### M10 Membership fees and payments ledger (Heavy)
- Fee plans per season (sócio quota, athlete monthly fee, discounts for siblings),
  charges, manual payments (cash, transfer), receipts, overdue reports. Integer cents.
- Integration with the standalone `pt-payments` package for Multibanco references and
  MB WAY, with signed webhooks. The package is built first in its own repo.
- Possible split if large: M10a ledger, M10b gateway integration.

## Phase 4: Compliance and communication

### M11 Documents and expiry tracking (Standard)
- Uploads to S3-compatible storage with signed URLs; medical exam, federation registration,
  ID documents; expiry dates and reminders; visibility by role.

### M12 Announcements and notifications (Standard)
- Club/team announcements, in-app inbox, email, Web Push; notification preferences.
  Hooks from call-ups, transport, overdue fees, expiring documents.

### M13 Privacy, consent and audit (Heavy)
- GDPR consents (guardian consent for minors, image rights), data export and erasure,
  audit log of sensitive reads/writes, retention rules, privacy notice page.

### M14 Dashboards and reports (Standard)
- Role-based home dashboards (coach: next sessions and attendance; treasurer: overdue;
  direção: membership and finance overview); CSV/PDF exports.

## Ongoing (Light)

- User guide in Portuguese (`docs/guia/`), copy and translation fixes, dependency updates,
  PR babysitting.

## Optional, later

- `fixtures-import` standalone repo (regional association fixtures and results).
- Match reports and player stats.
- Online shop for kit / club merchandise.

## Dependencies

```
M0 → M1 → M2 → M3 → M4
               M3 → M5 → M6 → M7 → M8
                     M5 → M9
                     M5 → M10 (needs pt-payments repo)
                     M5 → M11 → M13
                     M7 → M12
                     M7, M10 → M14
```
