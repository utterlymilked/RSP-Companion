# ADR 0012: Privacy tooling

- Status: Accepted
- Date: 2026-10-16

## Context

The club stores personal data of minors and, from M13, health data (GDPR art. 9). People must
be able to give and withdraw consents, get a copy of their data, ask for erasure, and delete
their login from inside the app (App Store rule 5.1.1(v)). The office needs a queue for these
requests, a way to carry out an erasure, and a view of the audit log. Data with no further
use must go away on its own. Earlier ADRs left hooks for this: references in the audit log
are nulled on delete (0003), person-describing rows cascade (0002), document files must be
deleted before the rows (0009), prospects carry `retainUntil` (0007), and the notice must
name the push processors (0004, 0010).

## Decision

Module `privacy` at `/api/privacy`, plus an extended `/api/audit-log`.

1. **Consents** (`consents`): kinds `image_rights` and `transport` (a Postgres enum), with
   who gave it (a person), when, when withdrawn, and who recorded it. History is kept; one
   active row per person and kind (partial unique index). Under `CONSENT_AGE` (18, same as
   health) a guardian gives it (409 `not_a_guardian`); adults give their own (409
   `invalid_grantor`). Health consent stays in its own table (ADR 0008).
   - Who: the person or a guardian in their own name in the app; the office
     (`consents.write`: admin, secretaria) recording a paper form. Withdrawing: the person,
     a guardian or the office. Reading: the person, guardians, and `consents.read` in scope
     (admin, secretaria club-wide; coaches and delegados for their team), plus a team roster
     view, so coaches know who may appear in photos. Every change is audited
     (`consent.changed`).
2. **Export** (`GET /people/:id/export`, arts. 15 and 20): one JSON document with the person
   row and everything that refers to them, for the person or a guardian and for
   `privacy.manage` (admin). Health records are left out (`excluded: ["health_records"]`):
   admin has no health access (ADR 0003) and whether guardians receive a psychologist's
   notes is a clinical decision; clinical staff provide them on request. Audited
   (`privacy.export`).
3. **Requests** (`privacy_requests`: export, erasure, rectification, other; open, done,
   rejected): anyone signed in files one for themself or a ward and sees their own; the
   office (`privacy.manage`) sees all and resolves them.
4. **Erasure** (`POST /people/:id/erase`, admin only): refused with 409 `erasure_blocked`
   (reasons in `issues`) while fee charges exist (accounting records the law requires the
   club to keep, art. 17(3)(b)) or an item is still on loan. Otherwise the stored files are
   deleted first (a failure stops before any row changes), then in one transaction:
   evaluations, returned loans, incident involvement, carpools the person offered, their
   logins, and the person row, whose cascades remove the rest (guardianships, rosters,
   call-ups, documents, health records, consents). Sales keep the stock movement without the
   buyer. The audit log keeps a `person.erased` entry with counts only. The last admin
   cannot be erased (409 `last_admin`).
5. **Account deletion** (`POST /account/delete`): deletes the caller's login at once
   (sessions, roles, inbox and devices cascade); the person record belongs to the club and
   stays, unless the user ticks "also erase my data", which files an erasure request for the
   office. The last admin cannot leave. No password re-entry: the screen asks to confirm.
6. **Retention job** (`runRetention`, at start-up and every six hours, idempotent): deletes
   prospects past `retainUntil`, audit entries older than 36 months, notifications older
   than 12 months, closed requests older than 36 months, unaccepted invitations 30 days
   past expiry, and expired sessions and sign-in tokens; one `retention.purged` entry with
   the counts. Periods live in `RETENTION` (`@rsc/shared`) and are placeholders until the
   club confirms them.
7. **Audit viewer**: `GET /api/audit-log` gains an `action` filter and returns actor and
   subject names read at request time (null once erased). Screen "Registo de acessos".
8. **Privacy notice**: a public route `/privacy` in the app (also the URL the stores ask
   for), listing Hetzner, Brevo, Expo, Apple and Google as processors.

New permissions: `consents.read`, `consents.write`, `privacy.manage`. New audit actions:
`consent.changed`, `privacy.export`, `person.erased`, `account.deleted`, `retention.purged`.

## Alternatives considered

- **Anonymise instead of delete** (keep the row, blank the fields). Keeps fee history
  linked, but receipts must identify the payer, and a half-empty person would still appear in
  rosters and exports. Blocking until the legal period ends is simpler and honest.
- **Soft delete with a grace period.** Adds a state every query must filter. Backups already
  give 30 days to recover from a mistake.
- **Include health records in the export.** Rejected for now (see 2); revisit with the
  club's clinical staff.
- **Health retention by the job.** Not done: how long clinical records of former athletes
  are kept is a decision for the club's doctor (asked in the questionnaire).

## Consequences

- Erasure needs the documents storage configured when the person has files (503
  `storage_unavailable` otherwise).
- Backups still hold erased data until they rotate out (30 days); the notice says so.
- Former members are not purged automatically; the office erases them on request or when the
  club sets a rule.
- Adding a consent kind or request kind is an enum migration.
