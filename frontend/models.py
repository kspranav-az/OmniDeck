"""SQLAlchemy models for the OmniDeck management frontend."""
from datetime import datetime

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
    Table,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:////data/omnideck.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# Association table for enabled services per tenant.
tenant_services = Table(
    "tenant_services",
    Base.metadata,
    Column("tenant_id", Integer, ForeignKey("tenants.id"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id"), primary_key=True),
)


class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)


class Service(Base):
    __tablename__ = "services"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    label = Column(String, nullable=False)
    description = Column(Text)
    icon = Column(String)
    default_enabled = Column(Boolean, default=True)


class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    postgres_user = Column(String)
    postgres_password = Column(String)
    mongo_user = Column(String)
    mongo_password = Column(String)
    redis_user = Column(String)
    redis_password = Column(String)
    minio_access_key = Column(String)
    minio_secret_key = Column(String)
    login_password_hash = Column(String)

    enabled_services = relationship(
        "Service",
        secondary=tenant_services,
        backref="tenants",
    )

    def is_service_enabled(self, service_key: str) -> bool:
        return any(s.key == service_key for s in self.enabled_services)


class UsageSnapshot(Base):
    __tablename__ = "usage_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    postgres_size_mb = Column(Integer)
    postgres_table_count = Column(Integer)
    mongo_size_mb = Column(Integer)
    mongo_collection_count = Column(Integer)
    redis_key_count = Column(Integer)
    minio_size_bytes = Column(Integer)
    minio_object_count = Column(Integer)

    tenant = relationship("Tenant")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)


def seed_services(db):
    """Seed the canonical service definitions if not present."""
    services = [
        {"key": "postgres", "label": "PostgreSQL", "description": "Relational database", "icon": "database"},
        {"key": "mongo", "label": "MongoDB", "description": "Document database", "icon": "file-json"},
        {"key": "redis", "label": "Redis", "description": "In-memory cache & store", "icon": "zap"},
        {"key": "minio", "label": "MinIO", "description": "S3-compatible object storage", "icon": "box"},
    ]
    for svc in services:
        if not db.query(Service).filter(Service.key == svc["key"]).first():
            db.add(Service(**svc))
    db.commit()
