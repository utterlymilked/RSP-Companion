#!/usr/bin/env bash
# Disk watch for the server (docs/OPERATIONS.md, "Disk space").
#   disk.sh report   print what uses space (read-only; Ops task disk-report)
#   disk.sh check    nightly (cron): clean stale temp files, and email DISK_ALERT_EMAIL (default
#                    MAIL_FROM) when the root disk is above DISK_ALERT_PERCENT (default 80)
# Never deletes databases, volumes or certificates.
. "$(dirname "$0")/lib.sh"

used_percent() { df --output=pcent / | tail -n 1 | tr -dc '0-9'; }
size_of() { du -sh "$@" 2> /dev/null | cut -f1 || true; }

report() {
  echo "== Disk =="
  df -h /
  echo
  echo "== Docker (images, containers, volumes, build cache) =="
  docker system df
  echo
  docker system df -v 2> /dev/null | sed -n '/^Local Volumes/,/^$/p'
  echo "== Docker container logs and volumes on disk (read via a throwaway container) =="
  docker run --rm --entrypoint sh -v /var/lib/docker:/d:ro "$RCLONE_IMAGE" -c \
    'du -sh /d/containers /d/volumes /d/overlay2 /d/image 2>/dev/null; echo; echo "largest container logs:"; \
     du -h /d/containers/*/*-json.log 2>/dev/null | sort -rh | head -n 5' || echo "(not readable)"
  echo
  echo "== Postgres =="
  psql_db -d "$POSTGRES_DB" -Atc "select 'database total: ' || pg_size_pretty(pg_database_size(current_database()))"
  psql_db -d "$POSTGRES_DB" -c "select relname as table, pg_size_pretty(pg_total_relation_size(oid)) as size
    from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace
    order by pg_total_relation_size(oid) desc limit 10"
  if [ -d /opt/rsc/prod ] && [ "$(pwd)" != /opt/rsc/prod ]; then
    echo "prod (/opt/rsc/prod):"
    (cd /opt/rsc/prod && . ./.env && docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
      "select 'database total: ' || pg_size_pretty(pg_database_size(current_database()))") || echo "(not readable)"
  fi
  echo "== Uploads / documents =="
  if [ -n "${STORAGE_S3_BUCKET:-}" ]; then
    echo "Documents are in the object storage bucket ${STORAGE_S3_BUCKET}, not on this disk."
  else
    echo "No STORAGE_S3_BUCKET set: any local uploads live inside the app container or volumes above."
  fi
  echo
  echo "== Local backup files =="
  echo "/opt/rsc: $(size_of /opt/rsc) (backup.log $(size_of /opt/rsc/backup.log))"
  echo "Stale dump directories in /tmp: $(find /tmp -maxdepth 2 -name 'rsc-*.dump' 2> /dev/null | wc -l)"
  echo
  echo "== System =="
  journalctl --disk-usage 2> /dev/null || echo "journal: not readable"
  echo "apt cache: $(size_of /var/cache/apt) | /var/log: $(size_of /var/log) | /tmp: $(size_of /tmp) | swap file: $(size_of /swapfile)"
  echo "home: $(size_of "$HOME")"
}

# Dumps are written to a mktemp dir that backup.sh removes on exit; this catches the ones a
# killed run (reboot, out of memory) left behind.
clean_stale() {
  find /tmp -maxdepth 2 -name 'rsc-*.dump' -user "$(id -un)" -mmin +120 -print -delete 2> /dev/null || true
  find /tmp -mindepth 1 -maxdepth 1 -type d -name 'tmp.*' -user "$(id -un)" -empty -mmin +120 -delete 2> /dev/null || true
}

alert() {
  local pct=$1 to=${DISK_ALERT_EMAIL:-${MAIL_FROM:-}} mail
  if [ -z "$to" ] || [ -z "${SMTP_URL:-}" ]; then
    echo "Disk at ${pct}% but SMTP_URL or MAIL_FROM is not set: cannot email." >&2
    return 1
  fi
  mail=$(mktemp)
  {
    printf 'From: SFF RSC <%s>\nTo: %s\nSubject: [RSC] Server disk at %s%%\n' "$MAIL_FROM" "$to" "$pct"
    printf 'Content-Type: text/plain; charset=utf-8\n\n'
    printf 'The server disk (staging and prod share it) is %s%% full (alert threshold %s%%).\n\n' "$pct" "$threshold"
    df -h /
    printf '\nRun the Ops task "prune" to remove unused Docker images, and "disk-report" to see what uses the space.\n'
  } > "$mail"
  curl -fsS --ssl-reqd --url "$SMTP_URL" --mail-from "$MAIL_FROM" --mail-rcpt "$to" -T "$mail"
  rm -f "$mail"
  echo "Alert emailed to $to."
}

threshold=${DISK_ALERT_PERCENT:-80}
case "${1:-}" in
report) report ;;
check)
  clean_stale
  pct=$(used_percent)
  echo "$(date -u +%FT%TZ) disk ${pct}% used (alert at ${threshold}%)"
  if [ "$pct" -ge "$threshold" ]; then alert "$pct"; fi
  ;;
*)
  echo "Usage: disk.sh report|check" >&2
  exit 2
  ;;
esac
