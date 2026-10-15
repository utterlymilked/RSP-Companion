#!/usr/bin/env bash
# Prepares Claude Code cloud sessions so lint/typecheck/test work immediately:
# installs workspace dependencies and, when the image has Postgres, starts it with the
# same role/database as docker-compose.yml and writes .env. No-op for local sessions.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

if command -v pg_lsclusters >/dev/null 2>&1; then
  cluster=$(pg_lsclusters --no-header | awk 'NR==1 {print $1" "$2}')
  if [ -n "$cluster" ]; then
    # shellcheck disable=SC2086
    pg_ctlcluster $cluster start >/dev/null 2>&1 || true
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='rsc'\"" | grep -q 1 ||
      su postgres -c "psql -c \"CREATE ROLE rsc LOGIN SUPERUSER PASSWORD 'rsc'\"" >/dev/null
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='rsc'\"" | grep -q 1 ||
      su postgres -c "createdb -O rsc rsc" >/dev/null
    [ -f .env ] || cp .env.example .env
    pnpm db:migrate >/dev/null 2>&1 || echo "session-start: db:migrate failed" >&2
  fi
fi
