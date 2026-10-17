# Shared by backup.sh and restore.sh. Loads .env and runs rclone in a container, configured
# from the BACKUP_S3_* settings as a remote called "backup".
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${BACKUP_S3_BUCKET:?Backups are not configured: set the BACKUP_S3_* variables and secrets (docs/OPERATIONS.md)}"

RCLONE_IMAGE=${RCLONE_IMAGE:-rclone/rclone:1}

rclone() {
  docker run --rm -e RCLONE_CONFIG=/dev/null \
    -e RCLONE_CONFIG_BACKUP_TYPE=s3 \
    -e RCLONE_CONFIG_BACKUP_PROVIDER=Other \
    -e RCLONE_CONFIG_BACKUP_ENDPOINT="$BACKUP_S3_ENDPOINT" \
    -e RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true \
    ${RCLONE_DOCKER_ARGS:-} "$RCLONE_IMAGE" "$@"
}

psql_db() {
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"
}

BACKUP_PREFIX="backup:$BACKUP_S3_BUCKET/${BACKUP_DIR:-db}"
