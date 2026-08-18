#!/usr/bin/env bash
set -euo pipefail

# Restores a dump made by backup.sh, through the running container — same
# reasoning as backup.sh: the container carries the matching `pg_restore`.
#
# `--clean --if-exists` drops every object already in the target database
# before recreating it, so this is genuinely destructive and always says so:
# it prints exactly what it is about to overwrite and refuses to proceed
# without an explicit `--yes`, on the same reasoning `npm run seed`'s
# `--i-know-this-is-not-a-demo-database` guard uses for the opposite mistake.
#
# Usage:
#   ./scripts/restore.sh backups/finance-20260101T000000Z.dump --yes
#   COMPOSE_FILE=docker-compose.deploy.yml \
#   POSTGRES_USER=finance POSTGRES_DB=finance \
#     ./scripts/restore.sh path/to/dump.dump --yes

DUMP_FILE="${1:-}"
CONFIRM="${2:-}"

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage: $0 <dump-file> --yes" >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-finance}"
POSTGRES_DB="${POSTGRES_DB:-finance}"

if [ "$CONFIRM" != "--yes" ]; then
  echo "This drops and recreates every object in '$POSTGRES_DB'" >&2
  echo "(via $COMPOSE_FILE, service '$POSTGRES_SERVICE') from $DUMP_FILE." >&2
  echo "Re-run with --yes to proceed." >&2
  exit 1
fi

echo "Restoring $DUMP_FILE into '$POSTGRES_DB' (via $COMPOSE_FILE, service '$POSTGRES_SERVICE') ..."

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < "$DUMP_FILE"

echo "Restore complete."
