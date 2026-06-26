"""Backup/restore API tests for OmniDeck admin dashboard."""
import json
import os
import time

import httpx
import pytest

BASE_URL = "http://omnideck-frontend:8000"
ADMIN_USER = "admin"
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "admin")


def _wait_for_api(client: httpx.Client, timeout: float = 30):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            resp = client.get("/api/health")
            if resp.status_code == 200:
                return
        except Exception as e:
            last_error = e
        time.sleep(0.5)
    raise RuntimeError(f"API not ready after {timeout}s: {last_error}")


@pytest.fixture
def admin_client():
    with httpx.Client(base_url=BASE_URL, follow_redirects=False) as c:
        _wait_for_api(c)
        resp = c.post("/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
        assert resp.status_code == 200
        yield c


def test_backup_api_create_and_list(admin_client):
    tenant_name = f"backapi{int(time.time())}"

    # Create tenant
    resp = admin_client.post("/api/admin/tenants", data={"name": tenant_name, "services": "postgres,redis"})
    assert resp.status_code == 200

    try:
        # Create Postgres backup via API
        resp = admin_client.post("/api/admin/backups", data={"service": "postgres", "tenant": tenant_name})
        assert resp.status_code == 200

        # Create Redis backup via API
        resp = admin_client.post("/api/admin/backups", data={"service": "redis", "tenant": tenant_name})
        assert resp.status_code == 200

        # List backups
        resp = admin_client.get(f"/api/admin/backups?tenant={tenant_name}")
        assert resp.status_code == 200
        data = resp.json()
        services = {b["service"] for b in data["backups"] if b["tenant"] == tenant_name}
        assert "postgres" in services
        assert "redis" in services
    finally:
        admin_client.delete(f"/api/admin/tenants/{tenant_name}")
