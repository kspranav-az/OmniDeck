#!/bin/bash
set -e

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v "$(pwd):/workspace" \
  -w /workspace \
  omnideck-test-runner:latest \
  "$@"
