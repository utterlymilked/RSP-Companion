# ADR 0019: Developer role

- Status: Accepted
- Date: 2026-10-17

## Context

`admin` is the club's direção: it runs people, fees and users. The person who builds and
operates the app needs every menu and admin screen on prod to support the club, without being
mistaken for (or limited to) a club office. They also must not read children's health records
just because they run the server (ADR 0003).

## Decision

- **New club-wide role `developer`** (migration `0021`). Its permissions are *every* permission
  in the matrix except the clinical ones (`health.<discipline>.read|write`) and `incidents.read_injury` (injury detail), computed from
  `PERMISSIONS`, so new permissions reach it automatically. It therefore sees every tab
  (users, spaces, import, feedback, audit, fees, ...). The Saúde tab opens only as far as
  `availability.read` allows (derived status, never a diagnosis), exactly as for `admin`.
- **Health data: no access by default.** Default is the same as admin. If the developer ever
  needs to debug clinical data, that is a deliberate change to the matrix (and its test), not
  a side effect of the role.
- **Not grantable from the app.** The API refuses to grant the role, invite with it, revoke it
  or deactivate its holder (`403 forbidden`), so a club admin cannot hand it out or lock the
  developer out. It is granted with the Ops task `grant-developer` (`admin_email` = an existing
  login), which runs on the server over SSH and is audited (`role.granted`). Prod included.
- It always counts as a booking approver (`isApprover`) and does not count toward "last admin".
- No data in the repo: the account is chosen at run time through the workflow input.

## Consequences

The role is powerful; protect that login with a strong password. Revoking it is a manual
database change on purpose.
