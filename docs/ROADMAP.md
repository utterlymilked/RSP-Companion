# Roadmap

Work is split into modules sized for **one Claude Code thread and one PR each**: big enough
that session start-up is a small share of the work, small enough to fit comfortably in
context. Tasks run one at a time; Pedro gives the go-ahead before each one starts.
Order follows the club's priorities in [REQUIREMENTS.md](REQUIREMENTS.md).

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
React web app, shared package, Biome, Vitest, CI, cloud session hook. Client re-decided as
a mobile app in [ADR 0004](adr/0004-mobile-client.md): Expo for iOS, Android and web, with
a placeholder screen in `apps/mobile`.

### M1 Data foundation ✅ (Heavy)
- Drizzle + Postgres wiring, env config validated with zod, migration workflow
  (`pnpm db:generate`, `pnpm db:migrate`), test DB harness (Postgres service in CI).
- Core tables: Organisation (club, SAD, Escola de Futebol, partners), Department (gabinete),
  Person, Guardianship, Season, AgeGroup (escalão with birth years), Class (turma: code,
  schedule, fee, coach), Team (competition squad), memberships, StaffAssignment.
  Seed script with fake data. Model follows the club's sheets (see REQUIREMENTS.md).
- Module folder convention in place (`apps/server/src/modules/`).
- Skill: `.claude/skills/db-migration/` (how to change schema safely).
- Done when: migrations apply on a clean DB in CI, service tests for core tables pass.
- Delivered: [ADR 0002](adr/0002-core-data-model.md). Escalões are per season; classes
  can span several escalões; athletes and staff are separate tables.

### M2 Authentication, roles and privacy tiers ✅ (Heavy)
- Better Auth (email + password, magic link, invites), sessions, password reset via SMTP.
- User ↔ Person link; RoleAssignment with optional team scope; the club's full role list.
- Permission matrix in `packages/shared/src/permissions.ts`; `requirePermission` middleware.
- Data sensitivity tiers (general / personal / health) and the audit log for sensitive reads.
- Admin bootstrap (first admin via CLI script).
- Done when: login/logout/invite work via API; route tests cover allowed/denied per role and tier.
- Delivered: [ADR 0003](adr/0003-auth-roles-privacy.md). No public sign-up; coach and team
  manager roles are scoped to a team or a class; health access per clinical discipline, none
  for admin; `GET /api/people/:id` returns only the reader's tier. `pnpm admin:create`.

### M3 App shell (iOS, Android, web) ✅ (Standard)
Follows [ADR 0004](adr/0004-mobile-client.md).
- Expo Router navigation (tabs per role), theme tokens and primitives (Screen, Button,
  TextField, ListItem), TanStack Query wired to NetInfo/AppState, i18n (pt-PT and en) with
  `expo-localization`.
- Auth: `@better-auth/expo` plugin on the server (app scheme as trusted origin), Expo client
  with `expo-secure-store`; login, invitation (`/invite?token=`), magic-link and reset screens
  reachable by deep link (`rsp://` in dev); role-aware home from `GET /api/me`.
- Component tests with `jest-expo` + React Native Testing Library.
- Server serves the web build (`apps/mobile/dist`) in production; delete the retired
  `apps/web` placeholder.
- Done when: a user can log in on an Android and an iPhone (Expo Go or a development build)
  and on the web, switch language, and see a role-based home.
- Delivered: tabs Início / Utilizadores (users.manage, read-only list) / Conta; home lists the
  user's roles and the areas their permissions open. Magic links return to the native app as
  `rsp:///?cookie=…`; reset links use `redirectTo` on the app scheme. The server serves the
  web build when `WEB_DIST_DIR` is set. Mobile tests run on Jest (`apps/mobile/test/` for
  screens, since every file in `app/` is a route).

### M4 Deployment and backups 🔄 (Standard)
- Dockerfile (single image), `deploy/compose.yml` (app, Postgres, Caddy), env docs, nightly
  `pg_dump` to S3-compatible storage, documented restore drill, GitHub Action to build and
  push the image. `docs/OPERATIONS.md`. Hetzner VPS, accounts owned by Pedro.
- Serves `/.well-known/apple-app-site-association` and `assetlinks.json` so email links open
  the app (universal links / App Links).
- Done when: staging is reachable over HTTPS and a backup has been restored once.
- Delivered (without a server yet): esbuild server bundle; one image with API and web build
  that migrates on start; `deploy/` stack with Caddy HTTPS; `backup.sh` / `restore.sh`
  (rclone to S3, restore drill into `rsp_restore_check`); `image.yml` publishes
  `ghcr.io/…:main` and `:sha-<commit>` and deploys over SSH once `DEPLOY_HOST` is set;
  well-known files from `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256`. Stack, backup and both
  restore modes tested locally. Remaining: Pedro's server and domain, then the first deploy
  and a restore on it.

### M4b Mobile release pipeline (Standard)
- EAS project and build profiles (development, preview, production) with
  `EXPO_PUBLIC_API_URL` per profile; signing credentials in EAS; app icon and splash.
- Google Play internal testing track and TestFlight; store listings in Portuguese and
  English, privacy policy page, App Store privacy labels, reviewer demo account.
- EAS Update channel for JavaScript-only fixes; GitHub Action to build and submit on demand.
- Needs Pedro: Apple Developer and Google Play accounts (club's name, D-U-N-S), final bundle
  identifier and domain.
- Done when: testers install the app from TestFlight and Play internal testing.

## Phase 1: The club's first priorities

### M5 People and teams registry (Standard)
- CRUD for people, guardians, member numbers and status; teams per season and rosters;
  staff functions. Search/filter lists.
- Import scripts (`scripts/`) for the club's current spreadsheets (and EM JOGO export if any).
- Skill: `.claude/skills/new-module/` (schema → service → routes → shared schemas → screens →
  tests), written from this module as the reference implementation.

### M6 Rooms and fields booking (Standard)
- Venues and spaces (home complex campos 1/2/3, combinable; auditório, meeting rooms, gym,
  gabinetes), external grounds as a venue list.
- Bookings by department with activity type, target group, the club's status workflow
  (a confirmar → confirmado → realizado, anulado, reagendar…), expected vs actual attendance;
  recurring bookings, conflict detection, week/day views per space, iCal feed.
- Import script for the current room-booking sheet.

### M7 Incident log (Standard)
- Ocorrências: type (injury, discipline, facility/material damage, match incident),
  date/place, people involved, description, attachments, follow-up status.
- Visibility by type and sensitivity tier (an injury report feeds M13 for clinical staff).
- Drafts can be written offline (queued mutation, replayed with an idempotency key);
  photos from the camera.

### M8 Equipment and stores (Standard)
- Economato: inventory of balls, bibs, kits with sizes and stock; loans to athletes/teams and
  returns; kit sales that create charges for the fees ledger (M12); stock alerts.

### M9 Player evaluations and scouting (Standard)
- Configurable evaluation templates (criteria, scales), evaluations of own athletes over
  time, performance history per athlete.
- Scouting and recruitment: external prospects, reports, pipeline status. Prospect data has
  its own retention rules.
- Import of existing Google Forms responses.

### M10 Calendar and events (Standard)
- Trainings (recurring, per class), matches (competition, round, format fut 3/4/7/11,
  opponent, home field or away ground, kit, transport, medical cover), club events; events
  reserve spaces through M6 bookings. Import script for the current matches sheet.

### M11 Call-ups and attendance (Standard)
- Match call-ups (convocatórias) with notification hook points, RSVP by athletes/guardians,
  attendance taken by coaches (works offline at the field, replayed when back online),
  attendance stats. Availability status is added once M13 lands.

## Phase 2: Money, health and communication

### M12 Fees, sales and payments (Heavy)
- Fee plans per season (sócio quota, monthly fee per escalão, registration, discounts),
  charges (including kit sales from M8), manual payments, receipts, overdue reports.
- Multibanco references and MB WAY via the standalone `pt-payments` package (built first in
  its own repo), signed webhooks.
- Likely split: M12a ledger, M12b gateway integration.

### M13 Health and performance records (Heavy)
- Clinical records per discipline (doctor, nurse, physio, nutritionist, psychologist),
  injuries and return-to-play, derived availability status shown to coaches without details.
- Strict tier `health` access, audit of every read, guardian consent for minors.

### M14 Documents and expiry tracking (Standard)
- Uploads (document picker or camera) to S3-compatible storage with signed URLs; medical exam, federation registration,
  ID documents; expiry dates and reminders; visibility by role.

### M15 Announcements and notifications (Standard)
- Club/team announcements, in-app inbox, email, push notifications (`expo-notifications`,
  device tokens per user, sent through Expo's push service to APNs/FCM; payloads without
  personal data), web push only if worth it; notification preferences.
  Hooks from bookings, call-ups, incidents, overdue fees, expiring documents.

### M16 Transport (Standard)
- Away-game transport: club van seats and parent carpool offers, assignment of athletes to
  vehicles, pickup point/time, driver contact visible only to participants.

### M17 Privacy tooling (Heavy)
- Consent management (guardian consent, image rights), data export and erasure, retention
  jobs, audit log viewer, privacy notice page (lists Expo/Apple/Google as push processors),
  in-app account deletion request (App Store requirement).

### M18 Dashboards and reports (Standard)
- Role-based home dashboards and CSV/PDF exports.

## Ongoing (Light)

- User guide in Portuguese and English (`docs/guia/`), copy and translation fixes,
  dependency updates, Expo SDK upgrades (about three a year), PR babysitting, keeping
  `REQUIREMENTS.md` current.

## Optional, later

- `fixtures-import` standalone repo (regional association fixtures and results).
- Match reports and player stats. Online shop for kit / merchandise.

## Dependencies

```
M0 → M1 → M2 → M3 → M4 → M4b (needs store accounts)
               M3 → M5 → M6 → M10 → M11
                     M5 → M7
                     M5 → M8 → M12 (needs pt-payments repo)
                     M5 → M9
                     M7 → M13 (adds availability status to M11)
                     M5 → M14, M15, M16, M17, M18
```
