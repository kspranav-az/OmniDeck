# Phase 4: Security Hardening

## Goal
Lock down the platform before production use with network, host, and application-level security.

## Tasks
- [ ] Finalize `nginx.conf`:
  - Route `/` to frontend.
  - Route `/minio/` to MinIO console (admin-only, IP-restricted).
  - Rate limit `/admin` login endpoint.
- [ ] Configure GCP firewall rules:
  - Allow TCP 80, 443 from `0.0.0.0/0`.
  - Allow TCP 22 from admin IP only.
  - Deny all other inbound traffic.
- [ ] Ensure database ports (15432, 37017, 16379, 19000) are not exposed publicly.
- [ ] Install and configure `fail2ban` for SSH and HTTP brute-force protection.
- [ ] Harden SSH:
  - Disable password authentication.
  - Disable root login.
  - Use key-based auth only.
- [ ] Enable automatic security updates via `unattended-upgrades`.
- [ ] Enable HTTPS/TLS using Let's Encrypt (Phase 1.5).
- [ ] Verify all exporter containers bind to `127.0.0.1` only.
- [ ] Confirm Docker socket is mounted read-only into the frontend container.
- [ ] Document security runbook.

## Files Created / Modified
- `nginx.conf`
- `scripts/setup_security.sh`
- `scripts/setup_https.sh` (optional, for Let's Encrypt)
- Security hardening documentation

## Testing Checkpoints
- [ ] Port scan from an external host shows only 80, 443, and 22 (if from admin IP) as open.
- [ ] Simulated brute-force login triggers fail2ban ban.
- [ ] HTTPS certificate is valid and redirects from HTTP.
- [ ] Admin can access `/minio/` only from allowed IP ranges.
- [ ] Exporter endpoints are not reachable from the public internet.

## Definition of Done
The platform meets production security baseline: restricted network access, hardened host, encrypted traffic, and brute-force protection.
