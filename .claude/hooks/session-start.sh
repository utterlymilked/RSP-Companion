#!/usr/bin/env bash
# Installs workspace dependencies at the start of Claude Code cloud sessions,
# so lint/typecheck/test work immediately. No-op for local sessions.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
