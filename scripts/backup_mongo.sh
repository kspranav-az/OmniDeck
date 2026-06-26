#!/bin/bash
set -euo pipefail

TENANT=${1:-}
if [ -z "$TENANT" ]; then
    echo "Usage: $0 <tenant_name>"
    exit 1
fi

DB_NAME="game_${TENANT}"
BACKUP_ROOT="${OMNIDECK_BACKUP_ROOT:-/backups}"
BACKUP_DIR="${BACKUP_ROOT}/mongo"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${BACKUP_DIR}/${TENANT}_${TIMESTAMP}"

echo "[mongo] backing up ${DB_NAME} to ${OUTPUT_DIR}"
mongodump \
    --host mongo \
    --port 27017 \
    --username "${MONGO_INITDB_ROOT_USERNAME}" \
    --password "${MONGO_INITDB_ROOT_PASSWORD}" \
    --authenticationDatabase admin \
    --db "${DB_NAME}" \
    --out "${OUTPUT_DIR}"

echo "[mongo] backup complete: ${OUTPUT_DIR}"
