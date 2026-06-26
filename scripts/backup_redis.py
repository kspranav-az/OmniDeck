#!/usr/bin/env python3
"""Backup Redis keys for a tenant using prefix-based dump."""
import os
import sys
from datetime import datetime

import redis

sys.path.insert(0, "/opt/omnideck/scripts")
from common import get_env, redis_key_prefix, validate_tenant_name  # noqa: E402


def backup_redis(tenant: str):
    prefix = redis_key_prefix(tenant)
    backup_root = os.environ.get("OMNIDECK_BACKUP_ROOT", "/backups")
    backup_dir = os.path.join(backup_root, "redis")
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(backup_dir, f"{tenant}_{timestamp}.rdb")

    r = redis.Redis(
        host="redis",
        port=6379,
        password=get_env("REDIS_PASSWORD"),
        decode_responses=False,
    )

    with open(backup_file, "wb") as f:
        for key in r.scan_iter(match=f"{prefix}*"):
            val = r.dump(key)
            ttl = r.pttl(key)
            f.write(key)
            f.write(b"|")
            f.write(str(ttl).encode())
            f.write(b"|")
            f.write(val)
            f.write(b"\n---KEY---\n")

    print(f"[redis] backup complete: {backup_file}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: backup_redis.py <tenant_name>", file=sys.stderr)
        sys.exit(1)
    tenant = validate_tenant_name(sys.argv[1])
    backup_redis(tenant)
