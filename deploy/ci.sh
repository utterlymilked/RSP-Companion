#!/usr/bin/env bash
# Runs on GitHub Actions (.github/workflows/ops.yml) and drives the server over SSH.
#   deploy/ci.sh setup          prepare a fresh server (deploy/setup-server.sh, as root)
#   deploy/ci.sh deploy         write settings, copy deploy/ files, pull and restart, check health
#   deploy/ci.sh backup         run backup.sh now
#   deploy/ci.sh restore-drill  restore the latest backup into rsc_restore_check
#   deploy/ci.sh status         containers, recent app logs and the backup log
# Settings come from the repository's Actions variables and secrets (docs/OPERATIONS.md).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_HOST:?Set the DEPLOY_HOST variable (docs/OPERATIONS.md)}"
: "${DEPLOY_SSH_KEY:?Set the DEPLOY_SSH_KEY secret}"
: "${DEPLOY_KNOWN_HOSTS:?Set the DEPLOY_KNOWN_HOSTS secret}"

install -m 700 -d ~/.ssh
printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
target="${DEPLOY_USER:-deploy}@$DEPLOY_HOST"
remote() { ssh -o BatchMode=yes "$target" "$@"; }
uri() { jq -rn --arg v "$1" '$v | @uri'; }

settings() {
  local value
  emit() { [ -n "$2" ] && printf "%s='%s'\n" "$1" "${2//\'/}"; return 0; }
  emit APP_DOMAIN "$DEPLOY_HOST"
  emit APP_URL "https://$DEPLOY_HOST"
  emit APP_IMAGE "${APP_IMAGE:-}"
  value=""
  if [ -n "${SMTP_LOGIN:-}" ]; then
    value="smtp://$(uri "$SMTP_LOGIN"):$(uri "${SMTP_KEY:-}")@${SMTP_HOST:-smtp-relay.brevo.com}:${SMTP_PORT:-587}"
  fi
  emit SMTP_URL "$value"
  emit MAIL_FROM "${MAIL_FROM:-}"
  emit BACKUP_S3_ENDPOINT "${BACKUP_S3_ENDPOINT:-}"
  emit BACKUP_S3_BUCKET "${BACKUP_S3_BUCKET:-}"
  emit BACKUP_S3_ACCESS_KEY_ID "${BACKUP_S3_ACCESS_KEY_ID:-}"
  emit BACKUP_S3_SECRET_ACCESS_KEY "${BACKUP_S3_SECRET_ACCESS_KEY:-}"
  emit BACKUP_RETENTION_DAYS "${BACKUP_RETENTION_DAYS:-30}"
  emit APPLE_TEAM_ID "${APPLE_TEAM_ID:-}"
  emit ANDROID_CERT_SHA256 "${ANDROID_CERT_SHA256:-}"
}

case "${1:-}" in
setup)
  ssh -o BatchMode=yes "root@$DEPLOY_HOST" bash -s -- "'$(ssh-keygen -y -f ~/.ssh/id_ed25519)'" \
    < deploy/setup-server.sh
  ;;
deploy)
  scp -o BatchMode=yes -q deploy/compose.yml deploy/Caddyfile deploy/*.sh "$target:/opt/rsc/"
  settings | remote 'umask 077 && cat > /opt/rsc/github.env'
  # The image is private: log in with this run's short-lived token, pull, log out.
  printf '%s' "${GHCR_TOKEN:?}" | remote "cd /opt/rsc && umask 077 && cat github.env local.env > .env \
    && docker login ghcr.io -u '${GHCR_USER:?}' --password-stdin > /dev/null \
    && { docker compose pull --quiet; pulled=\$?; docker logout ghcr.io > /dev/null; exit \$pulled; }"
  remote 'cd /opt/rsc && docker compose up -d --remove-orphans'
  for _ in $(seq 1 36); do
    if curl -fsS "https://$DEPLOY_HOST/api/health"; then
      echo
      exit 0
    fi
    sleep 5
  done
  echo "::error::The app did not become healthy. Recent app logs:"
  remote 'cd /opt/rsc && docker compose ps && docker compose logs --tail 80 app'
  exit 1
  ;;
backup) remote /opt/rsc/backup.sh ;;
restore-drill) remote /opt/rsc/restore.sh ;;
status)
  remote 'cd /opt/rsc && docker compose ps && free -h && df -h / \
    && docker compose logs --tail 50 app && tail -n 5 backup.log 2> /dev/null || true'
  ;;
*)
  echo "Usage: deploy/ci.sh setup|deploy|backup|restore-drill|status" >&2
  exit 2
  ;;
esac
