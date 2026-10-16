# ADR 0008: Health records, injuries and availability

- Status: Accepted
- Date: 2026-10-16

## Context

M13 stores special-category data (GDPR art. 9), mostly of minors. ADR 0003 already fixed the
rules: only clinical roles read health data, each for its own discipline; the direção has no
access; coaches get a derived availability status, never the record; every read is audited.
What the clinical roles record in detail is still an open question for the club
(`REQUIREMENTS.md`), so the model is deliberately small.

## Decision

- **Tables** (`modules/health`): `health_notes` (free-text clinical note per discipline and
  date), `injuries` (body part, description, start, status `active` → `return_to_play` →
  `cleared`, impact `unavailable` / `limited`, expected return) and `health_consents`.
  Each row carries the discipline that wrote it. Nothing health-related lives on `persons`.
- **Access**: `GET /api/health/people/:id/records` returns the rows of the disciplines the
  caller may read (`health.<discipline>.read` over the person's teams) and calls
  `authorizeHealthRead()` for each, which audits. Writes call `authorizeHealthWrite()`
  (same check, audit action `health.write`, discipline only, never content). An injury of
  another discipline answers 404 so its existence does not leak. A physio therefore cannot
  clear a doctor's injury; the doctor does, or records a separate physio injury.
- **Availability**: `deriveAvailability()` returns `unavailable` while any open injury is
  `active` and `unavailable`, `limited` for any other open injury (including return to
  play), `available` otherwise. `GET /api/health/availability` returns only
  `{ personId, fullName, status }` for `availability.read` holders; scoped roles (coach,
  team manager) are limited to their teams. Without `teamId` it lists only people who are
  not fully available. Class (turma) scoped roles are not covered yet.
- **Guardian consent for minors**: under 18 (`HEALTH_CONSENT_AGE`) an active consent is
  required before a note or injury is created (409 `consent_required`). Consent is given by a
  guardian of the athlete (409 `not_a_guardian` otherwise), recorded by `health.consent`
  holders (admin, secretaria and the clinical roles; the consent itself is not clinical
  data) and audited (`health.consent`). Withdrawing blocks new records; existing ones stay
  until retention and erasure are built in M17. An unknown birth date counts as adult.
- **Not stored in the audit log**: diagnoses, notes or any value; only ids and discipline.

## Alternatives considered

- **One shared clinical record readable by every clinician.** Easier for the team, but it
  contradicts ADR 0003 and the club has not asked for it. Revisit if doctors and physios
  ask; it is a change to the matrix, not to the schema.
- **Availability set by hand by the coach.** Wrong source of truth and no audit trail; the
  status must follow the clinician's decision.
- **Row-level security in Postgres.** Still deferred (ADR 0003): the rule depends on
  discipline and team scope that the app already evaluates in one place.

## Consequences

- Athletes and guardians cannot yet read their own records; coaches' availability does not
  feed the call-up screen yet. Both are follow-ups.
- Nutrition and psychology reuse the same note table; structured data (weight, tests,
  load) waits for the club's answer on what each discipline records.
- Retention, erasure and a viewer for the audit log come with M17.
