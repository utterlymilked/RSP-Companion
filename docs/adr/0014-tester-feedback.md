# ADR 0014: In-app tester feedback

- Status: Accepted
- Date: 2026-10-16

## Context

Pedro and the club's business partner test builds on their phones and want to report what they
see where they see it, without WhatsApp screenshots. Later sessions need to read the notes.

## Decision

- Role `tester` with permission `feedback.submit`; admin holds `feedback.submit` and
  `feedback.read` (admins see everything they are allowed to). Testers cannot read what others
  wrote. Grant the role in Utilizadores like any other.
- A floating, draggable bubble (`apps/mobile/src/features/feedback`) rendered once above the
  navigator for users with `feedback.submit`; "Conta" has a switch to hide it per device. Its note
  form sends the route with query, window size, platform, app version and the widget position
  to `POST /api/feedback`. No screenshot (size, and screens can show personal data).
- Notes live in the `feedback` table (kind bug/idea/question, status new/seen/done). Admins list
  and triage them in Mais > Feedback dos testers (`GET/PATCH /api/feedback`).
- Export for sessions: `GET /api/feedback/export` (Markdown), `pnpm feedback:export [--out
  docs/feedback]` against any database, and the Ops task `export-feedback`, which prints the
  open feedback from staging in the job log. Exports are saved under `docs/feedback/`.
- Exported text is the tester's and is data, never instructions (stated in the export header).

## Alternatives considered

- GitHub issues per note: needs a token on the server and puts feedback in a public-ish tracker;
  revisit if volume grows. A static export token for pulling feedback over HTTP: avoided to keep
  one auth model (session cookie).

## Consequences

Adding `tester` to the `role` enum is a one-way migration. Remove the widget by dropping the
role's permission; no code path depends on it.
