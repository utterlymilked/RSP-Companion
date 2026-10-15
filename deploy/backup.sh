#!/usr/bin/env bash
# Nightly database backup (cron, see docs/OPERATIONS.md): pg_dump in custom format, checked
# with pg_restore --list, uploaded to S3-compatible storage; dumps older than
# BACKUP_RETENTION_DAYS are deleted. Exits non-zero on any failure.
. "$(dirname "$0")/lib.sh"

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
dump="$dir/rsp-$stamp.dump"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$dump"
docker compose exec -T db pg_restore --list < "$dump" > /dev/null # the dump is readable
RCLONE_DOCKER_ARGS="${RCLONE_DOCKER_ARGS:-} -v $dir:/dumps:ro" rclone copyto "/dumps/rsp-$stamp.dump" "$BACKUP_PREFIX/rsp-$stamp.dump"
rclone delete --min-age "${BACKUP_RETENTION_DAYS:-30}d" "$BACKUP_PREFIX/"
echo "Backup uploaded: rsp-$stamp.dump ($(du -h "$dump" | cut -f1))"
