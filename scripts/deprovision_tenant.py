#!/usr/bin/env python3
"""Deprovision an OmniDeck tenant from all four backend services."""
import json
import subprocess
import sys

import psycopg
from psycopg import sql
import pymongo
import redis
from minio import Minio

from common import (
    get_env,
    mongo_db_name,
    postgres_db_name,
    validate_tenant_name,
)


def deprovision_postgres(tenant: str):
    user = tenant
    db_name = postgres_db_name(tenant)
    conn = psycopg.connect(
        host="postgres",
        port=5432,
        user=get_env("POSTGRES_USER"),
        password=get_env("POSTGRES_PASSWORD"),
        dbname="postgres",
    )
    conn.autocommit = True
    cur = conn.cursor()
    # Drop the main tenant database and any rollback "broken" copies.
    cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db_name)))
    cur.execute(
        "SELECT datname FROM pg_database WHERE datname LIKE %s",
        (f"{db_name}_broken_%",),
    )
    for row in cur.fetchall():
        broken_db = row[0]
        cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(broken_db)))
    cur.execute(sql.SQL("DROP USER IF EXISTS {}").format(sql.Identifier(user)))
    cur.close()
    conn.close()
    print(f"[postgres] dropped database {db_name}, broken copies, and user {user}")


def deprovision_mongo(tenant: str):
    user = tenant
    db_name = mongo_db_name(tenant)
    client = pymongo.MongoClient(
        "mongo:27017",
        username=get_env("MONGO_INITDB_ROOT_USERNAME"),
        password=get_env("MONGO_INITDB_ROOT_PASSWORD"),
        authSource="admin",
    )
    db = client[db_name]
    try:
        db.command("dropUser", user)
    except pymongo.errors.OperationFailure:
        pass
    client.drop_database(db_name)
    client.close()
    print(f"[mongo] dropped database {db_name} and user {user}")


def deprovision_redis(tenant: str):
    r = redis.Redis(
        host="redis",
        port=6379,
        password=get_env("REDIS_PASSWORD"),
        decode_responses=True,
    )
    try:
        r.acl_deluser(tenant)
    except redis.exceptions.ResponseError:
        pass
    r.close()
    print(f"[redis] removed ACL user {tenant}")


def deprovision_minio(tenant: str):
    access_key = tenant
    root_user = get_env("MINIO_ROOT_USER")
    root_password = get_env("MINIO_ROOT_PASSWORD")

    # Use mc to remove bucket (with versions), user, and policy
    subprocess.run(
        ["mc", "alias", "set", "local", "http://minio:9000", root_user, root_password],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["mc", "rb", "--force", "--versions", f"local/{tenant}"],
        check=False,
        capture_output=True,
    )
    subprocess.run(
        ["mc", "admin", "user", "remove", "local", access_key],
        check=False,
        capture_output=True,
    )
    policy_name = f"policy-{tenant}"
    subprocess.run(
        ["mc", "admin", "policy", "remove", "local", policy_name],
        check=False,
        capture_output=True,
    )
    print(f"[minio] removed bucket {tenant} and user {access_key}")


def main():
    if len(sys.argv) != 2:
        print("Usage: deprovision_tenant.py <tenant_name>", file=sys.stderr)
        sys.exit(1)
    tenant = validate_tenant_name(sys.argv[1])

    deprovision_postgres(tenant)
    deprovision_mongo(tenant)
    deprovision_redis(tenant)
    deprovision_minio(tenant)
    print(json.dumps({"status": "deleted", "tenant": tenant}))


if __name__ == "__main__":
    main()
