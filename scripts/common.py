"""Common helpers for OmniDeck tenant management scripts."""
import os
import re
import secrets
import sys


def validate_tenant_name(name: str) -> str:
    """Normalize and validate a tenant/project name."""
    name = name.lower().strip()
    if not name:
        raise ValueError("tenant name cannot be empty")
    if not re.match(r"^[a-z0-9_-]+$", name):
        raise ValueError("tenant name must be lowercase alphanumeric with '-' or '_'")
    if len(name) > 32:
        raise ValueError("tenant name must be 32 characters or fewer")
    if name.startswith(("postgres", "admin", "root", "default", "public")):
        raise ValueError(f"reserved tenant name: {name}")
    return name


def generate_password(length: int = 32) -> str:
    """Generate a URL-safe random password."""
    return secrets.token_urlsafe(length)


def postgres_db_name(tenant: str) -> str:
    return f"game_{tenant}"


def mongo_db_name(tenant: str) -> str:
    return f"game_{tenant}"


def redis_key_prefix(tenant: str) -> str:
    return f"{tenant}:"


def get_env(key: str, default: str = "") -> str:
    value = os.environ.get(key, default)
    if not value:
        print(f"ERROR: environment variable {key} is not set", file=sys.stderr)
        sys.exit(1)
    return value


def minio_internal_url() -> str:
    """Return the internal MinIO URL used by admin scripts.

    MinIO always runs with TLS in OmniDeck (./minio-certs are mounted into the
    container). Admin scripts skip certificate verification because the internal
    Docker hostname "minio" does not match the certificate's SAN.
    """
    return "https://minio:9000"
