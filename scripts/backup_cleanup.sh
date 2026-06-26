#!/bin/bash
set -euo pipefail

BACKUP_ROOT="${OMNIDECK_BACKUP_ROOT:-/backups}"

# Remove backups older than 7 days
find "${BACKUP_ROOT}/postgres" -type f -mtime +7 -delete 2>/dev/null || true
find "${BACKUP_ROOT}/mongo" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
find "${BACKUP_ROOT}/redis" -type f -mtime +7 -delete 2>/dev/null || true
find "${BACKUP_ROOT}/volumes" -type f -mtime +7 -delete 2>/dev/null || true

echo "[cleanup] removed backups older than 7 days"
