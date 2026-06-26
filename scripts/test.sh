#!/bin/bash
set -e

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
