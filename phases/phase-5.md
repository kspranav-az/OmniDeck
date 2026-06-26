# Phase 5: GCP Production Deployment

## Goal
Deploy OmniDeck v1 to a single GCP Compute Engine VM and validate it is ready for intern use.

## Tasks
- [ ] Provision GCP VM:
  - Machine type: `e2-standard-2` (2 vCPU, 8 GB RAM)
  - Boot disk: 200 GB Standard Persistent Disk
  - OS: Ubuntu 22.04 LTS
  - Static external IP
  - Network tags: `http-server`, `https-server`
- [ ] Install required software on VM host:
  - Docker
  - Docker Compose plugin
  - Nginx
  - fail2ban
  - unattended-upgrades
  - gsutil
- [ ] Create GCS Coldline bucket: `omnideck-backups-bucket`.
- [ ] Copy project files to `/opt/omnideck/` on the VM.
- [ ] Configure production `.env` with strong secrets.
- [ ] Start the stack with `docker compose up -d`.
- [ ] Configure host cron jobs for backup/cleanup/offsite sync.
- [ ] Create initial admin account.
- [ ] Configure DNS (optional): point `db.zetheta.com` to VM external IP.
- [ ] Apply firewall rules and security hardening from Phase 4.
- [ ] Run full acceptance test checklist.

## Files Created / Modified
- Deployment runbook
- `.env` (production, not committed)
- Host crontab
- GCP firewall rules

## Testing Checkpoints (PRD Acceptance Criteria)
- [ ] Admin can create a new tenant via web UI in < 60 seconds.
- [ ] Intern receives valid connection strings for all 4 services.
- [ ] Intern can connect to their Postgres, MongoDB, Redis, and MinIO using provided credentials.
- [ ] Intern A cannot access Intern B's database, keys, or bucket.
- [ ] Admin dashboard displays real-time CPU, RAM, and disk usage.
- [ ] All services restart automatically on VM reboot.
- [ ] Daily backup script runs without error and produces restorable files.
- [ ] Per-tenant rollback restores a single intern's Postgres data without affecting others.
- [ ] Whole-service volume snapshot restores a service container.
- [ ] Total GCP monthly bill is ≤ $80.
- [ ] `docker-compose.yml` and `.env` can be copied to a fresh Ubuntu VM and the platform starts successfully.

## Definition of Done
OmniDeck v1 is live on GCP, passes all acceptance criteria, and is ready for intern onboarding. Phases 6 and 7 remain deferred for future budget/scaling needs.
