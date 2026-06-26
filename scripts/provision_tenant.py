#!/usr/bin/env python3
"""Provision a new OmniDeck tenant across all four backend services."""
import json
import sys

import psycopg
from psycopg import sql
import pymongo
import redis
from minio import Minio
from minio.versioningconfig import VersioningConfig

from common import (
    generate_password,
    get_env,
    mongo_db_name,
    postgres_db_name,
    redis_key_prefix,
    validate_tenant_name,
)


def provision_postgres(tenant: str, password: str):
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
    cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db_name)))
    cur.execute(sql.SQL("DROP USER IF EXISTS {}").format(sql.Identifier(user)))
    cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
    cur.execute(
        sql.SQL("CREATE USER {} WITH PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE").format(
            sql.Identifier(user), sql.Literal(password)
        )
    )
    cur.execute(sql.SQL("ALTER DATABASE {} OWNER TO {}").format(sql.Identifier(db_name), sql.Identifier(user)))
    # Restrict access: remove public access and grant only to tenant
    cur.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(db_name)))
    cur.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(db_name), sql.Identifier(user)))
    # Revoke access to all other databases for this tenant
    cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
    for row in cur.fetchall():
        other_db = row[0]
        if other_db != db_name:
            cur.execute(
                sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(
                    sql.Identifier(other_db), sql.Identifier(user)
                )
            )
    # Connect to the new database to grant schema privileges
    cur.close()
    conn.close()
    conn = psycopg.connect(
        host="postgres",
        port=5432,
        user=get_env("POSTGRES_USER"),
        password=get_env("POSTGRES_PASSWORD"),
        dbname=db_name,
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(user)))
    cur.execute(sql.SQL("GRANT ALL PRIVILEGES ON SCHEMA public TO {}").format(sql.Identifier(user)))
    cur.execute(
        sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT ALL ON TABLES TO {}").format(
            sql.Identifier(user), sql.Identifier(user)
        )
    )
    cur.execute(
        sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT ALL ON SEQUENCES TO {}").format(
            sql.Identifier(user), sql.Identifier(user)
        )
    )
    cur.close()
    conn.close()
    print(f"[postgres] created database {db_name} and user {user}")


def provision_mongo(tenant: str, password: str):
    user = tenant
    db_name = mongo_db_name(tenant)
    client = pymongo.MongoClient(
        "mongo:27017",
        username=get_env("MONGO_INITDB_ROOT_USERNAME"),
        password=get_env("MONGO_INITDB_ROOT_PASSWORD"),
        authSource="admin",
    )
    db = client[db_name]
    # Drop existing user if present
    try:
        db.command("dropUser", user)
    except pymongo.errors.OperationFailure:
        pass
    db.command("createUser", user, pwd=password, roles=[{"role": "readWrite", "db": db_name}])
    client.close()
    print(f"[mongo] created user {user} for database {db_name}")


def provision_redis(tenant: str, password: str):
    prefix = redis_key_prefix(tenant)
    r = redis.Redis(
        host="redis",
        port=6379,
        password=get_env("REDIS_PASSWORD"),
        decode_responses=True,
    )
    # Delete user if exists
    try:
        r.acl_deluser(tenant)
    except redis.exceptions.ResponseError:
        pass
    r.acl_setuser(
        username=tenant,
        enabled=True,
        passwords=[f"+{password}"],
        commands=["+@all"],
        keys=[f"{prefix}*"],
    )
    r.close()
    print(f"[redis] created ACL user {tenant} with prefix {prefix}")


def provision_minio(tenant: str, secret_key: str):
    access_key = tenant
    root_user = get_env("MINIO_ROOT_USER")
    root_password = get_env("MINIO_ROOT_PASSWORD")
    client = Minio("minio:9000", access_key=root_user, secret_key=root_password, secure=False)

    # Create bucket if not exists
    if not client.bucket_exists(tenant):
        client.make_bucket(tenant)
    # Enable versioning
    client.set_bucket_versioning(tenant, VersioningConfig(status="Enabled"))

    # Use mc to create a service account restricted to this bucket
    import subprocess
    subprocess.run(
        ["mc", "alias", "set", "local", "http://minio:9000", root_user, root_password],
        check=True,
        capture_output=True,
    )
    policy_name = f"policy-{tenant}"
    policy_doc = json.dumps({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["s3:*"],
                "Resource": [f"arn:aws:s3:::{tenant}", f"arn:aws:s3:::{tenant}/*"],
            }
        ],
    })
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        f.write(policy_doc)
        policy_path = f.name
    subprocess.run(
        ["mc", "admin", "policy", "create", "local", policy_name, policy_path],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["mc", "admin", "user", "add", "local", access_key, secret_key],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["mc", "admin", "policy", "attach", "local", policy_name, "--user", access_key],
        check=True,
        capture_output=True,
    )
    print(f"[minio] created bucket {tenant} and user {access_key}")


def main():
    if len(sys.argv) != 2:
        print("Usage: provision_tenant.py <tenant_name>", file=sys.stderr)
        sys.exit(1)
    tenant = validate_tenant_name(sys.argv[1])

    postgres_password = generate_password()
    mongo_password = generate_password()
    redis_password = generate_password()
    minio_secret_key = generate_password()

    provision_postgres(tenant, postgres_password)
    provision_mongo(tenant, mongo_password)
    provision_redis(tenant, redis_password)
    provision_minio(tenant, minio_secret_key)

    credentials = {
        "tenant": tenant,
        "postgres": {
            "user": tenant,
            "password": postgres_password,
            "database": postgres_db_name(tenant),
            "host": "postgres",
            "port": 5432,
        },
        "mongo": {
            "user": tenant,
            "password": mongo_password,
            "database": mongo_db_name(tenant),
            "host": "mongo",
            "port": 27017,
        },
        "redis": {
            "user": tenant,
            "password": redis_password,
            "host": "redis",
            "port": 6379,
        },
        "minio": {
            "access_key": tenant,
            "secret_key": minio_secret_key,
            "bucket": tenant,
            "host": "minio",
            "port": 9000,
        },
    }
    print(json.dumps(credentials, indent=2))


if __name__ == "__main__":
    main()
