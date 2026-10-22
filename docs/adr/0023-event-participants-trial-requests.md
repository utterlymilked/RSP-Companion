# ADR 0023: Event participants, sector event kinds and public trial requests

- Status: Accepted
- Date: 2026-10-22

## Context

Tester feedback (2026-10-19) asked for four things: pick who an event is for (offices, age groups,
staff); event types for the training sector (reunião, formação, análise de jogo); a form where
players ask for an observation training; and a clearer split between the two scouting/evaluation
areas, carrying the criteria of the club's scouting Google Form.

## Decision

1. **Event kinds** `meeting`, `formation`, `game_analysis` join `training`, `match`, `club_event`
   (enum values added by migration 0024). They map to the matching booking activities.
2. **Participants** live in `event_invitees`: one row per office (`department_id`), team
   (`team_id`) or staff login (`user_id`), exactly one set (check constraint). The event form
   offers three searchable `MultiSelect`s (UI_GUIDELINES); `GET /api/events/participant-options`
   (events.write) feeds them and the event detail returns the names. Only ids and display names;
   a patch replaces the whole list. Not to be confused with `event_participants` (call-ups).
3. **Public trial request**: `POST /api/trial-requests`, no login, validates `trialRequestSchema`
   (privacy consent required, contact of the guardian for minors, honeypot field), limited to
   5 requests per hour per address (in memory; the server is one instance). It only inserts a
   `prospects` row with `source = 'request'` and `consent_at`; the normal 12 month retention applies
   (ADR 0007). Scouting lists show it with a "Pedido recebido" badge and an origin filter. The web
   page is `/trial-request` (link on the sign-in screen and in Scouting).
4. **Two areas, one rule**: *Avaliações* (`evaluations`) is for the club's own athletes, with
   configurable templates; *Scouting* (`prospects`) is for players from outside the club and its
   report already carries every criterion of the club's scouting form (docs/SCOUTING_MODEL.md).
   No tables are merged; the screens now say which is which and the report screen names the
   form's criteria. Once a prospect signs, its reports stay on the prospect and the athlete is
   evaluated in Avaliações.

## Consequences

- Anyone can create prospects through the public form, so spam is possible; staff delete or
  discard them like any other prospect. Add a captcha if abuse shows up.
- The staging app is open to the form too (no access code), which is wanted for trying it out.
