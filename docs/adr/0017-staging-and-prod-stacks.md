# ADR 0017: Staging and prod stacks on one server

- Status: Accepted
- Date: 2026-10-17

## Context

There was one environment, called staging, holding fake demo data. Testers use it, and every
merge to `main` redeploys it. Real club data must never share a database with demo data or
with an environment that redeploys on every merge. Pedro chose two stacks on the current
Hetzner server for now and a separate server later.

## Decision

- **Two stacks, same image build.** Each has its own Postgres database and volume, secrets
  (`local.env`), uploads bucket, backup prefix and web address.
  - `staging`: `/opt/rsc`, Compose project `rsc`, deploys on every merge to `main`, demo data.
  - `prod`: `/opt/rsc/prod`, Compose project `rscprod`, deploys only when someone runs the Ops
    workflow with `stack = prod` and a pinned image tag (`sha-<commit>`). Real data is entered
    only through the app; the demo tasks (`seed-demo`, `reset-demo`) refuse to run on prod.
- **One Caddy.** Ports 80 and 443 belong to the staging stack's Caddy (profile `edge`), which
  reaches both apps by alias on the external Docker network `rsc-edge` (`staging-app`,
  `prod-app`). Prod has no Caddy of its own. Prod address: `PROD_DOMAIN`, default
  `prod.<DEPLOY_HOST>` (an sslip.io name that resolves to the same IP); later
  `app.realsportclube.com` by setting `PROD_DOMAIN` and an A record.
- **Secrets and settings.** Prod reads the shared Actions settings (SMTP, backup credentials,
  deploy key) and its own `PROD_STORAGE_S3_*` for uploads (a separate bucket). Prod's auth
  secret and database password are generated on the server on the first prod deploy and never
  leave it. The first prod admin is created with the existing `create-admin` script or an
  invitation, never a password in chat or the repo.
- **Backups.** Staging holds only demo data, so it keeps exactly one dump (`db/`, each nightly
  run replaces the previous one: catastrophe insurance only). Prod uses `db-prod/` with the
  30-day retention at 03:20 UTC. The disk alert watches the host disk and so covers both.
- **App.** Superseded by ADR 0020: a native build is wired to one stack at build time (production
  app to prod, tester app to staging); there is no server switch. The web app is served by its
  own stack and always uses its own origin.

## Consequences

- Both stacks share one disk, CPU and RAM (a second idle Postgres is about 100 MB); a separate
  server later means running the same compose file there with its own Caddy.
- Staging going down (or its Caddy) takes prod's HTTPS down too until a separate edge exists.
- Over-the-air updates are per variant and per stack (ADR 0020). Release prod from the same
  commit staging runs, or bump `runtimeVersion` for incompatible changes.
- Prod releases are manual by design; there is no automatic promotion.
