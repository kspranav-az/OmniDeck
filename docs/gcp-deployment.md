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
- GitHub Actions push-to-deploy pipeline
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
- `gcloud` CLI installed locally
- A production-ready `.env` file (no default passwords)

---

## Step 1: Prepare Your GCP Project

### 1.1 Create or select a project

```bash
export PROJECT_ID="your-project-id"
gcloud projects create $PROJECT_ID --name="OmniDeck"
gcloud config set project $PROJECT_ID
```

### 1.2 Enable required APIs

```bash
gcloud services enable compute.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
```

### 1.3 Create a deployment service account

```bash
gcloud iam service-accounts create omnideck-deploy \
  --display-name="OmniDeck Deployer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:omnideck-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:omnideck-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:omnideck-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Download the key for CI/CD later:

```bash
gcloud iam service-accounts keys create ~/omnideck-deploy-key.json \
  --iam-account=omnideck-deploy@$PROJECT_ID.iam.gserviceaccount.com
```

---

## Step 2: Upload Secrets to Secret Manager

Prepare a `.env` file with strong passwords. Do not commit this file.

```bash
gcloud secrets create omnideck-env --data-file=.env
```

Verify:

```bash
gcloud secrets versions access latest --secret=omnideck-env
```

---

## Step 3: Create a Backup Bucket

```bash
export BUCKET_NAME="omnideck-backups-$PROJECT_ID"
gcloud storage buckets create gs://$BUCKET_NAME --location=us-central1
```

---

## Step 4: Reserve a Static IP

```bash
gcloud compute addresses create omnideck-ip --region=us-central1
export STATIC_IP=$(gcloud compute addresses describe omnideck-ip --region=us-central1 --format='value(address)')
echo $STATIC_IP
```

---

## Step 5: Create the VM

```bash
gcloud compute instances create omnideck-prod \
  --zone=us-central1-a \
  --machine-type=e2-standard-2 \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-balanced \
  --tags=http-server,https-server \
  --address=omnideck-ip \
  --metadata startup-script='#!/bin/bash
    set -e
    apt-get update
    apt-get install -y docker.io docker-compose-plugin git jq
    systemctl enable docker
    systemctl start docker
  '
```

Assign the service account to the VM so it can read secrets:

```bash
gcloud compute instances set-service-account omnideck-prod \
  --zone=us-central1-a \
  --service-account=omnideck-deploy@$PROJECT_ID.iam.gserviceaccount.com \
  --scopes=cloud-platform
```

---

## Step 6: Configure Firewall

Restrict inbound HTTP/HTTPS to Cloudflare IPs only.

```bash
gcloud compute firewall-rules create allow-cloudflare-http \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:80,tcp:443 \
  --source-ranges=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22 \
  --target-tags=http-server
```

Restrict SSH to your IP:

```bash
export MY_IP=$(curl -s https://ipinfo.io/ip)
gcloud compute firewall-rules create allow-ssh-from-my-ip \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=$MY_IP/32 \
  --target-tags=http-server
```

---

## Step 7: Deploy OmniDeck

SSH into the VM:

```bash
gcloud compute ssh omnideck-prod --zone=us-central1-a
```

On the VM:

```bash
sudo mkdir -p /opt/omnideck
cd /opt/omnideck
sudo git clone https://github.com/yourusername/omnideck.git .
sudo gcloud secrets versions access latest --secret=omnideck-env > .env
sudo docker compose up -d
```

Check that all containers are healthy:

```bash
sudo docker compose ps
```

---

## Step 8: Configure Cloudflare

1. Add an **A record** for your domain pointing to the static IP from Step 4.
2. In Cloudflare dashboard → **SSL/TLS**:
   - Set **SSL/TLS encryption mode** to **Full** (origin is HTTP).
   - Enable **Always Use HTTPS**.
   - Set **Security Level** to Medium.
3. Under **Speed** → **Optimization**:
   - Enable **Auto Minify** for HTML, CSS, JS (optional).
4. Add a **Page Rule** for the admin login:
   - URL: `*yourdomain.com/api/auth/login*`
   - Settings: Security Level = High

Wait a few minutes, then visit:

```
https://yourdomain.com
```

---

## Step 9: Set Up Backups

### 9.1 Local backups via OmniDeck UI

The `/backups` Docker volume already stores backups locally.

### 9.2 Sync backups to GCS

Create a cron job on the VM:

```bash
sudo crontab -e
```

Add:

```cron
0 */6 * * * docker exec omnideck-frontend gcloud storage rsync -r /backups gs://omnideck-backups-$PROJECT_ID/backups >> /var/log/omnideck-backup-sync.log 2>&1
```

### 9.3 Enable scheduled disk snapshots

```bash
gcloud compute resource-policies create snapshot-schedule \
  --description="Daily OmniDeck disk snapshot" \
  --max-retention-days=7 \
  --start-time=04:00 \
  --timezone=UTC \
  --daily-schedule

gcloud compute disks add-resource-policies omnideck-prod \
  --zone=us-central1-a \
  --resource-policies=snapshot-schedule
```

---

## Step 10: Monitoring and Logging

### 10.1 Install Ops Agent

```bash
gcloud compute ssh omnideck-prod --zone=us-central1-a --command '
  curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
  sudo bash add-google-cloud-ops-agent-repo.sh --also-install
'
```

### 10.2 Create uptime check

```bash
gcloud monitoring uptime create \
  --display-name="OmniDeck Health" \
  --resource-type=cloud-run-url \
  --resource-labels=host=yourdomain.com \
  --path=/api/health \
  --protocol=https \
  --period=60s
```

### 10.3 Create alert policies

Set alerts for:
- VM CPU > 80% for 5 minutes
- Disk usage > 85%
- Health endpoint returns non-200

You can create these in the Cloud Console under **Monitoring → Alerting**.

---

## Step 11: CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml` in your repo:

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

Add the service account key to GitHub secrets:

1. Go to **Settings → Secrets and variables → Actions**.
2. Create `GCP_SA_KEY` and paste the contents of `~/omnideck-deploy-key.json`.

---

## Step 12: Post-Deployment Checklist

- [ ] Change all default passwords before first use
- [ ] Verify HTTPS works via Cloudflare
- [ ] Create a tenant and test all services
- [ ] Run a backup and confirm it appears in GCS
- [ ] Verify monitoring alerts are configured
- [ ] Confirm SSH is restricted to your IP
- [ ] Confirm firewall allows only Cloudflare IPs on 80/443
- [ ] Store `.env` and service account key securely; do not commit them

---

## Troubleshooting

### Containers fail to start

```bash
sudo docker compose logs
```

### Cannot access the web UI

1. Check VM external IP matches Cloudflare A record.
2. Verify firewall rules allow Cloudflare IPs.
3. Check nginx is running: `sudo docker compose ps`.

### Redis ACL user missing after restart

Redis now runs with `--appendonly yes`, so ACL users should persist. If a user is missing, disable and re-enable Redis for that tenant in the admin dashboard.

### Backup sync to GCS fails

Ensure the VM service account has `roles/storage.objectAdmin` on the backup bucket.

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
