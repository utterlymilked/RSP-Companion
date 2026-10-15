#!/usr/bin/env bash
# Restores a backup (docs/OPERATIONS.md).
#   ./restore.sh                     drill: latest dump into the rsc_restore_check database
#   ./restore.sh rsc-<stamp>.dump    drill with a given dump
#   ./restore.sh --production [dump] replaces the live database (stops the app meanwhile)
. "$(dirname "$0")/lib.sh"

target=rsc_restore_check
if [ "${1:-}" = "--production" ]; then
  target=$POSTGRES_DB
  shift
fi
name=${1:-$(rclone lsf "$BACKUP_PREFIX/" | grep '\.dump$' | sort | tail -n 1)}
[ -n "$name" ] || { echo "No backups found in $BACKUP_PREFIX" >&2; exit 1; }

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
echo "Downloading $name"
rclone cat "$BACKUP_PREFIX/$name" > "$dir/restore.dump"

if [ "$target" = "$POSTGRES_DB" ]; then
  read -r -p "Replace the live database $target with $name? Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
  docker compose stop app
  docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$target" --clean --if-exists \
    --no-owner --exit-on-error < "$dir/restore.dump"
  docker compose start app
else
  psql_db -d postgres -c "DROP DATABASE IF EXISTS $target" -c "CREATE DATABASE $target"
  docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$target" --no-owner \
    --exit-on-error < "$dir/restore.dump"
fi

echo "Restored $name into $target. Row counts:"
psql_db -d "$target" -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM persons) AS persons"
