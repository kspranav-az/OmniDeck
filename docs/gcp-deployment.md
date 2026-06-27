# OmniDeck GCP Deployment Guide

## Option A: Single VM with Docker Compose

This guide walks through deploying OmniDeck on a single Google Compute Engine VM using Docker Compose, with Cloudflare handling TLS termination. This is the fastest and most cost-effective option for early-stage SaaS teams, demos, and MVPs.

**Estimated cost:** ~$60–80/month (us-central1, e2-standard-2, 50 GB disk, GCS backup bucket)

---

## What You Get

- One VM running the full OmniDeck stack (frontend, Postgres, MongoDB, Redis, MinIO, nginx)
- Persistent disk for databases and backups
- Cloudflare-managed HTTPS in front of HTTP origin
- Secrets stored in Google Secret Manager
- Offsite backups synced to Google Cloud Storage
- Basic monitoring and alerting

---

## Architecture

```
Internet
   │
   ▼
Cloudflare (HTTPS + DDoS + CDN)
   │
   ▼
GCP Static External IP
   │
   ▼
Compute Engine VM (e2-standard-2)
   │
   ├── nginx (port 80/443)
   ├── FastAPI + React SPA
   ├── PostgreSQL
   ├── MongoDB
   ├── Redis
   └── MinIO
```

---

## Prerequisites

- A Google Cloud account with billing enabled
- A domain name managed through Cloudflare
- A GitHub repository containing OmniDeck
- Access to the [Google Cloud Console](https://console.cloud.google.com)
- A production-ready `.env` file (no default passwords)
- An SSH client (terminal, PuTTY, or browser-based SSH from GCP Console)

---

## Step 1: Prepare Your GCP Project

### 1.1 Create or select a project

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. At the top, click the project selector and choose **New Project**.
3. Enter a project name (e.g., `omnideck-prod`) and click **Create**.
4. Make sure billing is enabled for the project.

### 1.2 Enable required APIs

1. In the console, go to **APIs & Services → Library**.
2. Search for and enable each of the following:
   - **Compute Engine API**
   - **Secret Manager API**
   - **Cloud Monitoring API**
   - **Cloud Logging API**
   - **Cloud Resource Manager API**

### 1.3 Create a deployment service account

1. Go to **IAM & Admin → Service Accounts**.
2. Click **Create Service Account**.
3. Name it `omnideck-deploy` and click **Create and Continue**.
4. Grant the following roles:
   - **Compute Instance Admin (v1)**
   - **Secret Manager Secret Accessor**
   - **Storage Object Admin**
5. Click **Done**.
6. Open the service account, go to the **Keys** tab, and click **Add Key → Create New Key**.
7. Choose **JSON** and download the key file. Save it as `omnideck-deploy-key.json` for later use.

---

## Step 2: Upload Secrets to Secret Manager

1. Go to **Secret Manager** in the console.
2. Click **Create Secret**.
3. Name it `omnideck-env`.
4. Under **Secret value**, upload your `.env` file or paste its contents.
5. Click **Create Secret**.

> **Important:** Your `.env` file must use strong, unique passwords. Do not commit it to GitHub.

---

## Step 3: Create a Backup Bucket

1. Go to **Cloud Storage → Buckets**.
2. Click **Create**.
3. Name the bucket `omnideck-backups-<your-project-id>`.
4. Choose **Region** and select `us-central1` (or your preferred region).
5. Set **Access control** to **Uniform**.
6. Choose **Standard** storage class.
7. Click **Create**.

---

## Step 4: Reserve a Static IP

1. Go to **VPC Network → IP Addresses**.
2. Click **Reserve External Static Address**.
3. Name it `omnideck-ip`.
4. Set **Network Service Tier** to **Standard**.
5. Set **IP version** to **IPv4**.
6. Click **Reserve**.
7. Note the IP address — you will need it for Cloudflare DNS.

---

## Step 5: Create the VM

1. Go to **Compute Engine → VM Instances**.
2. Click **Create Instance**.
3. Configure the VM:
   - **Name:** `omnideck-prod`
   - **Region:** `us-central1`
   - **Zone:** `us-central1-a`
   - **Machine configuration:** `e2-standard-2`
   - **Boot disk:**
     - **Operating system:** Debian
     - **Version:** Debian 12
     - **Boot disk type:** Balanced persistent disk
     - **Size:** 50 GB
   - **External IP:** Select the static IP `omnideck-ip` you reserved earlier.
   - **Network tags:** `http-server`, `https-server`
4. Expand **Advanced options → Management**.
5. Under **Automation → Startup script**, paste:

   ```bash
   #!/bin/bash
   set -e
   apt-get update
   apt-get install -y docker.io docker-compose-plugin git jq
   systemctl enable docker
   systemctl start docker
   ```

6. Click **Create**.

### Attach the service account to the VM

1. After the VM is created, click its name to open details.
2. Click **Edit**.
3. Under **Service account**, select `omnideck-deploy`.
4. Under **Access scopes**, select **Allow full access to all Cloud APIs**.
5. Click **Save**.

---

## Step 6: Configure Firewall

### Allow HTTP/HTTPS from Cloudflare only

1. Go to **VPC Network → Firewall**.
2. Click **Create Firewall Rule**.
3. Configure:
   - **Name:** `allow-cloudflare-http`
   - **Direction of traffic:** Ingress
   - **Action on match:** Allow
   - **Targets:** Specified target tags
   - **Target tags:** `http-server`
   - **Source filter:** IPv4 ranges
   - **Source IPv4 ranges:** paste all Cloudflare IP ranges:

     ```
     173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22
     ```

   - **Protocols and ports:** Specified ports and protocols
   - **Ports:** `tcp:80,tcp:443`
4. Click **Create**.

### Restrict SSH to your IP

1. Click **Create Firewall Rule**.
2. Configure:
   - **Name:** `allow-ssh-from-my-ip`
   - **Direction of traffic:** Ingress
   - **Action on match:** Allow
   - **Targets:** Specified target tags
   - **Target tags:** `http-server`
   - **Source filter:** IPv4 ranges
   - **Source IPv4 ranges:** your public IP address followed by `/32` (find it at https://ipinfo.io/ip)
   - **Protocols and ports:** Specified ports and protocols
   - **Ports:** `tcp:22`
3. Click **Create**.

---

## Step 7: Deploy OmniDeck via SSH

### Connect to the VM

You can connect using the browser-based SSH in the GCP Console:

1. Go to **Compute Engine → VM Instances**.
2. Click **SSH** next to `omnideck-prod`.

Or use your terminal:

```bash
ssh -i ~/.ssh/your-key username@<your-static-ip>
```

### Install and start OmniDeck

Inside the VM terminal, run:

```bash
sudo mkdir -p /opt/omnideck
cd /opt/omnideck
sudo git clone https://github.com/yourusername/omnideck.git .
sudo gcloud secrets versions access latest --secret=omnideck-env > .env
sudo docker compose up -d
```

> **Note:** Replace `yourusername` with your actual GitHub username or organization.

Verify all containers are healthy:

```bash
sudo docker compose ps
```

---

## Step 8: Configure Cloudflare

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Select your domain.
3. Go to **DNS** and add an **A record**:
   - **Name:** `@` (or `app` if using a subdomain)
   - **IPv4 address:** your GCP static IP from Step 4
   - **Proxy status:** Enabled (orange cloud)
4. Go to **SSL/TLS**:
   - Set **SSL/TLS encryption mode** to **Full** (origin is HTTP).
   - Enable **Always Use HTTPS**.
   - Set **Security Level** to Medium.
5. (Optional) Go to **Speed → Optimization** and enable **Auto Minify**.
6. (Optional) Add a **Page Rule**:
   - **URL:** `*yourdomain.com/api/auth/login*`
   - **Setting:** Security Level = High

Wait a few minutes, then visit:

```
https://yourdomain.com
```

---

## Step 9: Set Up Backups

### 9.1 Local backups via OmniDeck UI

The `/backups` Docker volume already stores backups locally on the VM.

### 9.2 Sync backups to Cloud Storage

Inside the VM, create a cron job:

```bash
sudo crontab -e
```

Add the following line (replace `<your-project-id>` with your actual project ID):

```cron
0 */6 * * * docker exec omnideck-frontend gcloud storage rsync -r /backups gs://omnideck-backups-<your-project-id>/backups >> /var/log/omnideck-backup-sync.log 2>&1
```

### 9.3 Enable scheduled disk snapshots

1. Go to **Compute Engine → Snapshots**.
2. Click **Create Snapshot Schedule**.
3. Configure:
   - **Name:** `omnideck-daily-snapshot`
   - **Frequency:** Daily
   - **Start time:** 4:00 AM
   - **Time zone:** UTC
   - **Retention:** 7 days
4. Click **Create**.
5. Go to **Compute Engine → Disks**.
6. Click the boot disk for `omnideck-prod`.
7. Click **Edit**.
8. Under **Snapshot schedule**, select `omnideck-daily-snapshot`.
9. Click **Save**.

---

## Step 10: Monitoring and Logging

### 10.1 Install Ops Agent

Inside the VM, run:

```bash
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install
```

### 10.2 Create uptime check

1. Go to **Monitoring → Uptime Checks**.
2. Click **Create Uptime Check**.
3. Configure:
   - **Title:** OmniDeck Health
   - **Protocol:** HTTPS
   - **Resource type:** URL
   - **Hostname:** `yourdomain.com`
   - **Path:** `/api/health`
   - **Check frequency:** 1 minute
4. Click **Next**, then **Create**.

### 10.3 Create alert policies

1. Go to **Monitoring → Alerting**.
2. Click **Create Policy**.
3. Add conditions for:
   - VM CPU utilization > 80% for 5 minutes
   - Disk usage > 85%
   - Uptime check failure (health endpoint down)
4. Add your email as a notification channel.
5. Name the policy and click **Create**.

---

## Step 11: CI/CD with GitHub Actions (Optional)

If you want automatic deploys on every push to `main`:

1. In the GCP Console, go to **IAM & Admin → Service Accounts**.
2. Open `omnideck-deploy` and create a new JSON key if you haven't already.
3. Copy the contents of `omnideck-deploy-key.json`.
4. In your GitHub repo, go to **Settings → Secrets and variables → Actions**.
5. Create a new secret named `GCP_SA_KEY` and paste the JSON key.
6. Create `.github/workflows/deploy.yml` in your repo:

```yaml
name: Deploy to GCP

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to VM
        run: |
          gcloud compute ssh omnideck-prod --zone=us-central1-a --command '
            set -e
            cd /opt/omnideck
            sudo git pull origin main
            sudo gcloud secrets versions access latest --secret=omnideck-env > .env
            sudo docker compose pull
            sudo docker compose up -d --build
            sudo docker compose ps
          '
```

> **Note:** GitHub Actions uses the `gcloud` CLI internally, but you only need to configure it through the GitHub UI.

---

## Step 12: Post-Deployment Checklist

- [ ] Change all default passwords before first use
- [ ] Verify HTTPS works via Cloudflare
- [ ] Create a tenant and test all services
- [ ] Run a backup and confirm it appears in Cloud Storage
- [ ] Verify monitoring alerts are configured
- [ ] Confirm SSH firewall rule is restricted to your IP
- [ ] Confirm HTTP/HTTPS firewall rule allows only Cloudflare IPs
- [ ] Store `.env` and service account key securely; do not commit them

---

## Troubleshooting

### Containers fail to start

Inside the VM:

```bash
sudo docker compose logs
```

### Cannot access the web UI

1. Check the VM external IP matches your Cloudflare A record.
2. Verify the firewall rule allows Cloudflare IP ranges.
3. Check that nginx is running: `sudo docker compose ps`.

### Redis ACL user missing after restart

Redis now runs with `--appendonly yes`, so ACL users should persist. If a user is missing, disable and re-enable Redis for that tenant in the admin dashboard.

### Backup sync to Cloud Storage fails

Ensure the VM service account has the **Storage Object Admin** role and the bucket name in the cron job matches the one you created.

---

## Scaling Path

When you outgrow the single VM:

1. Move Postgres to **Cloud SQL**.
2. Move Redis to **Memorystore**.
3. Move MongoDB to **MongoDB Atlas** or a replica set.
4. Move MinIO data to **Cloud Storage**.
5. Run the frontend on **Cloud Run** or **GKE**.

---

## Cost Estimate (us-central1)

| Resource | Monthly Cost |
|----------|--------------|
| e2-standard-2 VM (sustained use) | ~$48 |
| 50 GB balanced persistent disk | ~$7 |
| Cloud Storage (backup bucket) | ~$1–5 |
| Cloud Monitoring | Free tier |
| Cloudflare Free plan | $0 |
| **Total** | **~$60–80/month** |

---

## Security Notes

- Database ports are bound to `127.0.0.1` inside Docker and are not exposed publicly.
- The Docker socket is mounted read-only (`:ro`).
- Secrets are read from Secret Manager at deploy time, not stored in the repo.
- Admin password is hashed with bcrypt.
- Use Cloudflare rate limiting for additional DDoS protection.
