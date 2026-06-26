"""Frontend tests for OmniDeck admin and intern dashboards."""
import os
import re
import time
from urllib.parse import urljoin

import httpx
import pytest

BASE_URL = "http://omnideck-frontend:8000"
ADMIN_USER = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "admin")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as c:
        yield c


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_admin_login_failure(client):
    resp = client.post("/admin/login", data={"username": "admin", "password": "wrong"})
    assert resp.status_code == 200
    assert "invalid" in resp.text.lower() or "/admin/login" in str(resp.url)


def test_admin_login_and_create_tenant(client):
    # Login as admin
    resp = client.post("/admin/login", data={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert resp.status_code == 200
    assert "/admin" in str(resp.url)

    # Create a tenant
    tenant_name = f"fronttest{int(time.time())}"
    start = time.time()
    resp = client.post("/admin/tenants", data={"name": tenant_name})
    elapsed = time.time() - start
    assert resp.status_code == 200
    assert f"/admin/tenants/{tenant_name}/credentials" in str(resp.url)
    assert elapsed < 60, f"Tenant creation took {elapsed:.1f}s, expected < 60s"

    # Capture intern login password from credentials page
    html = resp.text
    match = re.search(r"Intern Login Password.*?<pre>([A-Za-z0-9_-]+)</pre>", html, re.DOTALL)
    assert match, "Intern login password not found on credentials page"
    intern_password = match.group(1)

    # Verify tenant appears on dashboard
    resp = client.get("/admin")
    assert tenant_name in resp.text


def test_intern_dashboard(client):
    # Create tenant and get intern credentials via admin flow
    resp = client.post("/admin/login", data={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert resp.status_code == 200

    tenant_name = f"interntest{int(time.time())}"
    resp = client.post("/admin/tenants", data={"name": tenant_name})
    assert resp.status_code == 200
    html = resp.text
    match = re.search(r"Intern Login Password.*?<pre>([A-Za-z0-9_-]+)</pre>", html, re.DOTALL)
    assert match, "Intern login password not found on credentials page"
    intern_password = match.group(1)

    # Use a separate client session for intern
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as intern_client:
        resp = intern_client.post("/dashboard/login", data={"username": tenant_name, "password": intern_password})
        assert resp.status_code == 200
        assert "/dashboard" in str(resp.url)

        # Dashboard should show connection strings and usage
        resp = intern_client.get("/dashboard")
        assert resp.status_code == 200
        assert tenant_name in resp.text
        assert "Postgres" in resp.text or "postgres" in resp.text.lower()

        # Usage API should return metrics
        resp = intern_client.get("/dashboard/usage")
        assert resp.status_code == 200
        usage = resp.json()
        assert "postgres_size_mb" in usage
        assert "mongo_size_mb" in usage
        assert "redis_key_count" in usage
