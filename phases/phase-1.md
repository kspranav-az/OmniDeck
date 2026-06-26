# Phase 1: Core Multi-Tenant Services

## Goal
Implement tenant provisioning and deprovisioning across all four backend services with proper logical isolation.

## Tasks
- [ ] Build `scripts/provision_tenant.sh` that accepts a tenant name and:
  - Generates 32-character random passwords for Postgres, MongoDB, Redis, and MinIO.
  - Creates a Postgres database and user with restricted privileges.
  - Creates a MongoDB user scoped to the tenant database.
  - Creates a Redis ACL user restricted to a key prefix.
  - Creates a MinIO bucket with versioning enabled and a restricted IAM user/policy.
- [ ] Build `scripts/deprovision_tenant.sh` that reverses all provisioning steps.
- [ ] Store tenant metadata and credentials in the frontend SQLite database.
- [ ] Ensure service-level isolation:
  - Postgres tenant cannot list or connect to other databases.
  - MongoDB tenant cannot access other databases.
  - Redis tenant cannot access keys outside their prefix.
  - MinIO tenant cannot list or access other buckets.
- [ ] Update `docker-compose.yml` if needed for admin/seed credentials.

## Files Created / Modified
- `scripts/provision_tenant.sh`
- `scripts/deprovision_tenant.sh`
- `frontend/main.py` (tenant DB models and provisioning calls)
- `docker-compose.yml` (if service startup flags need adjustment)

## Testing Checkpoints
- [ ] Create tenant `alpha` and verify DB/user/bucket/ACL exist.
- [ ] Create tenant `beta` and verify it exists independently.
- [ ] Connect to each service using `alpha` credentials and confirm access to `alpha` resources only.
- [ ] Attempt cross-tenant access with `alpha` credentials into `beta` resources and confirm it is denied.
- [ ] Run deprovisioning and confirm all `alpha` resources are removed.

## Definition of Done
Any intern tenant can be created or destroyed with isolated access to all four services, and cannot access other tenants' data.
