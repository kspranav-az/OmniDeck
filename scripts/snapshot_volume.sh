#!/bin/bash
set -euo pipefail

VOLUME_NAME=${1:-}
if [ -z "$VOLUME_NAME" ]; then
    echo "Usage: $0 <volume_name>"
    exit 1
fi

BACKUP_ROOT="${OMNIDECK_BACKUP_ROOT:-/backups}"
BACKUP_DIR="${BACKUP_ROOT}/volumes"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${VOLUME_NAME}_${TIMESTAMP}.tar.gz"
BACKUP_VOLUME="${OMNIDECK_BACKUP_VOLUME:-omnideck_backups}"

echo "[snapshot] creating snapshot of ${VOLUME_NAME} -> ${BACKUP_FILE}"
docker run --rm \
    -v "${VOLUME_NAME}:/source:ro" \
    -v "${BACKUP_VOLUME}:/backups" \
    alpine tar czf "/backups/volumes/$(basename "$BACKUP_FILE")" -C /source .

echo "[snapshot] complete: ${BACKUP_FILE}"
