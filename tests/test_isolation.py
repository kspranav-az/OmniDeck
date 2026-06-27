"""Isolation tests: verify tenants cannot access each other's data."""
import json
import os
import subprocess
import sys
from io import BytesIO

import psycopg
import pymongo
import redis
import urllib3
from minio import Minio
from minio.error import S3Error

# Ensure project root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from common import generate_password, mongo_db_name, postgres_db_name  # noqa: E402


def run_script(script: str, tenant: str):
    result = subprocess.run(
        ["python", f"/workspace/scripts/{script}", tenant],
        capture_output=True,
        text=True,
        check=True,
    )
    # Extract JSON object starting from first '{'
    start = result.stdout.find("{")
    if start == -1:
        raise ValueError(f"no JSON found in {script} output")
    return json.loads(result.stdout[start:])


def test_tenant_isolation():
    # Clean up any leftover tenants
    for t in ["alpha", "beta"]:
        subprocess.run(["python", "/workspace/scripts/deprovision_tenant.py", t], capture_output=True)

    alpha = run_script("provision_tenant.py", "alpha")
    beta = run_script("provision_tenant.py", "beta")

    try:
        # 1. Postgres: alpha can connect to game_alpha but not game_beta
        alpha_pg = psycopg.connect(
            host="postgres",
            port=5432,
            user=alpha["postgres"]["user"],
            password=alpha["postgres"]["password"],
            dbname=alpha["postgres"]["database"],
        )
        cur = alpha_pg.cursor()
        cur.execute("CREATE TABLE test (id int);")
        cur.execute("INSERT INTO test VALUES (1);")
        alpha_pg.commit()
        cur.close()
        alpha_pg.close()

        pg_failed = False
        try:
            psycopg.connect(
                host="postgres",
                port=5432,
                user=alpha["postgres"]["user"],
                password=alpha["postgres"]["password"],
                dbname=beta["postgres"]["database"],
            )
        except psycopg.OperationalError:
            pg_failed = True
        assert pg_failed, "alpha should not be able to connect to beta's Postgres database"

        # 2. MongoDB: alpha can access game_alpha but not game_beta
        alpha_mongo = pymongo.MongoClient(
            f"mongo:{alpha['mongo']['port']}",
            username=alpha["mongo"]["user"],
            password=alpha["mongo"]["password"],
            authSource=alpha["mongo"]["database"],
        )
        alpha_mongo[alpha["mongo"]["database"]].test.insert_one({"msg": "alpha"})
        alpha_mongo.close()

        mongo_failed = False
        try:
            client = pymongo.MongoClient(
                f"mongo:{beta['mongo']['port']}",
                username=alpha["mongo"]["user"],
                password=alpha["mongo"]["password"],
                authSource=beta["mongo"]["database"],
            )
            client[beta["mongo"]["database"]].test.find_one()
        except pymongo.errors.OperationFailure:
            mongo_failed = True
        assert mongo_failed, "alpha should not be able to access beta's MongoDB database"

        # 3. Redis: alpha can access alpha:* keys but not beta:* keys
        r_alpha = redis.Redis(
            host="redis",
            port=6379,
            username=alpha["redis"]["user"],
            password=alpha["redis"]["password"],
            decode_responses=True,
        )
        r_alpha.set("alpha:hello", "world")
        assert r_alpha.get("alpha:hello") == "world"

        redis_failed = False
        try:
            r_alpha.get("beta:secret")
        except redis.exceptions.NoPermissionError:
            redis_failed = True
        assert redis_failed, "alpha should not be able to read beta's Redis keys"
        r_alpha.close()

        # 4. MinIO: alpha can access alpha bucket but not beta bucket
        # MinIO runs with TLS internally; the hostname mismatch requires skipping verification.
        http_client = urllib3.PoolManager(cert_reqs="CERT_NONE", assert_hostname=False)
        alpha_minio = Minio(
            "minio:9000",
            access_key=alpha["minio"]["access_key"],
            secret_key=alpha["minio"]["secret_key"],
            secure=True,
            http_client=http_client,
        )
        alpha_minio.put_object(alpha["minio"]["bucket"], "hello.txt", BytesIO(b"hello"), length=5)
        assert alpha_minio.bucket_exists(alpha["minio"]["bucket"])

        minio_failed = False
        try:
            alpha_minio.bucket_exists(beta["minio"]["bucket"])
        except S3Error:
            minio_failed = True
        assert minio_failed, "alpha should not be able to access beta's MinIO bucket"

        print("All isolation tests passed.")
    finally:
        for t in ["alpha", "beta"]:
            subprocess.run(["python", "/workspace/scripts/deprovision_tenant.py", t], capture_output=True)


if __name__ == "__main__":
    test_tenant_isolation()
