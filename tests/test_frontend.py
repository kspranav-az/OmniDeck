"""Frontend/API tests for OmniDeck admin and developer dashboards."""
import os
import time

import httpx
import pytest

BASE_URL = "http://omnideck-frontend:8000"
NGINX_URL = "http://omnideck-nginx:80"
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


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL, follow_redirects=False) as c:
        _wait_for_api(c)
        yield c


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_admin_login_failure(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_admin_tenant_lifecycle(client):
    # Login
    resp = client.post("/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert resp.status_code == 200
    assert resp.json()["user_type"] == "admin"

    # Create tenant with only postgres and redis enabled
    tenant_name = f"fronttest{int(time.time())}"
    start = time.time()
    resp = client.post(
        "/api/admin/tenants",
        data={"name": tenant_name, "services": "postgres,redis"},
    )
    elapsed = time.time() - start
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["name"] == tenant_name
    assert set(data["enabled_services"]) == {"postgres", "redis"}
    assert data["credentials"]["postgres"]["user"] is not None
    assert data["credentials"]["mongo"]["user"] is None
    assert data["login_password"]
    assert elapsed < 60, f"Tenant creation took {elapsed:.1f}s, expected < 60s"

    login_password = data["login_password"]

    # List tenants
    resp = client.get("/api/admin/tenants")
    assert resp.status_code == 200
    tenants = resp.json()
    assert any(t["name"] == tenant_name for t in tenants)

    # Get tenant services
    resp = client.get(f"/api/admin/tenants/{tenant_name}/services")
    assert resp.status_code == 200
    svcs = {s["key"]: s["enabled"] for s in resp.json()["services"]}
    assert svcs["postgres"] is True
    assert svcs["mongo"] is False

    # Update services
    resp = client.put(
        f"/api/admin/tenants/{tenant_name}/services",
        json={"enabled": ["postgres", "mongo", "redis", "minio"]},
    )
    assert resp.status_code == 200
    assert set(resp.json()["enabled"]) == {"postgres", "mongo", "redis", "minio"}

    # Admin health
    resp = client.get("/api/admin/health")
    assert resp.status_code == 200
    health = resp.json()
    assert "containers" in health
    assert health["tenant_count"] >= 1

    # Login as developer
    with httpx.Client(base_url=BASE_URL, follow_redirects=False) as dev_client:
        resp = dev_client.post(
            "/api/auth/login",
            json={"username": tenant_name, "password": login_password},
        )
        assert resp.status_code == 200
        assert resp.json()["user_type"] == "developer"

        # Developer me
        resp = dev_client.get("/api/developer/me")
        assert resp.status_code == 200
        me = resp.json()
        assert me["name"] == tenant_name
        assert set(me["enabled_services"]) == {"postgres", "mongo", "redis", "minio"}

        # Developer services
        resp = dev_client.get("/api/developer/services")
        assert resp.status_code == 200
        assert set(resp.json()["enabled"]) == {"postgres", "mongo", "redis", "minio"}

        # Developer usage
        resp = dev_client.get("/api/developer/usage")
        assert resp.status_code == 200
        usage = resp.json()
        assert "postgres_size_mb" in usage
        assert "mongo_size_mb" in usage

        # Test service connections
        for svc in ["postgres", "mongo", "redis", "minio"]:
            resp = dev_client.post(f"/api/developer/services/{svc}/test")
            assert resp.status_code == 200, f"{svc} test failed: {resp.text}"

    # Cleanup
    resp = client.delete(f"/api/admin/tenants/{tenant_name}")
    assert resp.status_code == 200


def test_spa_served(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "OmniDeck" in resp.text or "root" in resp.text.lower()


def test_no_intern_terminology(client):
    resp = client.get("/")
    html = resp.text.lower()
    assert "intern" not in html
    # Also verify API doesn't use "intern"
    resp = client.get("/api/health")
    assert "intern" not in resp.text.lower()
