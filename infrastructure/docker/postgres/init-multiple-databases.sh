#!/usr/bin/env bash
# Runs automatically on first container start (mounted into
# /docker-entrypoint-initdb.d by docker-compose.yml). Creates one Postgres
# database per Nexora service inside this single dev instance, so each
# service can own its data (build spec section 23) while local dev only
# needs one Postgres container. Idempotent - safe if the volume already
# has these databases from a previous run.
set -euo pipefail

function create_database_if_missing() {
  local database="$1"
  echo "nexora-postgres-init: ensuring database '$database' exists"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE "$database" OWNER "$POSTGRES_USER"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  echo "nexora-postgres-init: databases requested: $POSTGRES_MULTIPLE_DATABASES"
  IFS=',' read -ra REQUESTED_DBS <<< "$POSTGRES_MULTIPLE_DATABASES"
  for raw_name in "${REQUESTED_DBS[@]}"; do
    db_name="$(echo "$raw_name" | xargs)" # trim whitespace
    if [ -n "$db_name" ]; then
      create_database_if_missing "$db_name"
    fi
  done
  echo "nexora-postgres-init: done"
else
  echo "nexora-postgres-init: POSTGRES_MULTIPLE_DATABASES not set, skipping"
fi
