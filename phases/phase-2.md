# Phase 2: Management Frontend

## Goal
Build the FastAPI web application that administrators and interns use to manage and view their environments.

## Tasks
- [ ] Define SQLite schema in `frontend/models.py`:
  - `admins` table: id, username, bcrypt_password_hash.
  - `tenants` table: name, created_at, credentials for all four services.
- [ ] Implement admin authentication (bcrypt, session-based, 30-minute timeout).
- [ ] Implement intern authentication (username = tenant name, auto-generated password).
- [ ] Build admin pages:
  - Login
  - Dashboard with system health (CPU, RAM, disk via Docker socket).
  - Tenant list with usage summary.
  - Create tenant wizard.
  - Delete tenant with name confirmation.
  - View/mask credentials.
  - Rotate credentials per service or all services.
  - Backup and rollback interface.
- [ ] Build intern pages:
  - Login
  - My Services (connection strings with copy buttons).
  - My Usage (DB size, collection count, key count, bucket size).
  - My Backups (read-only list).
  - Request restore (submits to admin approval queue).
- [ ] Implement API endpoints per PRD Section 10.3.
- [ ] Mount Docker socket read-only into the frontend container for live container stats.

## Files Created / Modified
- `frontend/main.py`
- `frontend/models.py`
- `frontend/auth.py`
- `frontend/templates/*.html`
- `frontend/static/` (if needed for CSS/JS)
- `frontend/requirements.txt`
- `frontend/Dockerfile`
- `docker-compose.yml` (Docker socket mount)

## Testing Checkpoints
- [ ] Admin can log in and create a tenant via the web UI in under 60 seconds.
- [ ] Intern can log in and view only their connection strings and usage.
- [ ] Intern cannot access admin endpoints or other tenants' data.
- [ ] System health page shows real-time CPU, RAM, disk, and container stats.
- [ ] Credential rotation updates service passwords and the SQLite record.

## Definition of Done
Admins and interns have functional, secure dashboards, and tenant lifecycle operations are fully UI-driven.
