import os
import secrets
from datetime import datetime

from fastapi import FastAPI, Request, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import bcrypt

app = FastAPI(title="OmniDeck")
templates = Jinja2Templates(directory="templates")

# Database setup
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////data/omnideck.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)

class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    postgres_user = Column(String)
    postgres_password = Column(String)
    mongo_user = Column(String)
    mongo_password = Column(String)
    redis_user = Column(String)
    redis_password = Column(String)
    minio_access_key = Column(String)
    minio_secret_key = Column(String)

Base.metadata.create_all(bind=engine)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def generate_password(length: int = 32) -> str:
    return secrets.token_urlsafe(length)

# Startup seed admin
def seed_admin():
    db = SessionLocal()
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin")
    if not db.query(Admin).filter(Admin.username == username).first():
        db.add(Admin(username=username, password_hash=hash_password(password)))
        db.commit()
    db.close()

@app.on_event("startup")
def on_startup():
    seed_admin()

# Routes
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
