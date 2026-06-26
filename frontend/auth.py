"""Authentication helpers for admin and developer users."""
import os
import secrets
from datetime import datetime, timedelta

import bcrypt
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session

from models import Admin, Tenant

SESSION_TIMEOUT_MINUTES = 30


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def generate_password(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def seed_admin(db: Session):
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin")
    if not db.query(Admin).filter(Admin.username == username).first():
        db.add(Admin(username=username, password_hash=hash_password(password)))
        db.commit()


def login_admin(request: Request, db: Session, username: str, password: str) -> bool:
    admin = db.query(Admin).filter(Admin.username == username).first()
    if admin and verify_password(password, admin.password_hash):
        request.session["user_type"] = "admin"
        request.session["username"] = username
        request.session["expires"] = (datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)).isoformat()
        return True
    return False


def login_developer(request: Request, db: Session, username: str, password: str) -> bool:
    tenant = db.query(Tenant).filter(Tenant.name == username).first()
    if tenant and tenant.login_password_hash and verify_password(password, tenant.login_password_hash):
        request.session["user_type"] = "developer"
        request.session["username"] = username
        request.session["expires"] = (datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)).isoformat()
        return True
    return False


def logout(request: Request):
    request.session.clear()


def require_admin(request: Request):
    user_type = request.session.get("user_type")
    expires_str = request.session.get("expires")
    if user_type != "admin" or not expires_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    expires = datetime.fromisoformat(expires_str)
    if datetime.utcnow() > expires:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired")


def require_developer(request: Request):
    user_type = request.session.get("user_type")
    expires_str = request.session.get("expires")
    if user_type != "developer" or not expires_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    expires = datetime.fromisoformat(expires_str)
    if datetime.utcnow() > expires:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired")


def get_current_tenant(request: Request, db: Session) -> Tenant:
    require_developer(request)
    username = request.session.get("username")
    tenant = db.query(Tenant).filter(Tenant.name == username).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant
