#!/bin/bash
set -e

# Ensure nginx has the self-signed certs it needs for the HTTPS listener.
if [ ! -f "$(dirname "$0")/../certs/nginx.crt" ]; then
  "$(dirname "$0")/generate-self-signed-cert.sh"
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
