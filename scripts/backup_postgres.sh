#!/bin/bash
set -euo pipefail

TENANT=${1:-}
if [ -z "$TENANT" ]; then
    echo "Usage: $0 <tenant_name>"
    exit 1
fi

DB_NAME="game_${TENANT}"
BACKUP_ROOT="${OMNIDECK_BACKUP_ROOT:-/backups}"
BACKUP_DIR="${BACKUP_ROOT}/postgres"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${TENANT}_${TIMESTAMP}.dump"

echo "[postgres] backing up ${DB_NAME} to ${BACKUP_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h postgres \
    -p 5432 \
    -U "${POSTGRES_USER}" \
    -Fc \
    -f "${BACKUP_FILE}" \
    "${DB_NAME}"

echo "[postgres] backup complete: ${BACKUP_FILE}"
