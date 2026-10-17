#!/usr/bin/env bash
# Runs on GitHub Actions (.github/workflows/ops.yml) and drives the server over SSH.
#   deploy/ci.sh setup          prepare a fresh server (deploy/setup-server.sh, as root)
#   deploy/ci.sh deploy         write settings, copy deploy/ files, pull and restart, check health
#   deploy/ci.sh backup         run backup.sh now
#   deploy/ci.sh restore-drill  restore the latest backup into rsc_restore_check
#   deploy/ci.sh status         containers, recent app logs and the backup log
#   deploy/ci.sh seed-demo      load fake demo data into an empty database (staging only);
#                               prints the demo logins and their new random password
#   deploy/ci.sh reset-demo     back up, then replace the demo data with a fresh set around
#                               today, keeping every non-demo login (staging only)
#   deploy/ci.sh prune          delete unused Docker images and build cache (frees disk; volumes untouched)
#   deploy/ci.sh disk-report    print what uses disk space (Docker, Postgres, logs, backups, system)
#   deploy/ci.sh disk-check     run the nightly disk check now (emails when above the threshold)
#   deploy/ci.sh export-feedback  print the open tester feedback as Markdown (docs/feedback)
# STACK=staging (default, /opt/rsc) or STACK=prod (/opt/rsc/prod) picks the stack on the server;
# prod needs APP_IMAGE (a pinned release tag) and refuses the demo-data tasks (ADR 0017).
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
stack="${STACK:-staging}"
case "$stack" in
staging) dir=/opt/rsc ;;
prod)
  dir=/opt/rsc/prod
  : "${APP_IMAGE:?Prod deploys a pinned image: pass the image tag (for example sha-1a2b3c4)}"
  ;;
*) echo "STACK must be staging or prod" >&2; exit 2 ;;
esac
# Prod has no Caddy of its own: the staging stack's Caddy serves both addresses (ADR 0017).
prod_domain="${PROD_DOMAIN:-prod.$DEPLOY_HOST}"
uri() { jq -rn --arg v "$1" '$v | @uri'; }

settings() {
  local value
  emit() { [ -n "$2" ] && printf "%s='%s'\n" "$1" "${2//\'/}"; return 0; }
  emit STACK "$stack"
  emit APP_IMAGE "${APP_IMAGE:-}"
  emit APPLE_TEAM_ID "${APPLE_TEAM_ID:-}"
  emit ANDROID_CERT_SHA256 "${ANDROID_CERT_SHA256:-}"
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
  emit DISK_ALERT_EMAIL "${DISK_ALERT_EMAIL:-}"
  if [ "$stack" = prod ]; then
    emit COMPOSE_PROJECT_NAME rscprod
    emit APP_DOMAIN "$prod_domain"
    emit APP_URL "https://$prod_domain"
    emit BACKUP_DIR db-prod # own prefix; the 30-day retention applies
    emit BACKUP_RETENTION_DAYS "${BACKUP_RETENTION_DAYS:-30}"
    emit STORAGE_S3_ENDPOINT "${PROD_STORAGE_S3_ENDPOINT:-}"
    emit STORAGE_S3_REGION "${PROD_STORAGE_S3_REGION:-}"
    emit STORAGE_S3_BUCKET "${PROD_STORAGE_S3_BUCKET:-}"
    emit STORAGE_S3_ACCESS_KEY_ID "${PROD_STORAGE_S3_ACCESS_KEY_ID:-}"
    emit STORAGE_S3_SECRET_ACCESS_KEY "${PROD_STORAGE_S3_SECRET_ACCESS_KEY:-}"
  else
    emit COMPOSE_PROFILES edge # this stack runs the Caddy for both stacks
    emit APP_DOMAIN "$DEPLOY_HOST"
    emit APP_URL "https://$DEPLOY_HOST"
    emit BACKUP_KEEP_LATEST 1 # demo data only: one nightly backup replaces the previous one
    emit STORAGE_S3_ENDPOINT "${STORAGE_S3_ENDPOINT:-}"
    emit STORAGE_S3_REGION "${STORAGE_S3_REGION:-}"
    emit STORAGE_S3_BUCKET "${STORAGE_S3_BUCKET:-}"
    emit STORAGE_S3_ACCESS_KEY_ID "${STORAGE_S3_ACCESS_KEY_ID:-}"
    emit STORAGE_S3_SECRET_ACCESS_KEY "${STORAGE_S3_SECRET_ACCESS_KEY:-}"
  fi
}

disk_cron='45 3 * * * /opt/rsc/disk.sh check >> /opt/rsc/disk.log 2>&1'
backup_cron="$([ "$stack" = prod ] && echo '20 3 * * * /opt/rsc/prod/backup.sh >> /opt/rsc/prod/backup.log 2>&1')"
guard_demo() { [ "$stack" != prod ] || { echo "::error::$1 is for the staging demo data only; prod holds real data." >&2; exit 1; }; }

case "${1:-}" in
setup)
  ssh -o BatchMode=yes "root@$DEPLOY_HOST" bash -s -- "'$(ssh-keygen -y -f ~/.ssh/id_ed25519)'" \
    < deploy/setup-server.sh
  ;;
deploy)
  if [ "$stack" = prod ] && [ -z "${PROD_STORAGE_S3_BUCKET:-}" ]; then
    echo "::warning::PROD_STORAGE_S3_BUCKET is not set: prod will refuse document uploads until it is."
  fi
  # Old images pile up on the small disk: drop the unused ones first (running ones stay).
  remote 'docker image prune -af > /dev/null; docker builder prune -f > /dev/null' || true
  # Both stacks meet Caddy on this network; the staging stack's compose file declares it external.
  remote 'docker network inspect rsc-edge > /dev/null 2>&1 || docker network create rsc-edge > /dev/null'
  remote "umask 077 && install -d -m 755 $dir && { [ -f $dir/local.env ] || { \
    [ '$stack' = staging ] && { echo 'local.env is missing: run the setup task' >&2; exit 1; }; \
    printf 'BETTER_AUTH_SECRET=%s\nPOSTGRES_USER=rsc\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=rsc\n' \
      \$(openssl rand -hex 32) \$(openssl rand -hex 24) > $dir/local.env; }; }"
  scp -o BatchMode=yes -q deploy/compose.yml deploy/Caddyfile deploy/*.sh "$target:$dir/"
  settings | remote "umask 077 && cat > $dir/github.env"
  # The image is private: log in with this run's short-lived token, pull, log out.
  printf '%s' "${GHCR_TOKEN:?}" | remote "cd $dir && umask 077 && cat github.env local.env > .env \
    && docker login ghcr.io -u '${GHCR_USER:?}' --password-stdin > /dev/null \
    && { docker compose pull --quiet; pulled=\$?; docker logout ghcr.io > /dev/null; exit \$pulled; }"
  remote "cd $dir && docker compose up -d --remove-orphans"
  if [ "$stack" = prod ]; then
    # Tell the staging stack's Caddy the prod address (local.env wins over github.env).
    remote "cd /opt/rsc && { grep -v '^PROD_DOMAIN=' local.env; echo \"PROD_DOMAIN='$prod_domain'\"; } > local.env.new \
      && mv local.env.new local.env && cat github.env local.env > .env && docker compose up -d caddy"
  fi
  # Each stack keeps its own cron entry: the nightly disk check (staging) or the prod backup.
  owned="/opt/rsc/disk.sh"; entry="$disk_cron"
  [ "$stack" = prod ] && { owned="/opt/rsc/prod/backup.sh"; entry="$backup_cron"; }
  remote "(crontab -l 2> /dev/null | grep -vF '$owned'; echo '$entry') | awk NF | crontab -"
  host="$DEPLOY_HOST"
  [ "$stack" = prod ] && host="$prod_domain"
  for _ in $(seq 1 36); do
    if curl -fsS "https://$host/api/health"; then
      echo
      exit 0
    fi
    sleep 5
  done
  echo "::error::The $stack app did not become healthy. Recent app logs:"
  remote "cd $dir && docker compose ps && docker compose logs --tail 80 app"
  exit 1
  ;;
prune)
  remote 'docker image prune -af; docker builder prune -f; df -h /'
  ;;
disk-report) remote /opt/rsc/disk.sh report ;;
disk-check) remote /opt/rsc/disk.sh check ;;
backup) remote "$dir/backup.sh" ;;
restore-drill) remote "$dir/restore.sh" ;;
status)
  remote "cd $dir && docker compose ps && free -h && df -h / \
    && docker compose logs --tail 50 app && tail -n 5 backup.log 2> /dev/null || true"
  ;;
seed-demo)
  guard_demo seed-demo
  # Fake people only. The seed refuses a database that already has club data, and existing
  # accounts are left alone. The password is new on every run and shown only in this log
  # (the repository is private).
  password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '%s' "$password" | remote 'cd /opt/rsc && SEED_PASSWORD="$(cat)" \
    docker compose exec -T -e SEED_PASSWORD app node dist/scripts/seed.js --allow-production'
  echo "Demo password for every login above: $password"
  ;;
reset-demo)
  guard_demo reset-demo
  # Backup first; the seed refuses unless the database holds its demo admin (never real data).
  remote /opt/rsc/backup.sh
  password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '%s' "$password" | remote 'cd /opt/rsc && SEED_PASSWORD="$(cat)" \
    docker compose exec -T -e SEED_PASSWORD app node dist/scripts/seed.js --allow-production --replace-demo'
  echo "Demo password for every login above: $password"
  ;;
export-feedback) remote "cd $dir && docker compose exec -T app node dist/scripts/export-feedback.js" ;;
*)
  echo "Usage: deploy/ci.sh setup|deploy|backup|restore-drill|status|seed-demo|reset-demo|export-feedback|prune" >&2
  exit 2
  ;;
esac
