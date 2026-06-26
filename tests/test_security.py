"""Security hardening tests for OmniDeck."""
import json
import subprocess

import httpx
import pytest

BASE_URL = "http://omnideck-frontend:8000"
NGINX_URL = "http://omnideck-nginx:80"


def _docker_inspect(container: str):
    result = subprocess.run(
        ["docker", "inspect", container],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)[0]


def test_database_ports_not_publicly_exposed():
    """Database ports should bind to 127.0.0.1, not 0.0.0.0."""
    services = {
        "omnideck-postgres": [5432],
        "omnideck-mongo": [27017],
        "omnideck-redis": [6379],
        "omnideck-minio": [9000, 9001],
    }
    for container, ports in services.items():
        info = _docker_inspect(container)
        for port in ports:
            bindings = info["NetworkSettings"].get("Ports", {}).get(f"{port}/tcp", [])
            for binding in bindings:
                host_ip = binding.get("HostIp", "")
                assert host_ip == "127.0.0.1", (
                    f"{container} port {port} exposed on {host_ip}, expected 127.0.0.1"
                )


def test_exporter_ports_bind_localhost():
    """Prometheus exporter ports should bind to 127.0.0.1 only."""
    services = {
        "omnideck-postgres-exporter": [9187],
        "omnideck-mongo-exporter": [9216],
        "omnideck-redis-exporter": [9121],
    }
    for container, ports in services.items():
        info = _docker_inspect(container)
        for port in ports:
            bindings = info["NetworkSettings"].get("Ports", {}).get(f"{port}/tcp", [])
            for binding in bindings:
                host_ip = binding.get("HostIp", "")
                assert host_ip == "127.0.0.1", (
                    f"{container} port {port} exposed on {host_ip}, expected 127.0.0.1"
                )


def test_docker_socket_read_only():
    """Frontend container should mount Docker socket read-only."""
    info = _docker_inspect("omnideck-frontend")
    mounts = info.get("Mounts", [])
    docker_mounts = [m for m in mounts if m.get("Destination") == "/var/run/docker.sock"]
    assert docker_mounts, "Docker socket not mounted into frontend"
    assert docker_mounts[0].get("Mode") == "ro", "Docker socket should be read-only"


def test_nginx_rate_limit_admin_login():
    """Repeated POSTs to the admin login API via nginx should be rate limited."""
    # Ensure nginx has loaded the latest configuration.
    subprocess.run(
        ["docker", "exec", "omnideck-nginx", "nginx", "-s", "reload"],
        capture_output=True,
        check=True,
    )
    # Send 10 rapid invalid login requests
    responses = []
    for _ in range(10):
        try:
            resp = httpx.post(
                f"{NGINX_URL}/api/auth/login",
                json={"username": "admin", "password": "wrong"},
                follow_redirects=False,
                timeout=5,
            )
            responses.append(resp.status_code)
        except httpx.HTTPStatusError as e:
            responses.append(e.response.status_code)

    # Expect at least one 429 Too Many Requests from nginx
    assert 429 in responses, f"Expected 429 rate limit response, got {responses}"
