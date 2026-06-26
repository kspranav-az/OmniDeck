"""OmniDeck management frontend (FastAPI)."""
import json
import os
import re
import subprocess
from datetime import datetime
from typing import Optional

import docker
import psycopg
import pymongo
import redis
from fastapi import FastAPI, Request, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from auth import (
    generate_password,
    get_current_tenant,
    hash_password,
    login_admin,
    login_intern,
    logout,
    require_admin,
    require_intern,
    seed_admin,
)
from models import Tenant, get_db, init_db

app = FastAPI(title="OmniDeck")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SECRET_KEY", "dev-secret-change-me"),
    max_age=1800,
)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def sanitize_name(name: str) -> str:
    name = name.lower().strip()
    if not re.match(r"^[a-z0-9_-]+$", name):
        raise ValueError("invalid name")
    return name


@app.on_event("startup")
def on_startup():
    init_db()
    db = next(get_db())
    seed_admin(db)


# Public routes
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


# Admin auth
@app.get("/admin/login", response_class=HTMLResponse)
def admin_login_page(request: Request, error: Optional[str] = None):
    return templates.TemplateResponse(request=request, name="admin_login.html", context={"error": error})


@app.post("/admin/login")
def admin_login(request: Request, username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    if login_admin(request, db, username, password):
        return RedirectResponse(url="/admin", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(url="/admin/login?error=invalid", status_code=status.HTTP_303_SEE_OTHER)


@app.get("/admin/logout")
def admin_logout(request: Request):
    logout(request)
    return RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)


# Admin dashboard
@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    try:
        require_admin(request)
    except HTTPException as exc:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return templates.TemplateResponse(
        request=request,
        name="admin_dashboard.html",
        context={"tenants": tenants, "username": request.session.get("username")},
    )


@app.post("/admin/tenants")
def create_tenant(request: Request, name: str = Form(...), db: Session = Depends(get_db)):
    try:
        require_admin(request)
    except HTTPException:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)

    try:
        tenant_name = sanitize_name(name)
    except ValueError:
        return RedirectResponse(url="/admin?error=invalid_name", status_code=status.HTTP_303_SEE_OTHER)

    if db.query(Tenant).filter(Tenant.name == tenant_name).first():
        return RedirectResponse(url="/admin?error=exists", status_code=status.HTTP_303_SEE_OTHER)

    result = subprocess.run(
        ["python", "/opt/omnideck/scripts/provision_tenant.py", tenant_name],
        capture_output=True,
        text=True,
        check=True,
    )
    start = result.stdout.find("{")
    creds = json.loads(result.stdout[start:])

    login_password = generate_password()
    tenant = Tenant(
        name=tenant_name,
        postgres_user=creds["postgres"]["user"],
        postgres_password=creds["postgres"]["password"],
        mongo_user=creds["mongo"]["user"],
        mongo_password=creds["mongo"]["password"],
        redis_user=creds["redis"]["user"],
        redis_password=creds["redis"]["password"],
        minio_access_key=creds["minio"]["access_key"],
        minio_secret_key=creds["minio"]["secret_key"],
        login_password_hash=hash_password(login_password),
    )
    db.add(tenant)
    db.commit()

    # Pass login password to credentials page via session flash (one-time display)
    request.session["flash_login_password"] = login_password
    return RedirectResponse(
        url=f"/admin/tenants/{tenant_name}/credentials",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@app.get("/admin/tenants/{tenant_name}/credentials", response_class=HTMLResponse)
def view_credentials(request: Request, tenant_name: str, db: Session = Depends(get_db)):
    try:
        require_admin(request)
    except HTTPException:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    login_password = request.session.pop("flash_login_password", None)
    return templates.TemplateResponse(
        request=request,
        name="credentials.html",
        context={"tenant": tenant, "is_admin": True, "login_password": login_password},
    )


@app.post("/admin/tenants/{tenant_name}/delete")
def delete_tenant(request: Request, tenant_name: str, db: Session = Depends(get_db)):
    try:
        require_admin(request)
    except HTTPException:
        return RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)

    tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
    if tenant:
        subprocess.run(
            ["python", "/opt/omnideck/scripts/deprovision_tenant.py", tenant_name],
            capture_output=True,
            text=True,
            check=True,
        )
        db.delete(tenant)
        db.commit()
    return RedirectResponse(url="/admin", status_code=status.HTTP_303_SEE_OTHER)


@app.get("/admin/health")
def admin_health(request: Request, db: Session = Depends(get_db)):
    try:
        require_admin(request)
    except HTTPException:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    try:
        client = docker.DockerClient(base_url="unix://var/run/docker.sock")
        containers = client.containers.list()
        container_stats = []
        for c in containers:
            try:
                stats = c.stats(stream=False)
                container_stats.append({
                    "name": c.name,
                    "status": c.status,
                    "cpu_percent": calculate_cpu_percent(stats),
                    "memory_usage_mb": stats.get("memory_stats", {}).get("usage", 0) // (1024 * 1024),
                    "memory_limit_mb": stats.get("memory_stats", {}).get("limit", 1) // (1024 * 1024),
                })
            except Exception:
                container_stats.append({"name": c.name, "status": c.status})
    except Exception as e:
        container_stats = [{"error": str(e)}]

    return {
        "containers": container_stats,
        "tenant_count": db.query(Tenant).count(),
    }


def calculate_cpu_percent(stats):
    cpu_delta = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0) - \
                stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
    system_delta = stats.get("cpu_stats", {}).get("system_cpu_usage", 0) - \
                   stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
    if system_delta > 0 and cpu_delta > 0:
        return round((cpu_delta / system_delta) * 100, 2)
    return 0.0


# Intern auth
@app.get("/dashboard/login", response_class=HTMLResponse)
def intern_login_page(request: Request, error: Optional[str] = None):
    return templates.TemplateResponse(request=request, name="intern_login.html", context={"error": error})


@app.post("/dashboard/login")
def intern_login(request: Request, username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    if login_intern(request, db, username, password):
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(url="/dashboard/login?error=invalid", status_code=status.HTTP_303_SEE_OTHER)


@app.get("/dashboard/logout")
def intern_logout(request: Request):
    logout(request)
    return RedirectResponse(url="/dashboard/login", status_code=status.HTTP_303_SEE_OTHER)


# Intern dashboard
@app.get("/dashboard", response_class=HTMLResponse)
def intern_dashboard(request: Request, db: Session = Depends(get_db)):
    try:
        tenant = get_current_tenant(request, db)
    except HTTPException:
        return RedirectResponse(url="/dashboard/login", status_code=status.HTTP_303_SEE_OTHER)

    usage = get_tenant_usage(tenant)
    return templates.TemplateResponse(
        request=request,
        name="intern_dashboard.html",
        context={"tenant": tenant, "usage": usage},
    )


@app.get("/dashboard/usage")
def intern_usage(request: Request, db: Session = Depends(get_db)):
    try:
        tenant = get_current_tenant(request, db)
    except HTTPException:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return get_tenant_usage(tenant)


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

    # Postgres usage
    try:
        conn = psycopg.connect(
            host="postgres",
            port=5432,
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

    # Mongo usage
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

    # Redis usage
    try:
        r = redis.Redis(
            host="redis",
            port=6379,
            username=tenant.redis_user,
            password=tenant.redis_password,
            decode_responses=True,
        )
        usage["redis_key_count"] = len(list(r.scan_iter(match=f"{tenant.name}:*")))
        r.close()
    except Exception as e:
        usage["redis_error"] = str(e)

    # MinIO usage
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
