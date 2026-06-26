#!/bin/bash
set -euo pipefail

TENANT=${1:-}
BACKUP_FILE=${2:-}
if [ -z "$TENANT" ] || [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <tenant_name> <backup_file>"
    exit 1
fi

DB_NAME="game_${TENANT}"
BROKEN_NAME="${DB_NAME}_broken_$(date +%Y%m%d_%H%M%S)"

echo "[postgres] renaming current database ${DB_NAME} to ${BROKEN_NAME}"
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -c "ALTER DATABASE \"${DB_NAME}\" RENAME TO \"${BROKEN_NAME}\";"

echo "[postgres] creating empty database ${DB_NAME}"
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${TENANT}\";"

echo "[postgres] restoring from ${BACKUP_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -d "${DB_NAME}" \
    "${BACKUP_FILE}"

echo "[postgres] restore complete"
