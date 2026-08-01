#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required}"
: "${MIGRATION_DB_USER:?MIGRATION_DB_USER is required}"
: "${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD is required}"

MIGRATION_DB_HOST="${MIGRATION_DB_HOST:-127.0.0.1}"
MIGRATION_DB_PORT="${MIGRATION_DB_PORT:-5432}"
FRESH_DB="${FRESH_MIGRATION_DB:-baogiang_migration_fresh}"
LEGACY_DB="${LEGACY_MIGRATION_DB:-baogiang_migration_legacy}"
BASELINE_MIGRATION="20260728000000_phase_00_baseline"
SCHEMA_PATH="prisma/schema.prisma"

for identifier in "$MIGRATION_DB_USER" "$FRESH_DB" "$LEGACY_DB"; do
  if [[ ! "$identifier" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Unsafe PostgreSQL identifier supplied." >&2
    exit 1
  fi
done

database_url() {
  local database_name="$1"
  printf 'postgresql://%s:%s@%s:%s/%s?schema=public' \
    "$MIGRATION_DB_USER" "$MIGRATION_DB_PASSWORD" "$MIGRATION_DB_HOST" "$MIGRATION_DB_PORT" "$database_name"
}

recreate_database() {
  local database_name="$1"
  psql "$POSTGRES_ADMIN_URL" -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$database_name\" WITH (FORCE);"
  psql "$POSTGRES_ADMIN_URL" -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$database_name\" OWNER \"$MIGRATION_DB_USER\";"
}

fresh_url="$(database_url "$FRESH_DB")"
legacy_url="$(database_url "$LEGACY_DB")"

recreate_database "$FRESH_DB"
recreate_database "$LEGACY_DB"

echo "[migration-test] Fresh database deploy"
DATABASE_URL="$fresh_url" npx prisma migrate deploy --schema "$SCHEMA_PATH"
DATABASE_URL="$fresh_url" npx prisma migrate status --schema "$SCHEMA_PATH"

echo "[migration-test] Legacy Phase 00 baseline simulation"
psql "$legacy_url" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
SQL
DATABASE_URL="$legacy_url" npx prisma migrate resolve \
  --schema "$SCHEMA_PATH" --applied "$BASELINE_MIGRATION"
DATABASE_URL="$legacy_url" npx prisma migrate deploy --schema "$SCHEMA_PATH"
DATABASE_URL="$legacy_url" npx prisma migrate status --schema "$SCHEMA_PATH"

echo "[migration-test] Idempotent capability seed"
DATABASE_URL="$fresh_url" node prisma/seed.cjs
DATABASE_URL="$fresh_url" node prisma/seed.cjs

echo "[migration-test] Constraint and history verification"
psql "$fresh_url" -v ON_ERROR_STOP=1 -f scripts/ci/verify-phase-01-schema.sql

echo "[migration-test] PASS"
