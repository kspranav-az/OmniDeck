# OmniDeck

> Open-source, self-hosted multi-tenant backend infrastructure for SaaS MVPs.

OmniDeck provisions isolated **PostgreSQL**, **MongoDB**, **Redis**, and **MinIO** environments for each tenant on a single shared server. Manage tenants, services, health, and backups from one dashboard — without paying for separate managed services.

[![GitHub Repo stars](https://img.shields.io/github/stars/yourusername/omnideck?style=social)](https://github.com/yourusername/omnideck)
[![License](https://img.shields.io/github/license/yourusername/omnideck)](./LICENSE)
[![Docker](https://img.shields.io/badge/docker-compose-blue?logo=docker)](./docker-compose.yml)
[![Tests](https://img.shields.io/badge/tests-15%2F15-brightgreen)]()

---

## 🚀 Why OmniDeck?

Building a multi-tenant SaaS MVP usually means either:

1. **Paying for managed databases before you have revenue**, or
2. **Rolling your own tenant isolation** and praying you don't break it.

OmniDeck gives you a third option: **production-like tenant isolation on a single server, for free**.

- ✅ Self-hosted — your data stays on your infrastructure
- ✅ Open source — audit, fork, and extend
- ✅ Multi-tenant by default — isolated users, databases, and buckets per tenant
- ✅ One-command setup — Docker Compose up and running in minutes
- ✅ Admin dashboard + developer dashboard included
- ✅ Automated backups and volume snapshots

---

## ✨ Features

### For Admins

- **Tenant CRUD** — create, manage, and delete tenants in seconds
- **Per-tenant service toggles** — enable/disable Postgres, MongoDB, Redis, MinIO per tenant
- **Real-time health monitoring** — container stats + per-service health checks
- **Backup & restore UI** — per-service backups and Docker volume snapshots
- **Command palette** — `Ctrl/Cmd + K` to jump anywhere
- **Usage history** — time-series storage metrics per tenant

### For Developers

- **Service cards** — see only the services enabled for your tenant
- **Copy-paste connection strings**
- **Syntax-highlighted code snippets** — Python, Node.js, Go, curl
- **One-click connection tests**
- **Download credentials as `.env`**
- **Usage metrics & charts**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           OmniDeck Frontend             │
│   React + Vite + Tailwind CSS + FastAPI │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│              Nginx Proxy                │
│         (SPA + API routing)             │
└───────────────────┬─────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌──────────┐
│ Postgres│   │  MongoDB │   │  Redis   │
└─────────┘   └──────────┘   └──────────┘
    │               │               │
    └───────────────┼───────────────┘
                    ▼
              ┌──────────┐
              │  MinIO   │
              └──────────┘
```

Each tenant gets isolated:

- Postgres database + user
- MongoDB database + user
- Redis ACL user with key prefix
- MinIO bucket + IAM policy

---

## 🛠️ Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- (Optional) `make` for convenience scripts

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/omnideck.git
cd omnideck
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set strong, unique secrets
```

> ⚠️ **Never commit `.env` to Git.** It contains secrets and is already listed in `.gitignore`. Only `.env.example` (with placeholder values) should be tracked.

### 3. Generate a self-signed origin certificate (for HTTPS / Cloudflare)

OmniDeck's nginx terminates TLS from Cloudflare using a self-signed origin certificate. Cloudflare presents its own trusted certificate to visitors, so the origin certificate does not need to be publicly trusted.

```bash
./scripts/generate-self-signed-cert.sh
```

> Skip this step if you are only running locally over HTTP.

### 4. Start everything

```bash
docker compose up -d
```

### 5. Open the dashboard

```
http://localhost
```

Default admin credentials:

- Username: `admin`
- Password: the value you set in `.env` (`ADMIN_PASSWORD`)

---

## 📖 Usage

### Admin Dashboard

1. Log in as `admin`
2. Create a tenant and select which services to enable
3. Share the generated developer password with your team
4. Monitor health, run backups, and manage services from the dashboard

### Developer Dashboard

1. Log in with the tenant name and developer password
2. Copy connection strings or download credentials as `.env`
3. Use the provided code snippets in your app
4. Test connections with one click

---

## ⚙️ Configuration

All configuration is via environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Admin login password | `change-me-strong-admin-password` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Postgres admin credentials | — |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root credentials | — |
| `REDIS_PASSWORD` | Redis admin password | — |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root credentials | — |
| `OMNIDECK_BACKUP_ROOT` | Backup storage path | `/backups` |
| `SECRET_KEY` | Session secret | `dev-secret-change-me` |
| `OMNIDECK_PUBLIC_HOST` | Public web UI domain (can be Cloudflare-proxied) | — |
| `OMNIDECK_PUBLIC_DB_HOST` | Public endpoint for Postgres/MongoDB/Redis (do **not** proxy) | — |
| `OMNIDECK_PUBLIC_MINIO_HOST` | Public endpoint for MinIO S3 API (do **not** proxy) | — |

See `.env.example` for the full list.

---

## 🌐 Deploying with Cloudflare

If you expose OmniDeck on a public domain:

1. Point your domain's DNS A record to your server's public IP.
2. Enable the Cloudflare proxy (orange cloud) for the main dashboard record.
3. Allow Cloudflare IP ranges in your server's firewall for ports `80` and `443`.
4. For database and MinIO S3 access, Cloudflare **only proxies HTTP/HTTPS on ports 80/443**, not raw TCP ports. Create additional DNS records with the proxy **disabled** (grey cloud):

   | Record | Type | Value | Proxy status | Purpose |
   |--------|------|-------|--------------|---------|
   | `omnideck.hapkonic.com` | A | your server IP | **Proxied** (orange) | Web UI + MinIO console |
   | `db.omnideck.hapkonic.com` | A | your server IP | **DNS only** (grey) | Postgres, MongoDB, Redis |
   | `s3.omnideck.hapkonic.com` | A | your server IP | **DNS only** (grey) | MinIO S3 API |

5. Open the database ports (`5432`, `27017`, `6379`, `9000`) in your server's firewall **for your office/team IPs only** — do not expose them to the whole internet.
6. Set the environment variables in `.env`:

   ```env
   OMNIDECK_PUBLIC_HOST=omnideck.hapkonic.com
   OMNIDECK_PUBLIC_DB_HOST=db.omnideck.hapkonic.com
   OMNIDECK_PUBLIC_MINIO_HOST=s3.omnideck.hapkonic.com
   ```

7. Recreate the frontend container to pick up the new env vars:

   ```bash
   docker compose up -d --force-recreate frontend
   ```

8. Choose an origin certificate option:

### Option A — Self-signed certificate (quickest)

```bash
./scripts/generate-self-signed-cert.sh your-domain.com
docker compose up -d --force-recreate nginx
```

In Cloudflare, set **SSL/TLS → Overview** to **Full** (not "Full (Strict)").

### Option B — Let's Encrypt (recommended)

```bash
./scripts/setup-letsencrypt.sh your-domain.com admin@example.com
```

This requests a free certificate from Let's Encrypt and configures nginx to use it. In Cloudflare, set **SSL/TLS → Overview** to **Full (Strict)**.

Auto-renewal is handled by certbot. Add this cron job for seamless renewal:

```cron
0 3 * * * /usr/bin/certbot renew --quiet --pre-hook "cd /opt/OmniDeck && docker compose stop nginx" --post-hook "cd /opt/OmniDeck && ./scripts/deploy-letsencrypt.sh your-domain.com"
```

See [`docs/gcp-deployment.md`](./docs/gcp-deployment.md) for a complete GCP + Cloudflare walkthrough.

## 🧪 Running Tests

```bash
./scripts/test.sh pytest
```

This runs the full test suite inside the containerized environment, including:

- Tenant lifecycle
- Service isolation
- Backup/restore for Postgres, MongoDB, Redis, and volumes
- Security checks (port binding, rate limiting, docker socket permissions)

---

## 📸 Screenshots

> _Add screenshots here: admin dashboard, developer dashboard, tenant creation, backup UI._

---

## 🗺️ Roadmap

- [x] React + Vite + Tailwind SPA
- [x] Per-tenant service enablement
- [x] Admin health & backup UI
- [x] Developer connection guides
- [x] Real-time polling & command palette
- [ ] Horizontal scaling support
- [ ] GitOps-style tenant definitions
- [ ] Webhook notifications for backups
- [ ] REST API tokens for CI/CD

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a pull request

Please make sure tests pass before submitting:

```bash
./scripts/test.sh pytest
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

---

## 💬 Questions?

Open a [GitHub Discussion](https://github.com/yourusername/omnideck/discussions) or ping us on [Twitter/X](https://twitter.com/yourhandle).

Built with ❤️ for bootstrapped SaaS founders.
