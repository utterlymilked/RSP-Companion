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
  reachable by deep link (`rsc://` in dev); role-aware home from `GET /api/me`.
- Component tests with `jest-expo` + React Native Testing Library.
- Server serves the web build (`apps/mobile/dist`) in production; delete the retired
  `apps/web` placeholder.
- Done when: a user can log in on an Android and an iPhone (Expo Go or a development build)
  and on the web, switch language, and see a role-based home.
- Delivered: tabs Início / Utilizadores (users.manage, read-only list) / Conta; home lists the
  user's roles and the areas their permissions open. Magic links return to the native app as
  `rsc:///?cookie=…`; reset links use `redirectTo` on the app scheme. The server serves the
  web build when `WEB_DIST_DIR` is set. Mobile tests run on Jest (`apps/mobile/test/` for
  screens, since every file in `app/` is a route).

### M4 Deployment and backups ✅ (Standard)
- Dockerfile (single image), `deploy/compose.yml` (app, Postgres, Caddy), env docs, nightly
  `pg_dump` to S3-compatible storage, documented restore drill, GitHub Action to build and
  push the image. `docs/OPERATIONS.md`. Hetzner VPS, accounts owned by Pedro.
- Serves `/.well-known/apple-app-site-association` and `assetlinks.json` so email links open
  the app (universal links / App Links).
- Done when: staging is reachable over HTTPS and a backup has been restored once.
- Delivered (without a server yet): esbuild server bundle; one image with API and web build
  that migrates on start; `deploy/` stack with Caddy HTTPS; `backup.sh` / `restore.sh`
  (rclone to S3, restore drill into `rsc_restore_check`); `image.yml` publishes
  `ghcr.io/…:main` and `:sha-<commit>` and deploys over SSH once `DEPLOY_HOST` is set;
  well-known files from `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256`. Stack, backup and both
  restore modes tested locally. Ops workflow (`ops.yml`, `deploy/ci.sh`) sets up the server
  and runs deploys, backups and restore drills from GitHub; settings live in Actions
  variables and secrets. Staging live at https://178-105-48-29.sslip.io since 2026-10-15
  (Hetzner Cost-Optimized x86); first backup uploaded to Hetzner Object Storage and
  restored into `rsc_restore_check` the same day.

### M4b Mobile release pipeline (Standard)
- **Deferred** (Pedro, 2026-10-15): no store registration yet. Interim: test Android APKs from
  every merge to `main` (`android-apk.yml`, see OPERATIONS.md#android-test-apks). iOS testing
  needs the Apple account, so it waits for this task.
- EAS project and build profiles (development, preview, production) with
  `EXPO_PUBLIC_API_URL` per profile; signing credentials in EAS; app icon and splash.
- Google Play internal testing track and TestFlight; store listings in Portuguese and
  English, privacy policy page, App Store privacy labels, reviewer demo account.
- EAS Update channel for JavaScript-only fixes; GitHub Action to build and submit on demand.
- Needs Pedro: Apple Developer and Google Play accounts (club's name, D-U-N-S), final bundle
  identifier and domain.
- Done when: testers install the app from TestFlight and Play internal testing.

## Phase 1: The club's first priorities

### M5 People and teams registry ✅ (Standard)
- CRUD for people, guardians, member numbers and status; teams per season and rosters;
  staff functions. Search/filter lists.
- Import scripts (`scripts/`) for the club's current spreadsheets (and EM JOGO export if any).
- Skill: `.claude/skills/new-module/` (schema → service → routes → shared schemas → screens →
  tests), written from this module as the reference implementation.
- Delivered: people list/search/create/update, guardians, memberships (member numbers),
  teams and rosters, classes and enrolment, staff assignments (API + tests); app tabs
  People and Teams with person and team screens and a new-person form; `pnpm people:import`.
  Not yet in the app: editing a person, managing guardians, memberships, rosters and staff
  assignments (the API supports them); they come with the screens that need them.

### M6 Rooms and fields booking ✅ (Standard)
- Venues and spaces (home complex campos 1/2/3, bookable whole or in parts, see UX follow-up 9; auditório, meeting rooms, gym,
  gabinetes), external grounds as a venue list.
- Bookings by department with activity type, target group, the club's status workflow
  (a confirmar → confirmado → realizado, anulado, reagendar…), expected vs actual attendance;
  recurring bookings, conflict detection, week/day views per space, iCal feed.
- Import script for the current room-booking sheet.
- Delivered: venues, spaces and combinations (campo 2+3), bookings with conflict detection
  and weekly recurrence, status workflow, attendance; coaches and delegados request bookings
  for their own team; week view per space, booking form and detail in the app; personal iCal
  subscription link; `pnpm bookings:import`. See ADR 0005 and ARCHITECTURE.md.

### M7 Incident log ✅ (Standard)
- Ocorrências: type (injury, discipline, facility/material damage, match incident),
  date/place, people involved, description, attachments, follow-up status.
- Visibility by type and sensitivity tier (an injury report feeds M13 for clinical staff).
- Drafts can be written offline (queued mutation, replayed with an idempotency key);
  photos from the camera.
- Delivered: incidents with people involved, status and follow-up (API + tests); injury reports
  restricted to clinical roles and the reporter, others see a summary; idempotent creation by
  `clientKey`; Ocorrências tab with list and filters, report form and detail with status and
  follow-up for the office. See ADR 0006. Not yet: attachments and camera photos, the offline
  draft queue in the app, choosing people involved in the form (the API supports all three
  server-side except attachments).

### M8 Equipment and stores ✅ (Standard)
- Economato: inventory of balls, bibs, kits with sizes and stock; loans to athletes/teams and
  returns; kit sales that create charges for the fees ledger (M12); stock alerts.
- Delivered: items per size, append-only stock ledger (stock = sum of movements, never below
  zero: 409 `insufficient_stock`), receipts, losses, counts and sales (buyer and price recorded
  for M12 to turn into charges), loans to a person or team with whole returns, low-stock flag
  and filter (API + tests); Economato tab (stores, staff, admin) with list, new item, item
  screen with movements, team loans and returns. Not yet in the app: choosing a person for a
  loan or sale (the API supports it), editing items, partial returns, push alerts for low stock.

### M9 Player evaluations and scouting ✅ (Standard)
- Configurable evaluation templates (criteria, scales), evaluations of own athletes over
  time, performance history per athlete.
- Scouting and recruitment: external prospects, reports, pipeline status. Prospect data has
  its own retention rules.
- Import of existing Google Forms responses.
- Delivered (ADR 0007): immutable templates (criteria, scale 2 to 10), evaluations scoped to the
  athlete's team (coaches their own, team managers read), history per athlete, prospects
  separate from `persons` with a pipeline status, ratings reports and a mandatory retention
  date (12 months default, expired ones flagged); API + tests; Scouting tab, evaluation history
  from the person screen, new evaluation and new template screens. Not yet: Google Forms
  import (needs the form columns), athlete/guardian access to their own evaluations, charts
  of progress, editing prospects in the app, deleting expired prospects (M17).

### M10 Calendar and events ✅ (Standard)
- Trainings (recurring, per class), matches (competition, round, format fut 3/4/7/11,
  opponent, home field or away ground, kit, transport, medical cover), club events; events
  reserve spaces through M6 bookings. Import script for the current matches sheet.
- Delivered: events with kind, team, status (scheduled, postponed, cancelled, played), weekly
  recurring trainings, match details (competition type, round, format, opponent, home/away,
  kit, transport, medical cover) and optional space reservation through M6 bookings, kept in
  step on time and status changes (409 `booking_conflict` when the space is taken); coaches and
  delegados write for their own team and their reservations stay requests; `pnpm events:import`
  for the matches sheet (events only, teams and external venues matched by name); API + tests;
  Agenda tab (week view with team filter), new event and event detail screens. Not yet: iCal
  feed for events, editing a whole training series at once, changing the space of an event,
  call-ups and attendance (M11).

### M11 Call-ups and attendance ✅ (Standard)
- Match call-ups (convocatórias) with notification hook points, RSVP by athletes/guardians,
  attendance taken by coaches (works offline at the field, replayed when back online),
  attendance stats. Availability status is added once M13 lands.
- Delivered: call-ups per event (whole current roster or chosen people), answers
  (going / not going, with note) from athletes and from guardians for their wards, attendance
  (present, absent, excused) taken by coaches, delegados and the office for their team;
  attendance marks carry the device time and the server keeps the newest, so a queue
  replayed after being offline is safe (the app queues marks in local storage and sends them
  when online); per-person attendance stats for a team and period; screen "Convocatória e
  presenças" on the event, call-ups with answer buttons on the home screen, attendance on
  the team screen. Permissions `callups.read` / `callups.write`. Not yet: notifications to
  called-up people (M15 plugs in at `POST /api/callups/events/:id`, which returns the ids
  newly called up), availability status (M13), editing the roster of a call-up from a
  squad picker, iCal.

## Phase 2: Money, health and communication

### M12a Fees ledger ✅ (Heavy)
- Fee plans per season (optionally per escalão), charges with discounts and due dates,
  manual payments with receipt numbers, overdue report; kit sales from M8 become charges.
- Delivered: plans, charges (single, from a plan for many people, from an economato sale,
  once per sale), payments that cannot exceed the charge (409 `overpayment`), cancellation
  that keeps the record, status derived from payments and due date (Lisbon), overdue report
  per person (API + tests; `fees.read` / `fees.write` for admin and treasurer only). Finanças
  tab with filters, new charge by person search, charge screen with payments and receipts.
  Not yet: PDF receipts, editing charges, plan screens and bulk billing in the app, guardians
  and athletes seeing their own charges, discount rules, push reminders (M15).

### M12b Payment gateway (Heavy, needs the `pt-payments` repo)
- Multibanco references and MB WAY via the standalone `pt-payments` package (built first in
  its own repo), signed webhooks that record payments against charges.

### M13 Health and performance records ✅ (Heavy)
- Clinical records per discipline (doctor, nurse, physio, nutritionist, psychologist),
  injuries and return-to-play, derived availability status shown to coaches without details.
- Strict tier `health` access, audit of every read, guardian consent for minors.
- Delivered (ADR 0008): clinical notes and injuries per discipline (each role reads and writes
  its own only), return to play (`active` → `return_to_play` → `cleared`), derived
  availability for coaches (`GET /api/health/availability`, team list on the team screen),
  guardian consent required for under-18s, audit of every health read and write. Saúde tab
  and record screen in the app.
  Not yet: athletes and guardians reading their own records, availability in call-ups,
  structured measurements (weight, tests, load), attachments (M14), class-scoped coaches.

### M14 Documents and expiry tracking ✅ (Standard)
- Uploads (document picker or camera) to S3-compatible storage with signed URLs; medical exam, federation registration,
  ID documents; expiry dates and reminders; visibility by role.
- Delivered (ADR 0009): `documents` table and `/api/documents` (upload as raw body, 10 MB,
  PDF/JPEG/PNG; 5 minute signed download URLs; S3 or local directory storage; list, delete,
  expiring report). Medical exams are health tier (medical roles only), the rest need
  `documents.write`; coaches see kind and expiry of their team. Documentos tab with the
  expiring list, per-person screen with picker and camera, link from the health record.
  Not yet: reminders (M15 reuses `GET /expiring`), athletes and guardians seeing their own
  documents, "required documents" per role (open question), expiry for staff without a team.

### M15 Announcements and notifications ✅ (Standard)
- Club/team announcements, in-app inbox, email, push notifications (`expo-notifications`,
  device tokens per user, sent through Expo's push service to APNs/FCM; payloads without
  personal data), web push only if worth it; notification preferences.
  Hooks from bookings, call-ups, incidents, overdue fees, expiring documents.
- Delivered (ADR 0010): `announcements`, `notifications`, `push_devices` and
  `notification_preferences` tables; `/api/announcements` (club or team, `announcements.write`,
  coaches and delegados for their team) and `/api/notifications` (inbox, read marks, device
  registration, channel preferences). Push through Expo with generic text, email opt-in.
  Hooks: call-ups, and daily document-expiry reminders (30 days, 7 days, the day). Avisos tab
  with the inbox and the announcement form, push registration after sign-in, channel switches
  on the account screen.
  Not yet: hooks for bookings, incidents and overdue fees, web push, quiet hours, per-kind
  preferences, announcement attachments. Push needs an EAS project id in `app.json`
  (`extra.eas.projectId`), created with M4b's store setup.

### M16 Transport ✅ (Standard)
- Away-game transport: club van seats and parent carpool offers, assignment of athletes to
  vehicles, pickup point/time, driver contact visible only to participants.
- Delivered: rides per event (club van or carpool, seats, pickup point, notes), passengers
  limited to people called up (409 `not_called_up`), seat count enforced under a row lock
  (409 `ride_full`), a person in one ride per event (seating again moves them). Managers
  (`callups.write` over the event's team) add vans and seat anyone; athletes and guardians
  offer a carpool (they are the driver) and seat themselves and their wards in carpools. The
  driver's phone is returned only to the driver and to people riding with them, never to
  managers by role. Screen "Transporte" on the event and on the home call-ups. No new
  permissions (ADR 0011). Not yet: pickup time input in the app, notifications on seating,
  editing a ride in the app, driver vetting or insurance records.

### M17 Privacy tooling ✅ (Heavy)
- Consent management (guardian consent, image rights), data export and erasure, retention
  jobs, audit log viewer, privacy notice page (lists Expo/Apple/Google as push processors),
  in-app account deletion request (App Store requirement).
- Delivered (ADR 0012): consents for image rights and transport (guardian under 18, the
  person from 18; given in the app or recorded by the office from paper; withdrawn by either;
  team roster view for coaches), JSON export of everything about a person for themself,
  guardians and admin (health records excluded), data requests queue, erasure by admin
  (files first; refused while fee records or open loans exist), in-app account deletion with
  an optional erasure request, retention job (expired prospects, audit log after 3 years,
  notifications after 12 months, stale invitations and sessions), audit log viewer with names
  and an action filter, public privacy notice at `/privacy`. Permissions `consents.read`,
  `consents.write`, `privacy.manage`.
  Not yet: retention of health records and of former members (club decision), consents in
  call-ups and transport screens, team consent list in the app, exporting health records,
  the club's contact address in the notice.

### M18 Dashboards and reports ✅ (Standard)
- Role-based home dashboards and CSV/PDF exports.
- Delivered (ADR 0013): home widgets (events next 7 days, overdue fees, low stock, equipment
  on loan, open incidents, expiring documents, open data requests), each shown only to
  club-wide holders of the matching permission; CSV exports of overdue fees, stock and
  expiring documents (download on web, share sheet on phones). No new permissions.
  Not yet: PDF export, team-scoped dashboards for coaches, charts and trends.

### M19 Usable app: Portuguese, demo data, design ✅ (Heavy)
Pedro's first test (2026-10-16): the app looked like empty shell menus, in English, with a
crowded tab bar. Seven PRs:
1. Portuguese by default whatever the phone's language; PT | EN switch on sign-in and
   account. ✅
2. Fake demo data for every module and an Ops action to load it on staging, with demo logins
   per role (Ops task `seed-demo`). ✅
3. Redesign in the club's colours: five bottom tabs (Início, Agenda, Equipas, Mensagens,
   Mais), a real home dashboard, cards, a week view and empty states. ✅
4. Reservas rework (Pedro, 2026-10-16: chip walls and stacked buttons rejected): a tappable
   floor plan of the complex showing what is free, requested or taken at a chosen time, a
   calendar (day by space, week, month) and a list; space and status pickers as bottom
   sheets; booking from the plan or a free slot prefills the form. The plan is schematic
   until the club sends its real plans (questionnaire question `plantas`). ✅
5. Selection controls everywhere (Pedro, 2026-10-16: a wall of 17 role buttons in the
   invite form rejected): `docs/UI_GUIDELINES.md` (Material 3, HIG, NN/g), a shared
   `Select` / `MultiSelect` combo box (dropdown on desktop, sheet on phones, searchable),
   and `Choice` picking segmented or select by option count on every screen. ✅
6. User management (Pedro, 2026-10-16): a screen per user under Mais › Utilizadores to add
   and remove roles (coach and delegado per team or class), link or unlink the person
   record (search by name), deactivate and reactivate the login; pending invitations with
   resend and cancel; the invite form takes team roles and the person too. ✅
7. Booking like TheFork (Pedro, 2026-10-16: the ±30 min time stepper and the clicks
   rejected): fields and rooms as separate categories, a tapped space opens in a bottom
   sheet with its free times, and `booking/new` becomes steps (space on the plan, day on a
   calendar, a free start time for a chosen length, confirm), skipping what is already known.
   Agenda gets tappable days and day / week / month views. Pattern in `docs/UI_GUIDELINES.md`. ✅
8. Reservations visibility (Pedro, 2026-10-16): Reservas is the club contact's main
   requirement, so it is now a bottom-bar tab (Equipas moved to Mais) with a home shortcut;
   "Minhas reservas" (`/booking/mine`, `GET /api/bookings/mine`: upcoming and past, cancel
   upcoming); taken slots stay visible, greyed, with who holds them and for what; every list,
   calendar block and the detail show the team and who made the booking. Privacy: names are
   visible to every role with `bookings.read` (staff roles, coaches, clinical, scouts), never
   to athletes or guardians, who have no calendar access. Follow-up (Pedro, same day): taken
   segments are tappable with an owner sheet and carousel for back-to-back bookings, greyed
   starts explain the overlap, and creating a booking shows a success screen and a toast. ✅
9. Identity and Excel import (business partner's notes, 2026-10-16): `persons` is the one
   identity (`identity_code`, `is_pseudonymous`) with a `players` profile, so players can
   exist without personal data; `.xlsx` import of players and teams with template, preview
   and per-row errors (`/api/imports`, Mais › Importar). ADR 0015. ✅
9. Pitch parts (Pedro, 2026-10-16: the field split was wrong and hard-coded): campo 1 whole,
   campo 2 whole / halves / thirds, campo 3 whole / halves, configurable in the app under
   Mais › Espaços e campos, with geometric overlap (ADR 0016), part-aware plan, booking
   flow, greying and agenda. ✅
11. Weekly timetable (Pedro, 2026-10-17): Reservas › Horário shows Monday to Sunday per pitch
    (or room), 17:00–22:00 by default and configurable, a column per part of a divided pitch,
    free times tappable, plus Imprimir (web, A4 landscape, one page per pitch), PDF and Excel
    (`GET /api/bookings/timetable`). One layout in `@rsc/shared` (`timetable.ts`) feeds app
    and files. ✅

### M20 In-app tester feedback ✅ (Standard)

`tester` role, draggable feedback bubble with screen context, `feedback` table and admin screen,
Markdown export (`pnpm feedback:export`, Ops task `export-feedback`, `docs/feedback/`). ADR 0014.

## Phase 3: Fleshing out (from the 2026-10-17 re-read of the answers)

Order follows the reservations-first priority. Details in REQUIREMENTS.md "Answers re-read 2026-10-17".

### M21 Booking requests for all staff and change notifications ✅ (Standard)
- Any staff role (clinical, scouting, recruitment, economato, treasury, sociologist) may request a
  booking for their gabinete (`bookings.request`); it stays `to_confirm` until an approver confirms.
- Who approves is a club setting, not code: `club_settings` key `bookings`, `approverRoles`
  (default direção and secretaria; direção is always included), edited by admins under
  Mais › Espaços e campos (`/api/settings/bookings`). The contact's answer on who approves
  (secretaria/direção or Diretor da Entidade Formadora/Diretor de Campo) only changes this setting.
- Notifications (kind `booking`, generic text): approvers on a new request; the requester and a
  confirmed booking's team on confirm, cancel or move.

### M22 Weekly training plan and changing rooms ○ (Standard)
- Changing rooms as bookable spaces on the plan; import of the weekly training plan per escalão
  and class as recurring bookings (Excel/CSV, preview, conflicts listed). Waiting on the plan file.

### M23 Staff documents and expiry reminders ○ (Standard)
- Staff document kinds (coaching licence, professional card, diplomas, first aid/defibrillator),
  required documents per role, reminder notifications one month before expiry, "missing documents" report.

### M24 Permission grants for contacts and clinical history ○ (Heavy)
- Time-limited, revocable grants by direção/secretaria (contacts of a team's athletes for a coach)
  and by direção/head of the medical office (athlete or guardian sees own clinical history).
  Replaces the blanket "own team sees contacts" default; ADR needed, supersedes part of ADR 0003.

### M25 Configurable retention ○ (Standard)
- Retention periods for former members, health records and prospects as club settings
  (default unlimited), enforced by the existing retention job.

### Later: Google Forms replacement in daily use
- Public intake form for observation requests (M9 gap), incident form fields (suggestion type,
  context, reporter role), staff intent and trainee evaluations, document acknowledgements.

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
                     M5 → M8 → M12a → M12b (needs pt-payments repo)
                     M5 → M9
                     M7 → M13 (adds availability status to M11)
                     M5 → M14, M15, M16, M17, M18
```
