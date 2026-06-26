"""OmniDeck management frontend (FastAPI + React SPA backend)."""
import glob
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

import docker
import httpx
import psycopg
import pymongo
import redis
from fastapi import FastAPI, Request, Form, Depends, HTTPException, status, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from auth import (
    generate_password,
    get_current_tenant,
    hash_password,
    login_admin,
    login_developer,
    logout,
    require_admin,
    require_developer,
    seed_admin,
)
from models import Tenant, Service, get_db, init_db, seed_services

app = FastAPI(title="OmniDeck")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SECRET_KEY", "dev-secret-change-me"),
    max_age=1800,
)

# Static SPA files (built by Vite)
STATIC_DIR = Path(__file__).parent / "dist"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


# -----------------------------------------------------------------------------
# Startup
# -----------------------------------------------------------------------------
@app.on_event("startup")
def on_startup():
    init_db()
    db = next(get_db())
    seed_admin(db)
    seed_services(db)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def sanitize_name(name: str) -> str:
    name = name.lower().strip()
    if not name:
        raise ValueError("invalid name")
    if not re.match(r"^[a-z0-9_-]+$", name):
        raise ValueError("invalid name")
    return name


def run_provision(tenant_name: str, services: list[str]):
    env = os.environ.copy()
    env["OMNIDECK_ENABLED_SERVICES"] = ",".join(services)
    result = subprocess.run(
        ["python", "/opt/omnideck/scripts/provision_tenant.py", tenant_name],
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    start = result.stdout.find("{")
    return json.loads(result.stdout[start:])


def run_deprovision(tenant_name: str):
    subprocess.run(
        ["python", "/opt/omnideck/scripts/deprovision_tenant.py", tenant_name],
        capture_output=True,
        text=True,
        check=True,
    )


def tenant_to_dict(tenant: Tenant, include_login_password: bool = False) -> dict:
    data = {
        "id": tenant.id,
        "name": tenant.name,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "enabled_services": [s.key for s in tenant.enabled_services],
        "credentials": {
            "postgres": {
                "user": tenant.postgres_user,
                "password": tenant.postgres_password,
                "database": f"game_{tenant.name}",
                "host": "postgres",
                "port": 5432,
            },
            "mongo": {
                "user": tenant.mongo_user,
                "password": tenant.mongo_password,
                "database": f"game_{tenant.name}",
                "host": "mongo",
                "port": 27017,
            },
            "redis": {
                "user": tenant.redis_user,
                "password": tenant.redis_password,
                "host": "redis",
                "port": 6379,
            },
            "minio": {
                "access_key": tenant.minio_access_key,
                "secret_key": tenant.minio_secret_key,
                "bucket": tenant.name,
                "host": "minio",
                "port": 9000,
            },
        },
    }
    if include_login_password:
        data["login_password"] = None
    return data


# -----------------------------------------------------------------------------
# Auth API
# -----------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def api_login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    if login_admin(request, db, payload.username, payload.password):
        return {"user_type": "admin", "username": payload.username}
    if login_developer(request, db, payload.username, payload.password):
        return {"user_type": "developer", "username": payload.username}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")


@app.post("/api/auth/logout")
def api_logout(request: Request):
    logout(request)
    return {"status": "logged out"}


@app.get("/api/auth/me")
def api_me(request: Request, db: Session = Depends(get_db)):
    user_type = request.session.get("user_type")
    if user_type == "admin":
        return {"user_type": "admin", "username": request.session.get("username")}
    if user_type == "developer":
        tenant = get_current_tenant(request, db)
        return {
            "user_type": "developer",
            "username": tenant.name,
            "enabled_services": [s.key for s in tenant.enabled_services],
        }
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")


# -----------------------------------------------------------------------------
# Admin API
# -----------------------------------------------------------------------------
@app.get("/api/admin/tenants")
def api_admin_tenants(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return [tenant_to_dict(t) for t in tenants]


@app.post("/api/admin/tenants")
def api_admin_create_tenant(
    request: Request,
    name: str = Form(...),
    services: Optional[str] = Form("postgres,mongo,redis,minio"),
    db: Session = Depends(get_db),
):
    require_admin(request)
    tenant_name = sanitize_name(name)
    if db.query(Tenant).filter(Tenant.name == tenant_name).first():
        raise HTTPException(status_code=400, detail="tenant already exists")

    service_keys = [s.strip() for s in services.split(",") if s.strip()]
    valid_services = {s.key for s in db.query(Service).all()}
    service_keys = [s for s in service_keys if s in valid_services]
    if not service_keys:
        service_keys = list(valid_services)

    creds = run_provision(tenant_name, service_keys)
    login_password = generate_password()

    tenant = Tenant(
        name=tenant_name,
        postgres_user=(creds.get("postgres") or {}).get("user"),
        postgres_password=(creds.get("postgres") or {}).get("password"),
        mongo_user=(creds.get("mongo") or {}).get("user"),
        mongo_password=(creds.get("mongo") or {}).get("password"),
        redis_user=(creds.get("redis") or {}).get("user"),
        redis_password=(creds.get("redis") or {}).get("password"),
        minio_access_key=(creds.get("minio") or {}).get("access_key"),
        minio_secret_key=(creds.get("minio") or {}).get("secret_key"),
        login_password_hash=hash_password(login_password),
    )
    for svc_key in service_keys:
        svc = db.query(Service).filter(Service.key == svc_key).first()
        if svc:
            tenant.enabled_services.append(svc)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    data = tenant_to_dict(tenant)
    data["login_password"] = login_password
    return data


@app.delete("/api/admin/tenants/{tenant_name}")
def api_admin_delete_tenant(request: Request, tenant_name: str, db: Session = Depends(get_db)):
    require_admin(request)
    tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="tenant not found")
    run_deprovision(tenant_name)
    db.delete(tenant)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/admin/tenants/{tenant_name}/services")
def api_admin_tenant_services(request: Request, tenant_name: str, db: Session = Depends(get_db)):
    require_admin(request)
    tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="tenant not found")
    services = db.query(Service).all()
    return {
        "tenant": tenant.name,
        "services": [
            {
                "key": s.key,
                "label": s.label,
                "description": s.description,
                "enabled": s.key in {es.key for es in tenant.enabled_services},
            }
            for s in services
        ],
    }


@app.put("/api/admin/tenants/{tenant_name}/services")
def api_admin_update_tenant_services(
    request: Request,
    tenant_name: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    require_admin(request)
    tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="tenant not found")

    enabled_keys = set(payload.get("enabled", []))
    valid_services = {s.key for s in db.query(Service).all()}
    enabled_keys = enabled_keys & valid_services
    current_keys = {s.key for s in tenant.enabled_services}
    newly_enabled = enabled_keys - current_keys

    # Generate missing credentials for any service that is being enabled.
    # Postgres, Mongo, and Redis use the tenant name as the username. MinIO
    # uses the tenant name as the access key.
    if "postgres" in newly_enabled and not tenant.postgres_password:
        tenant.postgres_user = tenant.name
        tenant.postgres_password = generate_password()
    if "mongo" in newly_enabled and not tenant.mongo_password:
        tenant.mongo_user = tenant.name
        tenant.mongo_password = generate_password()
    if "redis" in newly_enabled and not tenant.redis_password:
        tenant.redis_user = tenant.name
        tenant.redis_password = generate_password()
    if "minio" in newly_enabled and not tenant.minio_secret_key:
        tenant.minio_access_key = tenant.name
        tenant.minio_secret_key = generate_password()

    if newly_enabled:
        db.commit()
        creds = run_provision(tenant.name, sorted(newly_enabled))
        # Persist credentials returned by the provisioner (they may be freshly
        # generated). Only update services that were actually provisioned.
        if creds.get("postgres"):
            tenant.postgres_user = creds["postgres"]["user"]
            tenant.postgres_password = creds["postgres"]["password"]
        if creds.get("mongo"):
            tenant.mongo_user = creds["mongo"]["user"]
            tenant.mongo_password = creds["mongo"]["password"]
        if creds.get("redis"):
            tenant.redis_user = creds["redis"]["user"]
            tenant.redis_password = creds["redis"]["password"]
        if creds.get("minio"):
            tenant.minio_access_key = creds["minio"]["access_key"]
            tenant.minio_secret_key = creds["minio"]["secret_key"]

    all_services = db.query(Service).all()
    tenant.enabled_services = [s for s in all_services if s.key in enabled_keys]
    db.commit()
    return {"enabled": [s.key for s in tenant.enabled_services]}


@app.get("/api/admin/health")
def api_admin_health(request: Request, db: Session = Depends(get_db)):
    require_admin(request)
    container_stats: list[dict] = []
    stats_by_name: dict[str, dict] = {}

    # Fast status list, scoped to project containers.
    try:
        docker_client = docker.DockerClient(
            base_url="unix://var/run/docker.sock", timeout=3
        )
        containers = docker_client.containers.list(filters={"name": "omnideck"})
    except Exception as e:
        containers = []
        container_stats = [{"error": str(e)}]

    # Best-effort resource stats via CLI with a tight timeout. The SDK stats()
    # call can hang on some Docker Desktop configurations; this keeps the
    # endpoint responsive while still returning real metrics when available.
    if containers:
        try:
            proc = subprocess.run(
                [
                    "docker",
                    "stats",
                    "--no-stream",
                    "--format",
                    "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}",
                ],
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            if proc.returncode == 0:
                for line in proc.stdout.strip().splitlines():
                    parts = line.split("\t")
                    if len(parts) != 3:
                        continue
                    name, cpu, mem = parts
                    mem_parts = mem.split(" / ")
                    usage_str = mem_parts[0].strip()
                    limit_str = mem_parts[1].strip() if len(mem_parts) > 1 else "0B"
                    stats_by_name[name] = {
                        "cpu_percent": _parse_docker_percent(cpu),
                        "memory_usage_mb": _parse_docker_size(usage_str),
                        "memory_limit_mb": _parse_docker_size(limit_str),
                    }
        except Exception:
            pass

        for c in containers:
            entry: dict = {"name": c.name, "status": c.status}
            entry.update(stats_by_name.get(c.name, {}))
            container_stats.append(entry)

    return {
        "containers": container_stats,
        "tenant_count": db.query(Tenant).count(),
    }


def _parse_docker_percent(value: str) -> float:
    try:
        return float(value.replace("%", "").strip())
    except ValueError:
        return 0.0


def _parse_docker_size(value: str) -> int:
    value = value.strip()
    if not value or value == "--":
        return 0
    units = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}
    for unit, factor in units.items():
        if value.endswith(unit):
            try:
                return int(float(value[: -len(unit)].strip()) * factor) // (1024 * 1024)
            except ValueError:
                return 0
    try:
        return int(float(value)) // (1024 * 1024)
    except ValueError:
        return 0


# -----------------------------------------------------------------------------
# Backup / Restore API (admin only)
# -----------------------------------------------------------------------------
@app.post("/api/admin/snapshot-volume")
def api_admin_snapshot_volume(
    request: Request,
    volume: str = Form(...),
):
    require_admin(request)
    subprocess.run(["/opt/omnideck/scripts/snapshot_volume.sh", volume], check=True)
    return {"status": "snapshot created"}


@app.get("/api/admin/backups")
def api_admin_backups(
    request: Request,
    service: Optional[str] = Query(None),
    tenant: Optional[str] = Query(None),
):
    require_admin(request)
    root = os.environ.get("OMNIDECK_BACKUP_ROOT", "/backups")
    backups = []
    if service in (None, "postgres"):
        for f in glob.glob(f"{root}/postgres/{tenant or '*'}_*.dump"):
            backups.append({"service": "postgres", "tenant": Path(f).stem.split("_")[0], "path": f})
    if service in (None, "mongo"):
        for d in glob.glob(f"{root}/mongo/{tenant or '*'}_*"):
            if os.path.isdir(d):
                backups.append({"service": "mongo", "tenant": Path(d).stem.split("_")[0], "path": d})
    if service in (None, "redis"):
        for f in glob.glob(f"{root}/redis/{tenant or '*'}_*.rdb"):
            backups.append({"service": "redis", "tenant": Path(f).stem.split("_")[0], "path": f})
    if service in (None, "volume"):
        for f in glob.glob(f"{root}/volumes/*_*.tar.gz"):
            backups.append({"service": "volume", "tenant": None, "path": f})
    backups.sort(key=lambda x: x["path"], reverse=True)
    return {"backups": backups}


@app.post("/api/admin/backups")
def api_admin_create_backup(
    request: Request,
    service: str = Form(...),
    tenant: str = Form(...),
):
    require_admin(request)
    if service == "postgres":
        subprocess.run(["/opt/omnideck/scripts/backup_postgres.sh", tenant], check=True)
    elif service == "mongo":
        subprocess.run(["/opt/omnideck/scripts/backup_mongo.sh", tenant], check=True)
    elif service == "redis":
        subprocess.run(["python", "/opt/omnideck/scripts/backup_redis.py", tenant], check=True)
    else:
        raise HTTPException(status_code=400, detail="unsupported service for backup")
    return {"status": "backup started"}


@app.post("/api/admin/restore")
def api_admin_restore(
    request: Request,
    service: str = Form(...),
    tenant: str = Form(...),
    path: str = Form(...),
):
    require_admin(request)
    if service == "postgres":
        subprocess.run(["/opt/omnideck/scripts/restore_postgres.sh", tenant, path], check=True)
    elif service == "mongo":
        subprocess.run(["/opt/omnideck/scripts/restore_mongo.sh", tenant, path], check=True)
    elif service == "redis":
        subprocess.run(["python", "/opt/omnideck/scripts/restore_redis.py", tenant, path], check=True)
    elif service == "volume":
        # path format: <volume_name> <backup_file> <service_name>
        raise HTTPException(status_code=400, detail="use dedicated volume restore endpoint")
    else:
        raise HTTPException(status_code=400, detail="unsupported service for restore")
    return {"status": "restored"}


@app.post("/api/admin/restore-volume")
def api_admin_restore_volume(
    request: Request,
    volume: str = Form(...),
    path: str = Form(...),
    service: str = Form(...),
):
    require_admin(request)
    subprocess.run(["/opt/omnideck/scripts/restore_volume.sh", volume, path, service], check=True)
    return {"status": "volume restored"}


# -----------------------------------------------------------------------------
# Developer API
# -----------------------------------------------------------------------------
@app.get("/api/developer/me")
def api_developer_me(request: Request, db: Session = Depends(get_db)):
    tenant = get_current_tenant(request, db)
    return tenant_to_dict(tenant)


@app.get("/api/developer/services")
def api_developer_services(request: Request, db: Session = Depends(get_db)):
    tenant = get_current_tenant(request, db)
    return {
        "enabled": [s.key for s in tenant.enabled_services],
        "services": [
            {"key": s.key, "label": s.label, "description": s.description}
            for s in tenant.enabled_services
        ],
    }


@app.get("/api/developer/usage")
def api_developer_usage(request: Request, db: Session = Depends(get_db)):
    tenant = get_current_tenant(request, db)
    return get_tenant_usage(tenant)


@app.post("/api/developer/services/{service_key}/test")
def api_developer_test_service(request: Request, service_key: str, db: Session = Depends(get_db)):
    tenant = get_current_tenant(request, db)
    if not tenant.is_service_enabled(service_key):
        raise HTTPException(status_code=400, detail="service not enabled")

    try:
        if service_key == "postgres":
            conn = psycopg.connect(
                host="postgres", port=5432,
                user=tenant.postgres_user,
                password=tenant.postgres_password,
                dbname=f"game_{tenant.name}",
            )
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            conn.close()
        elif service_key == "mongo":
            client = pymongo.MongoClient(
                "mongo:27017",
                username=tenant.mongo_user,
                password=tenant.mongo_password,
                authSource=f"game_{tenant.name}",
            )
            client[f"game_{tenant.name}"].command("ping")
            client.close()
        elif service_key == "redis":
            r = redis.Redis(host="redis", port=6379, username=tenant.redis_user, password=tenant.redis_password)
            r.ping()
            r.close()
        elif service_key == "minio":
            from minio import Minio
            mc = Minio("minio:9000", access_key=tenant.minio_access_key, secret_key=tenant.minio_secret_key, secure=False)
            mc.bucket_exists(tenant.name)
        else:
            raise HTTPException(status_code=400, detail="unknown service")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok"}


def get_tenant_usage(tenant: Tenant) -> dict:
    usage = {
        "postgres_size_mb": 0,
        "postgres_table_count": 0,
        "mongo_size_mb": 0,
        "mongo_collection_count": 0,
        "redis_key_count": 0,
        "minio_size_bytes": 0,
        "minio_object_count": 0,
    }

    if tenant.is_service_enabled("postgres"):
        try:
            conn = psycopg.connect(
                host="postgres", port=5432,
                user=tenant.postgres_user,
                password=tenant.postgres_password,
                dbname=f"game_{tenant.name}",
            )
            cur = conn.cursor()
            cur.execute("SELECT pg_database_size(%s) / (1024*1024);", (f"game_{tenant.name}",))
            usage["postgres_size_mb"] = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
            usage["postgres_table_count"] = cur.fetchone()[0]
            cur.close()
            conn.close()
        except Exception as e:
            usage["postgres_error"] = str(e)

    if tenant.is_service_enabled("mongo"):
        try:
            client = pymongo.MongoClient(
                "mongo:27017",
                username=tenant.mongo_user,
                password=tenant.mongo_password,
                authSource=f"game_{tenant.name}",
            )
            db = client[f"game_{tenant.name}"]
            usage["mongo_size_mb"] = round(db.command("dbStats").get("dataSize", 0) / (1024 * 1024), 2)
            usage["mongo_collection_count"] = len(db.list_collection_names())
            client.close()
        except Exception as e:
            usage["mongo_error"] = str(e)

    if tenant.is_service_enabled("redis"):
        try:
            r = redis.Redis(
                host="redis", port=6379,
                username=tenant.redis_user,
                password=tenant.redis_password,
                decode_responses=True,
            )
            usage["redis_key_count"] = len(list(r.scan_iter(match=f"{tenant.name}:*")))
            r.close()
        except Exception as e:
            usage["redis_error"] = str(e)

    if tenant.is_service_enabled("minio"):
        try:
            from minio import Minio
            client = Minio(
                "minio:9000",
                access_key=tenant.minio_access_key,
                secret_key=tenant.minio_secret_key,
                secure=False,
            )
            objects = client.list_objects(tenant.name, recursive=True)
            obj_list = list(objects)
            usage["minio_object_count"] = len(obj_list)
            usage["minio_size_bytes"] = sum(obj.size or 0 for obj in obj_list)
        except Exception as e:
            usage["minio_error"] = str(e)

    return usage


# -----------------------------------------------------------------------------
# Public
# -----------------------------------------------------------------------------
@app.get("/api/health")
def api_health():
    return {"status": "ok"}


# -----------------------------------------------------------------------------
# SPA catch-all
# -----------------------------------------------------------------------------
@app.get("/{path:path}", response_class=HTMLResponse)
def serve_spa(path: str, request: Request):
    # API routes are handled above; serve index.html for everything else.
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="not found")
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>OmniDeck</h1><p>Frontend build not found. Run `npm run build` in frontend/.</p>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
