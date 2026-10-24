#!/usr/bin/env bash
# Runs on GitHub Actions (.github/workflows/ops.yml) and drives the server over SSH.
#   deploy/ci.sh setup          prepare a fresh server (deploy/setup-server.sh, as root)
#   deploy/ci.sh deploy         write settings, copy deploy/ files, pull and restart, check health
#   deploy/ci.sh backup         run backup.sh now
#   deploy/ci.sh restore-drill  restore the latest backup into rsc_restore_check
#   deploy/ci.sh status         containers, recent app logs and the backup log
#   deploy/ci.sh seed-demo      load fake demo data into an empty database (staging only);
#                               loads the demo logins with a random, unprinted password
#   deploy/ci.sh reset-demo     back up, then replace the demo data with a fresh set around
#                               today, keeping every non-demo login (staging only)
#   deploy/ci.sh prune          delete unused Docker images and build cache (frees disk; volumes untouched)
#   deploy/ci.sh disk-report    print what uses disk space (Docker, Postgres, logs, backups, system)
#   deploy/ci.sh disk-check     run the nightly disk check now (emails when above the threshold)
#   deploy/ci.sh create-admin   create the first admin (ADMIN_EMAIL, ADMIN_NAME) with a random password
#                               nobody sees, then email that address a link to choose its own
#   deploy/ci.sh grant-developer  give ADMIN_EMAIL's login the developer role (ADR 0019)
#   deploy/ci.sh demo-code      email the staging tester access code to ADMIN_EMAIL (staging only)
#   deploy/ci.sh registration-key | rotate-registration-key  staging: email (or renew) the self-registration key (ADR 0026)
#   deploy/ci.sh rotate-demo-code  new access code, restart the app, email it (old code stops working)
#   deploy/ci.sh check-storage  upload, read back and delete a dummy file in the document bucket (no secrets printed)
#   deploy/ci.sh export-feedback  print the open tester feedback as Markdown (docs/feedback)
# STACK=staging (default, /opt/rsc) or STACK=prod (/opt/rsc/prod) picks the stack on the server;
# prod needs APP_IMAGE (a pinned release tag) and refuses the demo-data tasks (ADR 0017).
# Settings come from the repository's Actions variables and secrets (docs/OPERATIONS.md).
set -Eeuo pipefail
# A failing command must say so: GitHub only shows "exit code 1" otherwise.
trap 'echo "::error::deploy/ci.sh ${1:-} failed (exit $?) at line $LINENO: $BASH_COMMAND" >&2' ERR
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
  # The app refuses an endpoint without a scheme (and crash-loops), so accept the console's bare host.
  url() { case "$1" in "" | http://* | https://*) printf '%s' "$1" ;; *) printf 'https://%s' "$1" ;; esac; }
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
    emit OTA_VARIANT production # the production app's bundle only, never the tester one (ADR 0020)
    emit APP_DOMAIN "$prod_domain"
    emit APP_URL "https://$prod_domain"
    emit BACKUP_DIR db-prod # own prefix; the 30-day retention applies
    emit BACKUP_RETENTION_DAYS "${BACKUP_RETENTION_DAYS:-30}"
    emit SELF_REGISTRATION "${PROD_SELF_REGISTRATION:-off}" # closed until Pedro opens it (ADR 0026)
    emit STORAGE_S3_ENDPOINT "$(url "${PROD_STORAGE_S3_ENDPOINT:-}")"
    emit STORAGE_S3_REGION "${PROD_STORAGE_S3_REGION:-}"
    emit STORAGE_S3_BUCKET "${PROD_STORAGE_S3_BUCKET:-}"
    emit STORAGE_S3_ACCESS_KEY_ID "${PROD_STORAGE_S3_ACCESS_KEY_ID:-}"
    emit STORAGE_S3_SECRET_ACCESS_KEY "${PROD_STORAGE_S3_SECRET_ACCESS_KEY:-}"
  else
    emit COMPOSE_PROFILES edge # this stack runs the Caddy for both stacks
    emit PROD_DOMAIN "$prod_domain" # never empty: an empty Caddy site address stops it starting
    emit APP_DOMAIN "$DEPLOY_HOST"
    emit APP_URL "https://$DEPLOY_HOST"
    emit DEMO_MODE true # sandbox: demo-account picker on the sign-in screen (ADR 0018)
    emit SELF_REGISTRATION on # needs the rotating REGISTRATION_KEY below (ADR 0026)
    emit BACKUP_KEEP_LATEST 1 # demo data only: one nightly backup replaces the previous one
    emit STORAGE_S3_ENDPOINT "$(url "${STORAGE_S3_ENDPOINT:-}")"
    emit STORAGE_S3_REGION "${STORAGE_S3_REGION:-}"
    emit STORAGE_S3_BUCKET "${STORAGE_S3_BUCKET:-}"
    emit STORAGE_S3_ACCESS_KEY_ID "${STORAGE_S3_ACCESS_KEY_ID:-}"
    emit STORAGE_S3_SECRET_ACCESS_KEY "${STORAGE_S3_SECRET_ACCESS_KEY:-}"
  fi
}

disk_cron='45 3 * * * /opt/rsc/disk.sh check >> /opt/rsc/disk.log 2>&1'
backup_cron='20 3 * * * /opt/rsc/prod/backup.sh >> /opt/rsc/prod/backup.log 2>&1'
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
  # Master key for identity evidence (ADR 0026 section 10): server-only, created once, never printed.
  remote "grep -q '^IDENTITY_DOCS_KEYS=' $dir/local.env || printf 'IDENTITY_DOCS_KEYS=1:%s\n' \$(openssl rand -base64 32) >> $dir/local.env"
  if [ "$stack" = staging ]; then
    # The tester access code lives only in local.env (ADR 0018); created once, rotated by rotate-demo-code.
    remote "grep -q '^DEMO_ACCESS_CODE=' $dir/local.env || printf 'DEMO_ACCESS_CODE=%s\n' \$(openssl rand -hex 12) >> $dir/local.env"
  fi
  if [ "$stack" = staging ]; then
    remote "grep -q '^REGISTRATION_KEY=' $dir/local.env || printf 'REGISTRATION_KEY=%s\n' \$(openssl rand -hex 12) >> $dir/local.env"
  fi
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
  remote "cd $dir && docker compose ps && docker compose logs --tail 80 app caddy"
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
  # accounts are left alone. The password is random, never printed (this repository's logs are
  # public) and not needed: the sandbox signs the demo accounts in by itself (ADR 0018).
  password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '%s' "$password" | remote 'cd /opt/rsc && SEED_PASSWORD="$(cat)" \
    docker compose exec -T -e SEED_PASSWORD app node dist/scripts/seed.js --allow-production'
  ;;
reset-demo)
  guard_demo reset-demo
  # Backup first; the seed refuses unless the database holds its demo admin (never real data).
  remote /opt/rsc/backup.sh
  password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '%s' "$password" | remote 'cd /opt/rsc && SEED_PASSWORD="$(cat)" \
    docker compose exec -T -e SEED_PASSWORD app node dist/scripts/seed.js --allow-production --replace-demo'
  ;;
create-admin)
  # The password is random and discarded: the repository and its logs are public, so nothing
  # secret may be printed. The owner sets a real password from the emailed reset link.
  : "${ADMIN_EMAIL:?Pass admin_email}" "${ADMIN_NAME:?Pass admin_name}"
  [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || { echo "::error::Invalid admin_email" >&2; exit 1; }
  [[ "$ADMIN_NAME" =~ ^[[:alpha:]\ .-]+$ ]] || { echo "::error::admin_name: letters, spaces, dot and hyphen only" >&2; exit 1; }
  openssl rand -base64 24 | tr -d '/+=' | cut -c1-24 \
    | remote "cd $dir && docker compose exec -T app node dist/scripts/create-admin.js --email '$ADMIN_EMAIL' --name '$ADMIN_NAME'"
  js='const base = process.env.APP_URL.replace(/\/$/, "");
fetch("http://localhost:3000/api/auth/request-password-reset", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: process.env.E, redirectTo: base + "/reset-password" }),
}).then((r) => { console.log("reset email request:", r.status); process.exit(r.ok ? 0 : 1); });'
  printf '%s' "$js" | remote "cd $dir && docker compose exec -T -e E='$ADMIN_EMAIL' app node -"
  echo "Reset link emailed to $ADMIN_EMAIL (check spam); it lets the owner choose the password."
  ;;
grant-developer)
  # Gives an existing login the developer role (ADR 0019); the app cannot grant it. Prod allowed.
  : "${ADMIN_EMAIL:?Pass admin_email: the login to promote}"
  [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || { echo "::error::Invalid admin_email" >&2; exit 1; }
  out="$(remote "cd $dir && docker compose exec -T app node dist/scripts/grant-developer.js --create --email '$ADMIN_EMAIL'")"
  echo "$out"
  if grep -q 'login created' <<< "$out"; then
    # New login: email the link to choose a password (same flow as create-admin).
    js='const base = process.env.APP_URL.replace(/\/$/, "");
fetch("http://localhost:3000/api/auth/request-password-reset", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: process.env.E, redirectTo: base + "/reset-password" }),
}).then((r) => { console.log("reset email request:", r.status); process.exit(r.ok ? 0 : 1); });'
    printf '%s' "$js" | remote "cd $dir && docker compose exec -T -e E='$ADMIN_EMAIL' app node -"
    echo "Reset link emailed to $ADMIN_EMAIL (check spam)."
  fi
  ;;
demo-code | rotate-demo-code)
  guard_demo "$1"
  : "${ADMIN_EMAIL:?Pass admin_email: the address that receives the code}"
  [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || { echo "::error::Invalid admin_email" >&2; exit 1; }
  if [ "$1" = rotate-demo-code ]; then
    # New code, then recreate the app so it reads it. Nothing secret is printed (public logs).
    remote "cd $dir && { grep -v '^DEMO_ACCESS_CODE=' local.env; printf 'DEMO_ACCESS_CODE=%s\n' \$(openssl rand -hex 12); } > local.env.new \
      && chmod 600 local.env.new && mv local.env.new local.env && cat github.env local.env > .env && docker compose up -d app"
    sleep 15
  fi
  remote "cd $dir && docker compose exec -T app node dist/scripts/send-demo-code.js --to '$ADMIN_EMAIL'"
  ;;
registration-key | rotate-registration-key)
  guard_demo "$1"
  # Without admin_email the key goes to DISK_ALERT_EMAIL, read on the server so the address never
  # appears in this public log.
  [ -z "${ADMIN_EMAIL:-}" ] || [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || { echo "::error::Invalid admin_email" >&2; exit 1; }
  # The staging registration key (ADR 0026) lives only in local.env, like the demo access code.
  remote "cd $dir && { [ '$1' = registration-key ] && grep -q '^REGISTRATION_KEY=' local.env; } \
    || { { grep -v '^REGISTRATION_KEY=' local.env; printf 'REGISTRATION_KEY=%s\n' \$(openssl rand -hex 12); } > local.env.new \
      && chmod 600 local.env.new && mv local.env.new local.env && cat github.env local.env > .env && docker compose up -d app \
      && sleep 15; }"
  remote "cd $dir && to='$ADMIN_EMAIL'; [ -n \"\$to\" ] || to=\$(sed -n \"s/^DISK_ALERT_EMAIL='\\(.*\\)'\\$/\\1/p\" github.env); \
    [ -n \"\$to\" ] || { echo 'No admin_email given and DISK_ALERT_EMAIL is not set' >&2; exit 1; }; \
    docker compose exec -T app node dist/scripts/send-registration-key.js --to \"\$to\" | sed 's/to .*/to the configured address./'"
  ;;
check-storage) remote "cd $dir && docker compose exec -T app node dist/scripts/check-storage.js" ;;
export-feedback) remote "cd $dir && docker compose exec -T app node dist/scripts/export-feedback.js" ;;
*)
  echo "Usage: deploy/ci.sh setup|deploy|backup|restore-drill|status|seed-demo|reset-demo|create-admin|grant-developer|demo-code|rotate-demo-code|registration-key|rotate-registration-key|export-feedback|check-storage|prune" >&2
  exit 2
  ;;
esac
