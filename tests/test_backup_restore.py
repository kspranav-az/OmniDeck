"""Backup and rollback tests for OmniDeck tenant data and volumes."""
import glob
import json
import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import psycopg
import pymongo
import pytest
import redis
from minio import Minio

# Backup scripts write to this path inside the test-runner container.
os.environ.setdefault("OMNIDECK_BACKUP_ROOT", "/workspace/backups")

# Ensure project root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from common import mongo_db_name, postgres_db_name  # noqa: E402


def _provision(tenant: str) -> dict:
    result = subprocess.run(
        ["python", "/workspace/scripts/provision_tenant.py", tenant],
        capture_output=True,
        text=True,
        check=True,
    )
    start = result.stdout.find("{")
    return json.loads(result.stdout[start:])


def _deprovision(tenant: str):
    subprocess.run(
        ["python", "/workspace/scripts/deprovision_tenant.py", tenant],
        capture_output=True,
    )


@pytest.fixture
def tenant():
    name = "backuptenant"
    _deprovision(name)
    creds = _provision(name)
    yield creds
    _deprovision(name)


def test_postgres_backup_restore(tenant):
    pg = tenant["postgres"]
    os.environ["PGPASSWORD"] = pg["password"]

    conn = psycopg.connect(
        host=pg["host"],
        port=pg["port"],
        user=pg["user"],
        password=pg["password"],
        dbname=pg["database"],
    )
    cur = conn.cursor()
    cur.execute("CREATE TABLE backup_test (id int);")
    cur.execute("INSERT INTO backup_test VALUES (42);")
    conn.commit()
    cur.close()
    conn.close()

    subprocess.run(["/workspace/scripts/backup_postgres.sh", tenant["tenant"]], check=True)

    conn = psycopg.connect(
        host=pg["host"],
        port=pg["port"],
        user=pg["user"],
        password=pg["password"],
        dbname=pg["database"],
    )
    cur = conn.cursor()
    cur.execute("DELETE FROM backup_test;")
    conn.commit()
    cur.close()
    conn.close()

    backups = sorted(glob.glob(f"/workspace/backups/postgres/{tenant['tenant']}_*.dump"), reverse=True)
    assert backups, "Postgres backup file not found"
    subprocess.run(["/workspace/scripts/restore_postgres.sh", tenant["tenant"], backups[0]], check=True)

    conn = psycopg.connect(
        host=pg["host"],
        port=pg["port"],
        user=pg["user"],
        password=pg["password"],
        dbname=pg["database"],
    )
    cur = conn.cursor()
    cur.execute("SELECT id FROM backup_test;")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    assert rows == [(42,)], f"Expected [(42,)], got {rows}"


def test_mongo_backup_restore(tenant):
    m = tenant["mongo"]
    client = pymongo.MongoClient(
        f"{m['host']}:{m['port']}",
        username=m["user"],
        password=m["password"],
        authSource=m["database"],
    )
    db = client[m["database"]]
    db.backup_test.insert_one({"msg": "hello"})
    client.close()

    subprocess.run(["/workspace/scripts/backup_mongo.sh", tenant["tenant"]], check=True)

    client = pymongo.MongoClient(
        f"{m['host']}:{m['port']}",
        username=m["user"],
        password=m["password"],
        authSource=m["database"],
    )
    db = client[m["database"]]
    db.backup_test.delete_many({})
    client.close()

    backups = sorted(glob.glob(f"/workspace/backups/mongo/{tenant['tenant']}_*"), reverse=True)
    assert backups, "MongoDB backup directory not found"
    subprocess.run(["/workspace/scripts/restore_mongo.sh", tenant["tenant"], backups[0]], check=True)

    client = pymongo.MongoClient(
        f"{m['host']}:{m['port']}",
        username=m["user"],
        password=m["password"],
        authSource=m["database"],
    )
    db = client[m["database"]]
    doc = db.backup_test.find_one()
    client.close()

    assert doc and doc["msg"] == "hello", f"Expected restored doc, got {doc}"


def test_redis_backup_restore(tenant):
    rinfo = tenant["redis"]
    rc = redis.Redis(
        host=rinfo["host"],
        port=rinfo["port"],
        username=rinfo["user"],
        password=rinfo["password"],
        decode_responses=True,
    )
    prefix = f"{tenant['tenant']}:backup:"
    rc.set(f"{prefix}key1", "value1")
    rc.set(f"{prefix}key2", "value2")

    subprocess.run(["python", "/workspace/scripts/backup_redis.py", tenant["tenant"]], check=True)

    rc.delete(f"{prefix}key1", f"{prefix}key2")
    assert rc.get(f"{prefix}key1") is None

    backups = sorted(glob.glob(f"/workspace/backups/redis/{tenant['tenant']}_*.rdb"), reverse=True)
    assert backups, "Redis backup file not found"
    subprocess.run(["python", "/workspace/scripts/restore_redis.py", tenant["tenant"], backups[0]], check=True)

    assert rc.get(f"{prefix}key1") == "value1"
    assert rc.get(f"{prefix}key2") == "value2"
    rc.close()


def test_volume_snapshot_restore():
    """Snapshot and restore the Redis volume to verify whole-volume rollback."""
    volume = "omnideck_redisdata"
    service = "redis"

    subprocess.run(["/workspace/scripts/snapshot_volume.sh", volume], check=True)

    backups = sorted(glob.glob(f"/workspace/backups/volumes/{volume}_*.tar.gz"), reverse=True)
    assert backups, "Volume snapshot file not found"

    # Verify the restore script runs successfully (this stops and restarts Redis).
    subprocess.run(["/workspace/scripts/restore_volume.sh", volume, backups[0], service], check=True)

    # After restore, Redis should become healthy again.
    import time
    deadline = time.time() + 60
    health = "starting"
    while time.time() < deadline:
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Health.Status}}", "omnideck-redis"],
            capture_output=True,
            text=True,
            check=True,
        )
        health = result.stdout.strip()
        if health == "healthy":
            break
        time.sleep(2)
    assert health == "healthy", f"Redis not healthy after volume restore: {health}"
