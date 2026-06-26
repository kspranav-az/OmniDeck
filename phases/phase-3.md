# Phase 3: Backup & Rollback

## Goal
Implement automated backups, per-tenant restores, and whole-service volume snapshots.

## Tasks
- [ ] Create `scripts/backup_postgres.sh` for per-tenant `pg_dump` backups.
- [ ] Create `scripts/backup_mongo.sh` for per-tenant `mongodump` backups.
- [ ] Create `scripts/backup_redis.sh` for per-tenant prefix-based Redis dumps.
- [ ] Create `scripts/backup_cleanup.sh` to remove backups older than 7 days.
- [ ] Create `scripts/offsite_sync.sh` to sync backups to `gs://omnideck-backups-bucket/`.
- [ ] Create restore scripts:
  - `scripts/restore_postgres.sh`
  - `scripts/restore_mongo.sh`
  - `scripts/restore_redis.sh`
- [ ] Create whole-service snapshot/restore scripts:
  - `scripts/snapshot_volume.sh`
  - `scripts/restore_volume.sh`
- [ ] Implement backup verification: weekly restore to a temporary database.
- [ ] Integrate backup history display into the frontend.
- [ ] Configure host cron jobs for scheduled execution.

## Files Created / Modified
- `scripts/backup_postgres.sh`
- `scripts/backup_mongo.sh`
- `scripts/backup_redis.sh`
- `scripts/backup_cleanup.sh`
- `scripts/offsite_sync.sh`
- `scripts/restore_postgres.sh`
- `scripts/restore_mongo.sh`
- `scripts/restore_redis.sh`
- `scripts/snapshot_volume.sh`
- `scripts/restore_volume.sh`
- `frontend/main.py` (backup/rollback UI integration)
- Host crontab configuration

## Testing Checkpoints
- [ ] Run all backup scripts and verify backup files are created.
- [ ] Corrupt one tenant's data and restore only that tenant; confirm other tenants are unaffected.
- [ ] Restore a MinIO object to a previous version.
- [ ] Take a whole-service volume snapshot, corrupt the service, and restore from the snapshot.
- [ ] Verify cleanup script removes backups older than 7 days.
- [ ] Verify off-site sync uploads backups to GCS Coldline.
- [ ] Weekly automated test restore passes integrity check.

## Definition of Done
All tenant data can be recovered per-tenant or per-service, backups run automatically, and old backups are cleaned up.
