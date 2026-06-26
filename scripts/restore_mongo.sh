#!/bin/bash
set -euo pipefail

TENANT=${1:-}
BACKUP_DIR=${2:-}
if [ -z "$TENANT" ] || [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <tenant_name> <backup_dir>"
    exit 1
fi

DB_NAME="game_${TENANT}"

echo "[mongo] restoring from ${BACKUP_DIR}"
mongorestore \
    --host mongo \
    --port 27017 \
    --username "${MONGO_INITDB_ROOT_USERNAME}" \
    --password "${MONGO_INITDB_ROOT_PASSWORD}" \
    --authenticationDatabase admin \
    --db "${DB_NAME}" \
    --drop \
    "${BACKUP_DIR}/${DB_NAME}"

echo "[mongo] restore complete"
