#!/usr/bin/env bash
set -euo pipefail

# A logical backup of the Postgres database, taken through the running
# container rather than a host-installed `pg_dump` — the container already
# carries the matching client tools for whichever Postgres version is
# actually running, so nothing has to be installed on the machine running
# this script, in CI, or on a deploy host.
#
# This is a `pg_dump`, not continuous WAL archiving or PITR (see finding
# P-3 in AUDIT_REPORT.md, and "A tested restore, not a promise of one" in
# docs/decisions.md for the reasoning and what closes the gap for real). What
# it buys: an actual, restorable point-in-time copy on a schedule, which is
# strictly more than the nothing that existed before it — and paired with
# restore.sh, one that has genuinely been proven to come back.
#
# Usage:
#   ./scripts/backup.sh                                  # dev stack, defaults
#   COMPOSE_FILE=docker-compose.deploy.yml \
#   POSTGRES_USER=finance POSTGRES_DB=finance \
#     ./scripts/backup.sh                                # deployed stack
#   BACKUP_DIR=/mnt/backups BACKUP_RETENTION_DAYS=30 ./scripts/backup.sh
#   BACKUP_S3_BUCKET=s3://my-bucket/finance ./scripts/backup.sh   # needs the aws CLI

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-finance}"
POSTGRES_DB="${POSTGRES_DB:-finance}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/finance-$TIMESTAMP.dump"

echo "Backing up '$POSTGRES_DB' (via $COMPOSE_FILE, service '$POSTGRES_SERVICE') to $DUMP_FILE ..."

# Custom format (-Fc): compressed, and the only format pg_restore can apply
# selectively or in parallel. Piped out over `exec -T` rather than written
# inside the container, so the dump lands wherever this script runs — the CI
# runner, an ops laptop, or a scheduled job's own filesystem — not on a
# container that gets recreated on the next deploy.
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump --format=custom --compress=9 -U "$POSTGRES_USER" "$POSTGRES_DB" > "$DUMP_FILE"

SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "Backup complete: $DUMP_FILE ($SIZE)"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "Copying to $BACKUP_S3_BUCKET ..."
    aws s3 cp "$DUMP_FILE" "$BACKUP_S3_BUCKET/$(basename "$DUMP_FILE")"
  else
    echo "BACKUP_S3_BUCKET is set but the aws CLI is not installed here — the local copy" >&2
    echo "above is the only one that exists. Install the aws CLI or copy it off-host by hand." >&2
  fi
fi

echo "Pruning local dumps older than $RETENTION_DAYS days in $BACKUP_DIR ..."
find "$BACKUP_DIR" -name 'finance-*.dump' -mtime "+$RETENTION_DAYS" -print -delete
