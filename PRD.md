# Product Requirements Document (PRD)
## OmniDeck Centralized Multi-Tenant Developer Platform

**Version:** 1.0  
**Date:** 26 June 2026  
**Status:** Final Draft  
**Budget Constraint:** $50–$80 USD per month (GCP)  
**Target Environment:** Google Cloud Platform with zero vendor lock-in  
**Author:** Platform Architecture Team  

---

## Table of Contents
1. Executive Summary
2. Problem Statement
3. Goals & Objectives
4. Scope
5. Target Users
6. System Architecture
7. Technical Stack
8. Service Specifications
9. Multi-Tenancy & Isolation Model
10. Management Frontend Requirements
11. Observability & Monitoring
12. Security Requirements
13. Rollback & Disaster Recovery
14. Infrastructure Requirements
15. Budget & Cost Analysis
16. Scaling Roadmap
17. Portability & Vendor Lock-in Mitigation
18. Risks & Mitigations
19. Acceptance Criteria
20. Glossary
21. Appendices

---

## 1. Executive Summary

OmniDeck requires a centralized, shared infrastructure platform to provide backend services (PostgreSQL, MongoDB, Redis, MinIO object storage) to multiple interns working on independent game website projects. Instead of provisioning separate infrastructure per intern or per game, the platform shall provide logically isolated, multi-tenant access to shared service instances running on a single compute instance.

A web-based management frontend shall enable the administrator to provision, monitor, and decommission intern environments. The platform must be designed with a future observability tier (Prometheus, Grafana, Loki) in mind, but that tier shall not run on the primary instance due to budget constraints.

The entire stack must be 100% portable to any cloud provider or on-premise environment without architectural rework. The platform must support both per-tenant rollback (restoring a single intern's data) and whole-service rollback (restoring an entire service container).

---

## 2. Problem Statement

### Current Pain Points
- Each intern or game project currently requires individually provisioned databases and storage, leading to redundant resource consumption and high infrastructure costs.
- There is no centralized mechanism to view resource utilization, provision new tenants, or enforce security boundaries.
- There is no observability into which intern is consuming what resources.
- There is no automated backup or rollback mechanism for intern data.
- Future scaling to managed cloud services or Kubernetes must not require a full platform rebuild.

### Business Impact
- Uncontrolled infrastructure spend exceeding $50–80/month target.
- Operational overhead of managing N separate database instances.
- Risk of interns accidentally or maliciously accessing another project’s data.
- Inability to diagnose performance issues across shared resources.
- Data loss events with no recovery path.

---

## 3. Goals & Objectives

### Primary Goals
| ID | Goal | Success Criteria |
|----|------|------------------|
| G1 | Provide shared, cost-efficient database and storage services for ≤10 intern game projects | Total monthly GCP bill ≤ $80 |
| G2 | Enforce logical isolation between intern projects at the application/service layer | An intern cannot list, read, write, or delete another intern’s databases, collections, keys, or buckets |
| G3 | Enable single-click provisioning and de-provisioning of a complete intern environment (all 4 services) | Admin can create or destroy a full tenant in < 60 seconds via the web UI |
| G4 | Deliver a web-based management dashboard for both administrators and interns | Functional UI accessible over HTTPS on port 80/443 |
| G5 | Maintain zero vendor lock-in; full portability to AWS, Azure, Hetzner, or on-premise | All services deployable via Docker Compose on any Linux VM with < 2 hours migration effort |
| G6 | Provide per-tenant rollback capability for all four services | Admin can restore a single intern's data without affecting others |
| G7 | Provide whole-service rollback capability | Admin can restore an entire service container to a previous state |

### Secondary Goals
| ID | Goal | Success Criteria |
|----|------|------------------|
| G8 | Architect for a future observability tier without requiring primary VM reconfiguration | Adding a second VM for Prometheus/Grafana/Loki requires only firewall rules and a scrape config change |
| G9 | Expose metrics endpoints now so that future observability is plug-and-play | All services expose `/metrics` or equivalent endpoints compatible with Prometheus |
| G10 | Implement automated backup strategy with off-site redundancy | Daily backups with 7-day local retention and GCS Coldline sync |

---

## 4. Scope

### 4.1 In Scope
- Single GCP Compute Engine VM (`e2-standard-2` or equivalent) running Ubuntu 22.04 LTS.
- Containerized services: PostgreSQL 16, MongoDB 7, Redis 7 (with ACLs), MinIO (latest stable).
- Docker Compose as the sole orchestration layer (no Kubernetes in Phase 1).
- A custom-built management web application (FastAPI + Jinja2 + SQLite) providing:
  - Admin panel for tenant lifecycle management.
  - Intern self-service dashboard for connection credentials and basic usage metrics.
  - System health overview (CPU, RAM, disk) via Docker API.
  - Backup and rollback interface.
- Network security: Nginx reverse proxy, GCP firewall rules, non-standard database ports, strong credential generation.
- Resource limits via Docker to prevent a single service from consuming all VM memory.
- Automated credential generation and storage.
- Exporter containers (node-exporter, postgres-exporter, mongodb_exporter, redis_exporter) deployed but bound to localhost only, ready for future scraping.
- Backup strategy: automated per-tenant logical backups (pg_dump, mongodump, custom Redis prefix dump) and whole-service volume snapshots.
- MinIO bucket versioning for per-object rollback.
- Off-site backup sync to Google Cloud Storage Coldline.

### 4.2 Out of Scope
- Running Prometheus, Grafana, or Loki on the primary VM (VM1).
- High availability or multi-node clustering for any database.
- Automated CI/CD pipelines for intern game code.
- Billing/chargeback per intern (usage tracking is in scope; invoicing is not).
- Kubernetes deployment in Phase 1.
- Real-time log aggregation (Loki) in Phase 1.
- TLS/SSL termination inside Docker (handled by Nginx or GCP Load Balancer in future).
- Point-in-Time Recovery (PITR) via WAL archiving (budget constraint).

---

## 5. Target Users

### 5.1 Primary User: Administrator (Platform Owner)
- Creates and destroys intern tenants.
- Views system-wide health, resource utilization, and per-tenant resource consumption.
- Rotates credentials or resets intern access.
- Executes per-tenant and whole-service rollback operations.
- Has full SSH and Docker access to the VM.
- Configures backup schedules and monitors backup health.

### 5.2 Secondary User: Intern (Game Developer)
- Views their own connection strings and credentials.
- Views their own resource usage (DB size, key count, bucket size).
- Cannot see other interns’ data, credentials, or existence.
- Connects to databases via connection strings (IP + port + credentials); no SSH access.
- Optionally: views own backup history (read-only).

### 5.3 System User: Observability Tier (Future)
- Read-only access to metrics endpoints on VM1.
- No write access to databases or management frontend.

---

## 6. System Architecture

### 6.1 Phase 1: Data + Management (Current) — Single VM

```
┌─────────────────────────────────────────────────────────────┐
│  GCP Compute Engine VM1                                     │
│  Machine Type: e2-standard-2 (2 vCPU, 8 GB RAM)            │
│  Disk: 200 GB Standard Persistent Disk                      │
│  OS: Ubuntu 22.04 LTS                                       │
│  Public IP: Yes (for Nginx on 80/443)                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Docker Compose Network: backend (bridge)            │   │
│  │                                                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Postgres │  │ MongoDB  │  │  Redis   │          │   │
│  │  │  :5432   │  │  :27017  │  │  :6379   │          │   │
│  │  │ 1.2GB    │  │ 1.2GB    │  │ 512MB    │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐      │   │
│  │  │  MinIO   │  │ Frontend │  │   Nginx      │      │   │
│  │  │  :9000   │  │  :8000   │  │  :80, :443   │      │   │
│  │  │ 512MB    │  │ 512MB    │  │ 128MB        │      │   │
│  │  └──────────┘  └──────────┘  └──────────────┘      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ pg-exp   │  │ mongo-exp│  │redis-exp │          │   │
│  │  │:9187     │  │:9216     │  │:9121     │          │   │
│  │  │~30MB     │  │~30MB     │  │~20MB     │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  │  ┌──────────┐                                       │   │
│  │  │node-exp  │  (Optional, ~50MB)                   │   │
│  │  │:9100     │                                       │   │
│  │  └──────────┘                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Host-Level Cron Jobs:                                      │
│  - /opt/omnideck/backup_postgres.sh (every 6h)              │
│  - /opt/omnideck/backup_mongo.sh (every 6h)                 │
│  - /opt/omnideck/backup_redis.sh (every 6h)                 │
│  - /opt/omnideck/backup_cleanup.sh (daily)                  │
│  - /opt/omnideck/offsite_sync.sh (daily)                    │
│                                                             │
│  GCP Firewall:                                              │
│  - Allow TCP 80, 443 from 0.0.0.0/0 (Nginx)               │
│  - Allow TCP 22 from Admin IP only (SSH)                   │
│  - Deny all other inbound                                   │
│  - Database ports (15432, 37017, 16379, 19000) NOT exposed  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Phase 2: Observability (Future) — Second VM

When budget increases to ~$85/month, a second VM (`e2-medium`, 2 vCPU, 4 GB RAM) is provisioned in the same VPC.

```
┌─────────────────────┐         ┌─────────────────────────────┐
│  VM1: Data + Mgmt   │◄────────│  VM2: Observability        │
│  (e2-standard-2)   │  VPC    │  (e2-medium, ~$24)        │
│                     │  peering│                             │
│  Exporters :9100    │◄─scrape │  Prometheus (:9090)        │
│           :9187     │         │  Grafana (:3000)           │
│           :9216    │         │  Loki (:3100)              │
│           :9121    │  logs   │  Promtail (on VM1)         │
│                     │────────►│                             │
└─────────────────────┘         └─────────────────────────────┘
```

**Connection Method:** VM2 scrapes VM1 exporters via VM1's **internal IP address** (e.g., `10.128.0.x`). No public internet exposure of metric endpoints.

---

## 7. Technical Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Compute** | GCP Compute Engine (e2-standard-2) | Cheapest sustained-use general-purpose VM on GCP |
| **OS** | Ubuntu 22.04 LTS | LTS stability, Docker support |
| **Containerization** | Docker + Docker Compose | Portable, no K8s complexity, fits single-VM model |
| **Reverse Proxy** | Nginx (Alpine) | Lightweight, handles routing to frontend/MinIO console |
| **Admin/Intern UI** | Python 3.11 + FastAPI + Jinja2 | Low memory footprint (~512MB), no heavy JS framework |
| **UI Metadata DB** | SQLite 3 | Zero-config, file-based, no extra container needed |
| **PostgreSQL** | PostgreSQL 16 (Alpine) | Alpine reduces image size and RAM |
| **MongoDB** | MongoDB 7 Community | `--auth` enabled, WiredTiger cache capped |
| **Redis** | Redis 7 (Alpine) | Native ACL support for user isolation |
| **Object Storage** | MinIO | S3-compatible API, built-in Prometheus metrics endpoint, native object versioning |
| **Exporters** | node-exporter, postgres-exporter, mongodb_exporter, redis_exporter | Standard Prometheus ecosystem; future-proof |
| **Future Observability** | Prometheus + Grafana + Loki + Promtail | Industry standard; deployed on VM2 only |
| **Backup Storage** | Local disk + GCS Coldline | 7-day local retention, cheap long-term off-site |

---

## 8. Service Specifications

### 8.1 PostgreSQL
- **Image:** `postgres:16-alpine`
- **Internal Port:** `5432`
- **External Port:** `15432` (non-standard, not exposed to `0.0.0.0/0` by default)
- **Memory Limit:** 1.2 GB
- **Isolation Model:** One database per intern. One role per intern. Role has `CONNECT` and `ALL PRIVILEGES` only on their assigned database. Cannot create new databases or list other roles.
- **Admin Superuser:** `postgres` (password stored in environment variable, known only to admin)
- **Intern Access:** `postgresql://<username>:<password>@<VM_IP>:15432/<dbname>`
- **Persistence:** Named Docker volume `pgdata`
- **Rollback:** Per-tenant via `pg_dump` / `pg_restore`. Whole-service via volume snapshot.

### 8.2 MongoDB
- **Image:** `mongo:7`
- **Internal Port:** `27017`
- **External Port:** `37017`
- **Memory Limit:** 1.2 GB
- **WiredTiger Cache:** Capped at 1 GB via `--wiredTigerCacheSizeGB 1`
- **Isolation Model:** One database per intern. One user per intern scoped to their database with `readWrite` role. No unauthenticated access.
- **Auth:** `--auth` flag mandatory.
- **Intern Access:** `mongodb://<username>:<password>@<VM_IP>:37017/<dbname>`
- **Persistence:** Named Docker volume `mongodata`
- **Rollback:** Per-tenant via `mongodump` / `mongorestore`. Whole-service via volume snapshot.

### 8.3 Redis
- **Image:** `redis:7-alpine`
- **Internal Port:** `6379`
- **External Port:** `16379`
- **Memory Limit:** 512 MB
- **Isolation Model:** Redis 6+ ACLs. Each intern gets a username/password and a key prefix (e.g., `alpha:*`). ACL restricts the user to `~alpha:*` pattern and `+@all` commands on those keys.
- **Admin User:** `default` user for admin operations.
- **Intern Access:** `redis://<username>:<password>@<VM_IP>:16379`
- **Persistence:** Named Docker volume `redisdata`
- **Rollback:** Per-tenant via custom prefix-based dump/restore script. Whole-service via volume snapshot.

### 8.4 MinIO (S3-Compatible Object Storage)
- **Image:** `minio/minio`
- **Internal Ports:** `9000` (S3 API), `9001` (Web Console)
- **External Ports:** `19000` (S3 API), `19001` (Console)
- **Memory Limit:** 512 MB
- **Isolation Model:** One bucket per intern. One IAM user per intern. IAM policy grants full access only to their bucket.
- **Metrics:** `MINIO_PROMETHEUS_AUTH_TYPE=public` exposes `/minio/v2/metrics/cluster` for Prometheus scraping.
- **Versioning:** Enabled on all buckets at creation. Provides per-object rollback without custom scripts.
- **Intern Access:** `http://<VM_IP>:19000` (S3 API) + Access Key / Secret
- **Persistence:** Named Docker volume `miniodata`
- **Rollback:** Per-object via native versioning. Whole-bucket via bucket replication or volume snapshot.

### 8.5 Management Frontend
- **Build:** Custom Dockerfile from `./frontend` directory
- **Internal Port:** `8000`
- **External Port:** `80` / `443` (via Nginx)
- **Memory Limit:** 512 MB
- **Database:** SQLite file stored on volume `frontend_db`
- **Docker Socket:** Read-only mount `/var/run/docker.sock` to read live container statistics for the admin dashboard.
- **Features:**
  - Admin: Create/Delete tenant, list all tenants, view system health, rotate credentials, execute backup/rollback.
  - Intern: Login, view their connection strings, view their own resource usage (DB sizes, key counts, bucket sizes), view own backup history.

### 8.6 Nginx
- **Image:** `nginx:alpine`
- **Ports:** `80`, `443`
- **Memory Limit:** 128 MB
- **Routes:**
  - `/` → Frontend (`http://frontend:8000`)
  - `/minio/` → MinIO Console (`http://minio:9001`) (admin-only, IP-restricted)
  - Future: `/grafana/` → VM2 Grafana (via reverse proxy)

---

## 9. Multi-Tenancy & Isolation Model

### 9.1 Isolation Strategy
The platform uses **logical isolation** (soft multi-tenancy) rather than **physical isolation** (hard multi-tenancy). All interns share the same OS, Docker daemon, and service processes. Isolation is enforced by the database engines themselves and Docker memory limits.

### 9.2 Isolation Matrix

| Service | Isolation Mechanism | Intern Capability | Intern Restriction |
|---------|--------------------|--------------------|--------------------|
| **PostgreSQL** | Database-level + Role-level | Full CRUD within their DB | Cannot `CREATE DATABASE`, cannot connect to other DBs, cannot list other roles |
| **MongoDB** | Database-level + User-level | Full CRUD within their DB | Cannot `listDatabases` globally, cannot access other DBs |
| **Redis** | ACL (username + key prefix) | Full command set on `prefix:*` keys | Cannot access keys outside `prefix:*` |
| **MinIO** | Bucket-level + IAM policy | Full CRUD within their bucket | Cannot list other buckets, cannot access other buckets |

### 9.3 Resource Quotas
Since Docker Compose does not provide true per-user cgroup limits, resource control is enforced at the **service level** (per container) and **trust level** (interns are trusted employees/contractors). There is no per-intern CPU quota, but there is a **per-service memory limit** enforced by Docker.

### 9.4 Tenant Lifecycle

**Creation (Admin triggers via UI):**
1. Admin enters project name (e.g., `alpha`).
2. System generates 32-character random passwords for all 4 services.
3. System executes:
   - `CREATE DATABASE game_alpha; CREATE USER alpha WITH PASSWORD '...';`
   - `db.createUser()` in MongoDB for `game_alpha`
   - `ACL SETUSER alpha on >password ~alpha:* +@all` in Redis
   - `mc mb local/game-alpha` and `mc admin user add local alpha ...` in MinIO
4. System stores credentials in SQLite.
5. System displays connection strings to admin.

**Deletion (Admin triggers via UI):**
1. Admin clicks "Delete Tenant" and confirms by typing project name.
2. System executes:
   - `DROP DATABASE game_alpha; DROP USER alpha;`
   - `db.dropDatabase()` in MongoDB
   - `ACL DELUSER alpha` in Redis
   - `mc rm --recursive --force local/game-alpha` and `mc admin user remove local alpha` in MinIO
3. System deletes SQLite record.
4. Data is permanently destroyed.

---

## 10. Management Frontend Requirements

### 10.1 Admin Dashboard (`/admin`)
**Authentication:** Username/password (bcrypt hashed), session-based with 30-minute timeout.

**Functional Requirements:**

1. **Tenant Creation Wizard**
   - Input: Intern name / Game project name (lowercase alphanumeric, e.g., `alpha`, `game-rpg`)
   - Action: Auto-generates 32-character random passwords for all 4 services.
   - Side Effects: Creates DB, user, ACL, bucket. Stores credentials in SQLite. Returns connection strings.
   - Time: < 5 seconds.

2. **Tenant Deletion**
   - Confirmation required (type project name).
   - Action: Drops DB, removes user/ACL/bucket, deletes SQLite record.
   - Side Effects: Data is permanently destroyed. Optional: create final backup before deletion.

3. **Tenant Listing**
   - Table view: Name, created date, Postgres DB size, MongoDB size, Redis key count, MinIO bucket size.
   - Actions: View credentials (masked), rotate password, delete, view backup history.

4. **System Health**
   - Real-time: VM CPU %, RAM usage %, Disk usage %.
   - Per-service: Container status (Up/Down), container CPU %, container memory usage.
   - Source: Docker API (read-only socket mount).

5. **Credential Rotation**
   - Per-service or all-services.
   - Generates new password, updates service, updates SQLite, displays new connection string.

6. **Backup & Rollback Interface**
   - View all backups per tenant, per service, with timestamps.
   - Trigger per-tenant rollback (Postgres, MongoDB, Redis).
   - Trigger whole-service volume snapshot restore.
   - View backup job status and logs.

### 10.2 Intern Dashboard (`/dashboard`)
**Authentication:** Username (intern project name) + password.

**Functional Requirements:**

1. **My Services**
   - Display connection strings for all 4 services (host, port, username, password toggle).
   - Display quick-copy buttons.

2. **My Usage**
   - PostgreSQL: Database size (MB), table count.
   - MongoDB: Database size, collection count.
   - Redis: Key count, memory used by their keys.
   - MinIO: Bucket size, object count.

3. **My Backups (Read-Only)**
   - List available backups with timestamps.
   - Request restore (submits to admin queue for approval).

4. **Status Indicators**
   - Green/Red for each service (based on Docker container health).

### 10.3 API Endpoints (FastAPI)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/tenants` | Admin | Create tenant |
| DELETE | `/admin/tenants/{name}` | Admin | Delete tenant |
| GET | `/admin/tenants` | Admin | List all tenants |
| GET | `/admin/health` | Admin | System health |
| POST | `/admin/tenants/{name}/rotate` | Admin | Rotate credentials |
| GET | `/admin/backups` | Admin | List all backups |
| POST | `/admin/backups/{tenant}/{service}/restore` | Admin | Execute per-tenant rollback |
| POST | `/admin/snapshots/{service}/restore` | Admin | Execute whole-service rollback |
| GET | `/dashboard` | Intern | View own services |
| GET | `/dashboard/usage` | Intern | View own usage |
| GET | `/dashboard/backups` | Intern | View own backups |
| POST | `/dashboard/backups/{service}/request-restore` | Intern | Request restore (admin approval) |

---

## 11. Observability & Monitoring

### 11.1 Phase 1: Current (No Prometheus/Grafana/Loki on VM1)
**Goal:** Basic visibility without consuming > 256 MB RAM.

**Implementation:**
- **Frontend Docker Stats:** The management frontend reads `/var/run/docker.sock` to display live CPU and memory for each container.
- **Service Metrics:** Exporters are deployed but bind to `127.0.0.1` only. They are **not scraped** yet. They consume ~150 MB RAM total.
- **Health Checks:** Docker `HEALTHCHECK` instructions on each service container.
- **Alerts:** None in Phase 1 (budget constraint). Admin monitors via dashboard.

### 11.2 Phase 2: Future Observability VM (VM2)
**Trigger:** When monthly budget allows +$24 for `e2-medium` VM.

**Components on VM2:**
- **Prometheus:** Scrapes VM1 exporters every 30s. Retention: 15 days.
- **Grafana:** Dashboards for VM and per-service metrics. Admin access only.
- **Loki:** Log aggregation. Receives logs from VM1 via Promtail.
- **Promtail (on VM1):** Ships Docker container logs to VM2 Loki.

**Scrape Configuration:**
- VM2 Prometheus reaches VM1 internal IP on ports `9100`, `9187`, `9216`, `9121`, `9000`.
- GCP Firewall rule: Allow ingress from VM2 internal IP to VM1 on exporter ports.

**Frontend Integration:**
- Admin dashboard embeds Grafana iframe or queries Prometheus HTTP API for historical charts.
- Intern dashboard continues to show real-time Docker stats.

---

## 12. Security Requirements

### 12.1 Network Security
1. **GCP Firewall Rules:**
   - Ingress Allow: TCP `22` from Admin IP only.
   - Ingress Allow: TCP `80`, `443` from `0.0.0.0/0` (Nginx).
   - Ingress Deny: All other ports.
   - **Database ports (15432, 37017, 16379, 19000) are NOT exposed to the internet.**

2. **Database Access Methods:**
   - **Primary:** SSH tunnel. Intern runs `ssh -L 15432:localhost:5432 admin@<VM_IP>`.
   - **Secondary (optional):** GCP firewall whitelisting of intern static IPs.

3. **Nginx:**
   - No public access to MinIO console except via `/minio/` path (admin only, IP-restricted in Nginx config if desired).
   - Rate limiting on `/admin` login endpoint.

### 12.2 Authentication & Authorization
1. **Admin UI:** Strong bcrypt password. Session timeout after 30 minutes.
2. **Intern UI:** Username = project name. Password auto-generated, 32 characters.
3. **Service Credentials:** Each service has unique, random passwords. No shared passwords across services or interns.
4. **No SSH for Interns:** Interns never receive OS-level access.

### 12.3 Data Protection
1. **Encryption at Rest:** GCP Standard Persistent Disk is encrypted by default (GCP-managed keys).
2. **Encryption in Transit:** PostgreSQL and MongoDB support TLS. Redis supports TLS. MinIO supports TLS. **Requirement:** Enable TLS on all services before production intern access.
3. **Backups:** Daily automated backups (see Section 13).

### 12.4 Hardening
1. **Non-Standard Ports:** Map external-facing DB ports to non-standard ranges:
   - PostgreSQL: `15432`
   - MongoDB: `37017`
   - Redis: `16379`
   - MinIO S3: `19000`
   - MinIO Console: `19001`
2. **fail2ban:** Installed on VM1 host. Bans IPs with repeated failed SSH or HTTP login attempts.
3. **Automatic Security Updates:** `unattended-upgrades` enabled for security patches on Ubuntu.
4. **Docker Socket:** Frontend container mounts Docker socket read-only. If compromised, attacker can read container info but cannot easily escalate.
5. **No Root Login:** SSH keys only. Password authentication disabled.

---

## 13. Rollback & Disaster Recovery

### 13.1 Rollback Types

| Type | Definition | Use Case |
|------|-----------|----------|
| **Per-Tenant Rollback** | Restore only one intern's data to a previous point. Other interns are untouched. | Intern accidentally deletes their game leaderboard table. |
| **Whole-Service Rollback** | Restore the entire service container and all its data to a previous point. | Bad migration script corrupts entire Postgres instance. Docker image upgrade breaks compatibility. |

### 13.2 Per-Tenant Rollback (Primary Strategy)

Since all interns share one Postgres, one MongoDB, etc., logical backups (native dump/restore tools) scoped per tenant are required.

#### PostgreSQL
**Backup:**
```bash
pg_dump -h localhost -U postgres -Fc -f /backups/postgres/alpha_20260626_1400.dump game_alpha
```

**Rollback:**
```bash
# 1. Rename current database as safety
psql -U postgres -c "ALTER DATABASE game_alpha RENAME TO game_alpha_broken_20260626_1400;"

# 2. Recreate empty database
psql -U postgres -c "CREATE DATABASE game_alpha OWNER alpha;"

# 3. Restore from backup
pg_restore -h localhost -U postgres -d game_alpha /backups/postgres/alpha_20260626_1400.dump
```

#### MongoDB
**Backup:**
```bash
mongodump --host localhost --username alpha --password xxx --db game_alpha --out /backups/mongo/alpha_20260626_1400/
```

**Rollback:**
```bash
# 1. Drop corrupted database
mongosh -u admin -p xxx --eval "db.getSiblingDB('game_alpha').dropDatabase()"

# 2. Restore
mongorestore --host localhost --username alpha --password xxx --db game_alpha /backups/mongo/alpha_20260626_1400/game_alpha/
```

#### Redis
Redis has no native per-user restore. Custom prefix-based backup script required.

**Backup Script:**
```python
import redis
r = redis.Redis(host='localhost', port=6379, username='admin', password='xxx')
prefix = "alpha:"
keys = r.scan_iter(match=f"{prefix}*")

with open(f'/backups/redis/alpha_20260626_1400.rdb', 'wb') as f:
    for key in keys:
        val = r.dump(key)
        ttl = r.pttl(key)
        f.write(f"{key.decode()}|{ttl}|".encode())
        f.write(val)
        f.write(b"\n---KEY---\n")
```

**Rollback Script:**
```python
# 1. Delete all current keys for this tenant
for key in r.scan_iter(match="alpha:*"):
    r.delete(key)

# 2. Restore from backup file
for record in backup_data:
    key, ttl, val = parse(record)
    r.restore(key, ttl if ttl > 0 else 0, val, replace=True)
```

#### MinIO
MinIO supports native S3-compatible object versioning. This is the cleanest rollback mechanism.

**Enable on bucket creation:**
```bash
mc version enable local/game-alpha
```

**Rollback (per-object):**
```bash
# List versions
mc ls --versions local/game-alpha/savegame.json

# Restore specific version
mc cp --version-id=xxxxx local/game-alpha/savegame.json local/game-alpha/savegame.json
```

### 13.3 Whole-Service Rollback (Nuclear Option)

Use only when the entire service container is corrupted.

**Method: Docker Volume Snapshot**
```bash
# Before risky operation, snapshot
docker run --rm \
  -v omnideck_pgdata:/source \
  -v /backups/volumes:/backup \
  alpine tar czvf /backup/postgres_volume_20260626.tar.gz -C /source .

# Rollback
docker compose stop postgres
docker volume rm omnideck_pgdata
docker volume create omnideck_pgdata
docker run --rm \
  -v omnideck_pgdata:/target \
  -v /backups/volumes:/backup \
  alpine sh -c "cd /target && tar xzvf /backup/postgres_volume_20260626.tar.gz"
docker compose start postgres
```

**Warning:** Restores all tenants to that point. Any data written by other tenants since the snapshot is lost.

### 13.4 Backup Automation

**Cron Schedule (`/etc/crontab`):**
```bash
0 */6 * * * root /opt/omnideck/backup_postgres.sh
0 */6 * * * root /opt/omnideck/backup_mongo.sh
0 */6 * * * root /opt/omnideck/backup_redis.sh
0 2 * * * root find /backups/postgres -mtime +7 -delete
0 2 * * * root find /backups/mongo -mtime +7 -delete
0 2 * * * root find /backups/redis -mtime +7 -delete
```

**Off-Site Sync:**
```bash
gsutil -m rsync -r /backups/postgres gs://omnideck-backups-bucket/postgres/
gsutil -m rsync -r /backups/mongo gs://omnideck-backups-bucket/mongo/
gsutil -m rsync -r /backups/redis gs://omnideck-backups-bucket/redis/
```

### 13.5 Rollback Safety Guardrails
1. **Pre-rename:** Before any restore, the current database is renamed to `game_alpha_broken_YYYYMMDD_HHMMSS`. If restore fails, admin can manually re-rename it back.
2. **Intern Lockout:** During restore, the tenant's credentials are temporarily disabled (ACL revoked / role revoked) to prevent writes mid-restore.
3. **One-at-a-Time:** Only one restore operation per service at a time.
4. **Backup Verification:** Weekly automated test restore to a temporary database to verify backup integrity.

---

## 14. Infrastructure Requirements

### 14.1 VM1 Specification
| Attribute | Requirement |
|-----------|-------------|
| **Provider** | GCP Compute Engine |
| **Machine Type** | `e2-standard-2` (2 vCPU, 8 GB RAM) |
| **Boot Disk** | 200 GB Standard Persistent Disk |
| **OS** | Ubuntu 22.04 LTS |
| **Region** | Any (e.g., `us-central1`) |
| **External IP** | Static (recommended for DNS and firewall rules) |
| **Network Tags** | `http-server`, `https-server` |

### 14.2 Software Installation (VM1 Host)
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx fail2ban unattended-upgrades gsutil
```

### 14.3 Directory Structure
```
/opt/omnideck/
├── docker-compose.yml
├── .env
├── nginx.conf
├── frontend/
│   ├── Dockerfile
│   ├── main.py
│   ├── templates/
│   └── requirements.txt
├── scripts/
│   ├── backup_postgres.sh
│   ├── backup_mongo.sh
│   ├── backup_redis.sh
│   ├── backup_cleanup.sh
│   └── offsite_sync.sh
└── backups/
    ├── postgres/
    ├── mongo/
    ├── redis/
    └── volumes/
```

### 14.4 DNS (Optional but Recommended)
- Point a subdomain (e.g., `db.zetheta.com`) to VM1 external IP.
- Future: Use Cloudflare DNS (free) for DDoS protection and TLS.

---

## 15. Budget & Cost Analysis

### 15.1 Phase 1 Costs (Current)
| Item | Spec | Monthly Cost (us-central1) |
|------|------|---------------------------|
| Compute | e2-standard-2 | ~$48.50 |
| Boot Disk | 200 GB Standard PD | ~$8.00 |
| Network Egress | ~50 GB | ~$4.50 |
| GCS Coldline (Backups) | ~10 GB | ~$0.04 |
| **Total** | | **~$61.04** |

### 15.2 Phase 2 Costs (Future)
| Item | Spec | Monthly Cost |
|------|------|-------------|
| VM1 (existing) | e2-standard-2 | ~$61.00 |
| VM2 (new) | e2-medium (2 vCPU, 4 GB) | ~$24.00 |
| Inter-VM Egress | Internal VPC | $0.00 |
| **Total** | | **~$85.00** |

*Note: If Phase 2 exceeds budget, VM2 can be `e2-small` (2 vCPU, 2 GB) at ~$12/month, but Prometheus+Grafana will require careful memory tuning.*

### 15.3 Cost Optimization
- **Sustained Use Discounts:** E2 instances do not qualify. Consider `n2-standard-2` with 1-year committed use if the platform runs long-term (drops price ~37%).
- **Disk:** If 200 GB is underutilized after 3 months, downsize to 100 GB (~$4/month savings).
- **Alternative Providers:** Hetzner CPX21 (4 vCPU, 8 GB) costs ~$10/month. Full Docker Compose portability enables this migration instantly.

---

## 16. Scaling Roadmap

| Phase | Budget | Infrastructure | Changes |
|-------|--------|----------------|---------|
| **Phase 1** | $60 | VM1 only | All services + frontend + exporters on single VM. Logical isolation. Automated backups. |
| **Phase 1.5** | $60 | VM1 only | Add HTTPS (Let's Encrypt), non-standard DB ports, fail2ban, backup verification. |
| **Phase 2** | $85 | VM1 + VM2 | Add observability VM (Prometheus, Grafana, Loki). VM1 stays unchanged except Promtail addition. |
| **Phase 3** | $150 | VM1 (DB) + VM2 (Obs) + VM3 (Apps) | Move intern game deployments to a third VM. VM1 becomes dedicated DB host. |
| **Phase 4** | $300+ | GKE or Managed Services | Migrate to GKE (portable K8s YAMLs) or Cloud SQL + Memorystore + Cloud Storage. |

---

## 17. Portability & Vendor Lock-in Mitigation

### 17.1 Design Principles
1. **Docker Compose Only:** No GCP-specific APIs in application code.
2. **Standard Images:** All images are from Docker Hub (official or verified publishers). No GCP Marketplace images.
3. **No Managed Services in Phase 1:** No Cloud SQL, Firestore, Memorystore, or Cloud Storage. All are self-hosted.
4. **SQLite over Cloud SQL:** Frontend metadata is file-based, not requiring a cloud database.
5. **Environment Variables:** All secrets and config are env vars, not hardcoded. Portable via `.env` file.

### 17.2 Migration Path to Another Provider
1. **Snapshot:** `docker-compose down` on VM1.
2. **Transfer:** `rsync` or `scp` the `docker-compose.yml`, `.env`, and named volumes to new VM.
3. **Restore:** `docker-compose up` on new VM.
4. **Update:** Change DNS A-record to new IP.
5. **Time:** < 2 hours downtime.

### 17.3 Migration Path to Kubernetes
1. **Convert Compose to K8s Manifests:** Use `kompose` or manual translation.
2. **Add K8s Resources:** Namespaces per intern, Secrets for credentials, PersistentVolumeClaims for data.
3. **Observability:** Move VM2 stack into K8s as a separate namespace.
4. **Database Migration:** Use native backup/restore (`pg_dump`, `mongodump`) to move data into K8s PersistentVolumes.

---

## 18. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **OOM Kill** | High | Service restart, data loss | Docker memory limits; MongoDB WiredTiger cache capped at 1GB; swap space enabled; monitor via frontend |
| **Noisy Neighbor** | Medium | One intern’s heavy query slows all | Resource limits; educate interns; if recurring, move heavy user to dedicated VM (Phase 3) |
| **Data Breach (logical isolation failure)** | Low | Intern accesses another’s data | Strong service-level auth; non-standard ports; no public DB exposure; audit logs |
| **Disk Full** | Medium | All services crash | 200 GB disk; daily cron cleanup of old backups; disk usage alert in frontend |
| **VM Failure** | Low | Total platform outage | Daily backups to GCS Coldline; snapshot VM disk weekly; documented restore procedure |
| **Budget Overrun** | Low | Financial constraint | Cost alerts in GCP Billing; resource tracking in frontend; ready to migrate to Hetzner if needed |
| **Security Scanning / Brute Force** | High | Log noise, potential breach | Non-standard ports; fail2ban; strong passwords; no root login; SSH keys only |
| **Backup Corruption** | Low | Unrecoverable data loss | Weekly automated test restores; GCS Coldline redundancy; keep last 7 days local |

---

## 19. Acceptance Criteria

The platform is considered **Ready for Intern Use** when:

1. [ ] Admin can create a new tenant via web UI in < 60 seconds.
2. [ ] Intern receives valid connection strings for all 4 services.
3. [ ] Intern can connect to their Postgres DB, MongoDB, Redis, and MinIO bucket using provided credentials.
4. [ ] Intern A cannot access Intern B’s database, keys, or bucket (verified by penetration test).
5. [ ] Admin dashboard displays real-time CPU, RAM, and disk usage.
6. [ ] All services restart automatically on VM reboot (`restart: unless-stopped`).
7. [ ] Daily backup script runs without error and produces restorable files.
8. [ ] Per-tenant rollback successfully restores a single intern's Postgres data without affecting others.
9. [ ] Whole-service volume snapshot successfully restores a service container.
10. [ ] Total GCP monthly bill is ≤ $80.
11. [ ] `docker-compose.yml` and `.env` can be copied to a fresh Ubuntu VM and the platform starts successfully.

---

## 20. Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | One intern + one game project. Logically isolated slice of the platform. |
| **VM1** | Primary virtual machine hosting databases, storage, and management frontend. |
| **VM2** | Future observability virtual machine (Prometheus, Grafana, Loki). |
| **Logical Isolation** | Separation enforced by application-level permissions (DB users, ACLs) rather than physical infrastructure. |
| **Exporter** | A lightweight sidecar container that exposes service metrics in Prometheus format. |
| **Promtail** | Log shipping agent that sends Docker logs to Loki. |
| **WiredTiger** | MongoDB’s default storage engine. |
| **MinIO** | High-performance, S3-compatible object storage server. |
| **Per-Tenant Rollback** | Restoring only one intern's data to a previous point without affecting others. |
| **Whole-Service Rollback** | Restoring an entire service container and all its data to a previous state. |

---

## 21. Appendices

### Appendix A: Docker Compose Full Reference File
*(To be generated as separate artifact)*

### Appendix B: FastAPI Frontend API Specification (OpenAPI)
*(To be generated as separate artifact)*

### Appendix C: Nginx Configuration Reference
*(To be generated as separate artifact)*

### Appendix D: Backup and Restore Procedures
*(To be generated as separate artifact)*

### Appendix E: Prometheus Scrape Configuration for VM2
*(To be generated as separate artifact)*

### Appendix F: Security Hardening Checklist
*(To be generated as separate artifact)*

### Appendix G: Rollback Runbooks
*(To be generated as separate artifact)*
- G1: PostgreSQL Per-Tenant Rollback
- G2: MongoDB Per-Tenant Rollback
- G3: Redis Per-Tenant Rollback
- G4: MinIO Per-Object Rollback
- G5: Whole-Service Volume Snapshot Rollback

---

**End of PRD**
