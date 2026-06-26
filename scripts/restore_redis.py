#!/usr/bin/env python3
"""Restore Redis keys for a tenant from a prefix-based dump file."""
import os
import sys

import redis

sys.path.insert(0, "/opt/omnideck/scripts")
from common import get_env, redis_key_prefix, validate_tenant_name  # noqa: E402


def restore_redis(tenant: str, backup_file: str):
    prefix = redis_key_prefix(tenant)

    r = redis.Redis(
        host="redis",
        port=6379,
        password=get_env("REDIS_PASSWORD"),
        decode_responses=False,
    )

    # Delete current tenant keys
    for key in r.scan_iter(match=f"{prefix}*"):
        r.delete(key)

    # Restore from file
    with open(backup_file, "rb") as f:
        data = f.read()

    for record in data.split(b"\n---KEY---\n"):
        record = record.strip()
        if not record:
            continue
        parts = record.split(b"|", 2)
        if len(parts) != 3:
            continue
        key, ttl_bytes, val = parts
        ttl = int(ttl_bytes)
        if ttl < 0:
            ttl = 0
        r.restore(key, ttl, val, replace=True)

    print(f"[redis] restore complete from {backup_file}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: restore_redis.py <tenant_name> <backup_file>", file=sys.stderr)
        sys.exit(1)
    tenant = validate_tenant_name(sys.argv[1])
    backup_file = sys.argv[2]
    if not os.path.exists(backup_file):
        print(f"ERROR: backup file not found: {backup_file}", file=sys.stderr)
        sys.exit(1)
    restore_redis(tenant, backup_file)
