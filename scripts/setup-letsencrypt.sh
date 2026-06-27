#!/bin/bash
# Request a Let's Encrypt certificate for the OmniDeck origin and configure
# nginx to use it. After running this, set Cloudflare SSL/TLS to "Full (Strict)".
#
# Usage:
#   ./scripts/setup-letsencrypt.sh <domain> <email>
#   ./scripts/setup-letsencrypt.sh omnideck.hapkonic.com admin@example.com

set -e

DOMAIN="${1:-}"
EMAIL="${2:-}"
CERT_DIR="$(dirname "$0")/../certs"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 omnideck.hapkonic.com admin@example.com"
    exit 1
fi

# Install certbot on Debian/Ubuntu if missing
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot
fi

# Stop the nginx container so certbot standalone can bind port 80.
# Port 80 must be reachable from the internet (via Cloudflare) for HTTP-01 validation.
echo "Stopping nginx container for certbot validation..."
cd "$(dirname "$0")/.."
docker compose stop nginx

echo "Requesting certificate from Let's Encrypt for $DOMAIN..."
sudo certbot certonly \
    --standalone \
    -d "$DOMAIN" \
    --agree-tos \
    --non-interactive \
    --email "$EMAIL" \
    --no-eff-email

# Copy certificate into the nginx certs directory
mkdir -p "$CERT_DIR"
sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/nginx.crt"
sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/nginx.key"
sudo chmod 644 "$CERT_DIR/nginx.crt"
sudo chmod 600 "$CERT_DIR/nginx.key"

# Start nginx with the new certificate
echo "Starting nginx with Let's Encrypt certificate..."
docker compose up -d nginx

echo ""
echo "Certificate installed for $DOMAIN."
echo "Set Cloudflare SSL/TLS to 'Full (Strict)' and test https://$DOMAIN"
