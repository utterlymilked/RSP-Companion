# ADR 0018: Staging as an invite-only sandbox with a demo-account picker

- Status: Accepted
- Date: 2026-10-17

## Context

Testers need to try every role on staging without juggling passwords, and staging must not
be open to strangers. The repository and its Actions logs are public, so a demo password
printed in a job log is public too.

## Decision

- **No public sign-up, anywhere.** Better Auth runs with `disableSignUp`; accounts come from
  invitations or the create-admin task (ADR 0003). Staging has its own database (ADR 0017).
- **Demo-account picker on staging only.** `DEMO_MODE=true` (set by `deploy/ci.sh` for the staging
  stack, absent on prod) mounts `GET /api/auth/demo/accounts` and `POST /api/auth/demo/sign-in`.
  The second opens a session for one of the fixed fake `DEMO_LOGINS` without a password;
  real accounts are refused, and on prod the routes do not exist. The sign-in screen and
  Conta show a "Conta de demonstração" combo box that calls them.
- **Demo passwords are random and never printed.** `seed-demo` and `reset-demo` no longer echo
  the password; nobody needs it. Passwords printed by earlier runs are replaced by the next
  `reset-demo`.
- **Not chosen:** Caddy basic auth (breaks the native app, OTA update requests and the APK's
  API calls) and a fixed shared demo password (public once written anywhere).

- **Tester access code (amendment, 2026-10-17).** The picker was open to anyone who knew the
  address. `DEMO_ACCESS_CODE` (24 hex characters, only in the staging server's `local.env`,
  generated on first deploy) is now required by both demo endpoints (`POST /demo/accounts`
  lists, `POST /demo/sign-in` opens a session), compared in constant time and rate limited to
  8 tries a minute per address. `GET /demo/status` only says the sandbox exists, so the sign-in
  screen shows a "Tenho um código de testador" link; account names appear after unlocking. The
  owner receives the code by email (Ops `demo-code`) and hands it to testers; `rotate-demo-code`
  replaces it. The code is never printed, since the Actions logs are public.

## Consequences

Without the code, staging exposes nothing beyond what any deployment does: sign-in and the
password flows (sign-up is off), `/api/health` (version) and the public web bundle. Every other
route answers 401 without a session. Anyone holding the code can open the demo accounts, which
hold only invented data and cannot create accounts.
