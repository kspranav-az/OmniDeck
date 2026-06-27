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

cd "$(dirname "$0")/.."
docker compose exec -T nginx nginx -s reload

echo "Deployed renewed certificate for $DOMAIN and reloaded nginx."
