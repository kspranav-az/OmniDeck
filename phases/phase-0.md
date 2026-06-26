# Phase 0: Foundation & Local Dev Setup

## Goal
Set up the repository structure and a working local Docker Compose environment that runs all core services.

## Tasks
- [ ] Create `docker-compose.yml` defining all services and their resource limits.
- [ ] Create `.env.example` with all required environment variables.
- [ ] Create `nginx.conf` skeleton for reverse proxy.
- [ ] Create `frontend/` directory with:
  - `Dockerfile`
  - `requirements.txt`
  - `main.py` (FastAPI skeleton)
  - `templates/` directory
- [ ] Define Docker network (`backend` bridge) and named volumes.
- [ ] Configure non-standard external ports:
  - PostgreSQL: `15432`
  - MongoDB: `37017`
  - Redis: `16379`
  - MinIO S3: `19000`
  - MinIO Console: `19001`
- [ ] Set restart policy to `unless-stopped` on all services.
- [ ] Add `HEALTHCHECK` instructions to service containers.

## Files Created / Modified
- `docker-compose.yml`
- `.env.example`
- `nginx.conf`
- `frontend/Dockerfile`
- `frontend/requirements.txt`
- `frontend/main.py`
- `frontend/templates/`

## Testing Checkpoints
- [ ] `docker compose up -d` starts all containers without errors.
- [ ] All containers report healthy via `docker ps`.
- [ ] Services are reachable on their internal ports from within the Docker network.
- [ ] Nginx responds on port 80 and routes to the frontend.

## Definition of Done
A developer can clone the repo, run `docker compose up`, and have all services running locally.
