#!/bin/bash
set -euo pipefail

VOLUME_NAME=${1:-}
BACKUP_FILE=${2:-}
SERVICE_NAME=${3:-}
if [ -z "$VOLUME_NAME" ] || [ -z "$BACKUP_FILE" ] || [ -z "$SERVICE_NAME" ]; then
    echo "Usage: $0 <volume_name> <backup_file> <service_name>"
    exit 1
fi

BACKUP_VOLUME="${OMNIDECK_BACKUP_VOLUME:-omnideck_backups}"
BACKUP_ROOT="${OMNIDECK_BACKUP_ROOT:-/backups}"
# Convert host/container path to in-volume path (e.g. /workspace/backups/volumes/x -> /backups/volumes/x)
REL_PATH="${BACKUP_FILE#${BACKUP_ROOT}/}"
HELPER_FILE="/backups/${REL_PATH}"

echo "[restore] stopping and removing service ${SERVICE_NAME}"
docker compose stop "${SERVICE_NAME}"
docker compose rm -f "${SERVICE_NAME}"

echo "[restore] removing volume ${VOLUME_NAME}"
docker volume rm "${VOLUME_NAME}" || true

echo "[restore] creating empty volume ${VOLUME_NAME}"
docker volume create "${VOLUME_NAME}"

echo "[restore] restoring from ${BACKUP_FILE}"
docker run --rm \
    -v "${VOLUME_NAME}:/target" \
    -v "${BACKUP_VOLUME}:/backups" \
    alpine sh -c "cd /target && tar xzf ${HELPER_FILE}"

echo "[restore] recreating service ${SERVICE_NAME}"
docker compose up -d "${SERVICE_NAME}"

echo "[restore] complete"
