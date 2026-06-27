#!/bin/bash
# Copy the latest Let's Encrypt certificate into the nginx certs directory and
# reload nginx. Used as a certbot renewal deploy hook.
#
# Usage:
#   ./scripts/deploy-letsencrypt.sh <domain>
#   ./scripts/deploy-letsencrypt.sh omnideck.hapkonic.com

set -e

DOMAIN="${1:-}"
CERT_DIR="$(dirname "$0")/../certs"
MINIO_CERT_DIR="$(dirname "$0")/../minio-certs"

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain>"
    exit 1
fi

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "Certificate directory not found: /etc/letsencrypt/live/$DOMAIN"
    exit 1
fi

mkdir -p "$CERT_DIR"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/nginx.crt"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/nginx.key"
chmod 644 "$CERT_DIR/nginx.crt"
chmod 600 "$CERT_DIR/nginx.key"

# MinIO expects public.crt and private.key
mkdir -p "$MINIO_CERT_DIR"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$MINIO_CERT_DIR/public.crt"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$MINIO_CERT_DIR/private.key"
chmod 644 "$MINIO_CERT_DIR/public.crt"
chmod 600 "$MINIO_CERT_DIR/private.key"

cd "$(dirname "$0")/.."
docker compose exec -T nginx nginx -s reload

# MinIO does not hot-reload TLS certificates; restart the container.
docker compose restart minio

echo "Deployed renewed certificate for $DOMAIN and reloaded nginx and MinIO."
