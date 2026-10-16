# ADR 0007: Evaluations and scouting

- Status: Accepted
- Date: 2026-10-16

## Context

The club evaluates its athletes and scouts external players, today in Google Forms. Evaluation
criteria and scales are not yet confirmed by the club (open question `avaliacoes`), so they
must be configurable. Evaluations are performance data about (often minor) members;
prospects are not members at all, and keeping data about outsiders indefinitely is the
riskiest part of scouting under the GDPR.

## Decision

1. **Templates** (`evaluation_templates` + `evaluation_criteria`): a name, a scale (1 to
   `scaleMax`, 2 to 10) and an ordered list of criteria. Criteria and scale are **immutable**
   after creation, so old evaluations stay comparable; a template can be renamed or retired.
2. **Evaluations** (`evaluations` + `evaluation_scores`): one row per athlete, template and
   date with a score per criterion (validated against the template and its scale) and an
   optional comment. History per athlete is a list newest first. They are personal-tier data,
   not health data.
3. **Access follows the athlete's teams.** `evaluations.read` / `.write` are checked against
   the athlete's current teams and classes (`personScope`), so a coach reaches only their own
   athletes; admin and staff club-wide; team managers read only. `evaluations.manage`
   (templates) is admin and staff. Athletes and guardians do not see evaluations yet.
4. **Prospects** (`prospects` + `prospect_reports`) are a separate table, **not** `persons`:
   name, birth year, current club, position, notes, pipeline status (identified, observed,
   shortlisted, invited, trial, offered, signed, declined, discarded) and reports (date, rating
   1 to 5, text). Amended 2026-10-16: the club's observation request form also asks for
   birth date, guardian (or own) contact, target escalão, context, positions, height, seasons,
   identification type, nationality, birthplace, residence, preferred/scheduled trial dates
   and venue, current-club authorisation, motive and goal, so these are stored as optional
   fields. Contacts are therefore kept, under the same retention; ID numbers are not.
5. **Retention**: every prospect has a mandatory `retain_until` (default 12 months after
   creation, `PROSPECT_RETENTION_MONTHS`). The API flags expired prospects (`expired`,
   `?expired=true`); deleting them belongs to the privacy tooling (M17). When a prospect signs,
   the club registers them in the people registry; nothing is copied automatically.
6. **Permissions**: `scouting.read` / `.write` for scout, recruiter, admin and staff.

## Alternatives

- Prospects as `persons`: rejected, it would put outsiders into registry lists, rosters and
  exports and mix their retention with members'.
- Editable templates: rejected, history would silently change meaning.

## Consequences

- The 12-month default is a placeholder until the club answers (questionnaire `scouting`).
- Importing the Google Forms responses needs a sample of the form columns; not built yet.
