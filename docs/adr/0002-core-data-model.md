# ADR 0002: Core data model and database workflow

- Status: Accepted
- Date: 2026-10-15

## Context

M1 lays the tables every later module builds on: who the people are, which organisation
they belong to, and how a season is organised into escalões, classes (turmas) and teams.
The club's sheets (see `REQUIREMENTS.md`) show several organisations sharing people and
spaces, classes with codes, schedules and monthly fees that can span more than one escalão,
and staff employed by different organisations. Many people are minors, and clinical staff
will later record health data (GDPR art. 9), so privacy has to be part of the shape of the
data, not a filter added later.

## Decision

**Tables** (Drizzle, `apps/server/src/modules/<module>/schema.ts`, all re-exported from
`src/db/schema.ts`):

| Module | Tables | Notes |
| --- | --- | --- |
| organisations | `organisations`, `departments` | Kind: club, SAD, football school, partner, external. Departments are the gabinetes that book rooms and employ staff. |
| people | `persons`, `guardianships`, `memberships` | A person needs no login (users come in M2). Guardianship links two persons; one primary guardian (encarregado de educação) per child, enforced by a partial unique index. Membership = sócio with a member number unique per organisation and at most one open membership per person and organisation. |
| seasons | `seasons`, `age_groups` | At most one current season (partial unique index). Escalões are per season because their birth years shift every year; category is female / male / mixed. |
| teams | `classes`, `class_age_groups`, `class_schedules`, `class_members`, `teams`, `team_members`, `staff_assignments` | A class belongs to a season and an organisation, has a code unique within them, an optional monthly fee in cents and covers one or more escalões. Teams are competition squads. Staff assignments say what a person does in a season (function, employer, optional gabinete, at most one team or class). |

**Conventions**: UUID primary keys (`gen_random_uuid()`); snake_case in SQL and camelCase in
TypeScript (Drizzle `casing: "snake_case"`); `created_at`/`updated_at` as `timestamptz`;
calendar dates as `date` read as `YYYY-MM-DD` strings (no time-zone shifts); money as integer
cents; weekly times as `time` in Europe/Lisbon wall-clock. Fixed value sets (organisation
kinds, staff functions, relationships, categories) are `as const` arrays in `@rsc/shared`
from which the Postgres enums are built. Integrity rules live in the database as unique,
check and foreign-key constraints, named so tests can assert them.

**Deletes**: rows that only describe a person (guardianships, memberships, class and team
membership, staff assignments) cascade when the person is deleted, so erasure (M17) is one
delete. Structural rows (organisations, seasons, escalões) are `restrict`: they cannot
disappear while something points at them.

**Privacy by design**:
- No health data in M1 tables. Clinical records (M13) get their own tables and their own
  access path; `persons` has no free-text notes column so nothing clinical drifts in.
- Every column of `persons` has a sensitivity tier (`general` or `personal`) in
  `PERSON_FIELD_TIERS` (`@rsc/shared`). A test fails when a column is added without a tier.
  Services select columns through `personColumns(tier)`, so lists and rosters return
  general-tier fields only. M2 maps roles to tiers.
- Minors' own contact fields stay empty in seed data; guardians are the contact.
- Consent flags are not booleans on guardianship: M17 adds a consent table with who, what
  and when.

**Workflow**: drizzle-kit generates SQL migrations into `apps/server/drizzle/`
(`pnpm db:generate`), which are reviewed and committed. They are applied by our own script
with Drizzle's migrator (`pnpm db:migrate`), so the production image does not need
drizzle-kit. CI fails if the schema and the committed migrations differ, applies all
migrations to a clean Postgres 17, runs the seed, and runs service tests against a fresh
`*_test` database that the test setup recreates and migrates on every run. Each test runs
in a transaction that is rolled back.

## Alternatives considered

- **One `memberships` table with a function column for athletes and staff** (the first
  sketch in ARCHITECTURE.md). Rejected: athletes and staff carry different data (shirt
  number vs employer and gabinete), and staff also attach to classes and departments.
- **Escalões as global constants**. Rejected: birth years change each season and the club
  defines its own groups (feminino, veteranos).
- **A separate `person_private` table for personal fields**. Stronger isolation, but every
  screen would join two tables and the tier is already enforced by projection; revisit if
  the audit log (M2) needs per-table triggers.
- **PGlite or mocks for tests**. Faster to start, but differences from real Postgres
  (partial indexes, `num_nonnulls`, errors) are exactly what the tests must catch.

## Consequences

- Adding a value to an enum is a migration; removing one needs a data migration first.
- New modules add their schema file to `src/db/schema.ts` and their relations to
  `src/db/relations.ts`.
- Running database tests needs Postgres (Docker locally, a service container in CI, the
  local cluster in cloud sessions). Without one, they are skipped with a warning locally and
  fail in CI.
- `packages/shared` now imports its own files with `.ts` extensions
  (`rewriteRelativeImportExtensions`) so Node can load it as source at runtime.
