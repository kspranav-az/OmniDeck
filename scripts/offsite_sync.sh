#!/bin/bash
set -euo pipefail

BUCKET="${GCS_BACKUP_BUCKET:-omnideck-backups-bucket}"

if ! command -v gsutil &> /dev/null; then
    echo "[offsite] gsutil not found, skipping GCS sync"
    exit 0
fi

gsutil -m rsync -r /backups/postgres "gs://${BUCKET}/postgres/"
gsutil -m rsync -r /backups/mongo "gs://${BUCKET}/mongo/"
gsutil -m rsync -r /backups/redis "gs://${BUCKET}/redis/"

echo "[offsite] sync complete to gs://${BUCKET}/"
