#!/bin/bash
set -e

# Ensure nginx has the self-signed certs it needs for the HTTPS listener.
if [ ! -f "$(dirname "$0")/../certs/nginx.crt" ]; then
  "$(dirname "$0")/generate-self-signed-cert.sh"
fi

# MinIO expects public.crt/private.key for its TLS listener.
mkdir -p "$(dirname "$0")/../minio-certs"
if [ ! -f "$(dirname "$0")/../minio-certs/public.crt" ]; then
  cp "$(dirname "$0")/../certs/nginx.crt" "$(dirname "$0")/../minio-certs/public.crt"
  cp "$(dirname "$0")/../certs/nginx.key" "$(dirname "$0")/../minio-certs/private.key"
fi

docker run --rm \
  --network omnideck_backend \
  --env-file "$(pwd)/.env" \
  -e COMPOSE_PROJECT_NAME=omnideck \
  -e OMNIDECK_BACKUP_ROOT=/workspace/backups \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v "$(pwd):/workspace" \
  -v omnideck_backups:/workspace/backups \
  -w /workspace \
  omnideck-test-runner:latest \
  "$@"
