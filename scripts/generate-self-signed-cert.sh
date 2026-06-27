#!/bin/bash
# Generate a self-signed certificate for nginx.
# Used when running OmniDeck behind Cloudflare with SSL/TLS mode "Full".
# Cloudflare will present its own trusted certificate to visitors, so the
# self-signed origin certificate is acceptable.

set -e

DOMAIN="${1:-omnideck.hapkonic.com}"
CERT_DIR="$(dirname "$0")/../certs"

echo "Generating self-signed certificate for $DOMAIN in $CERT_DIR"

mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/nginx.key" \
  -out "$CERT_DIR/nginx.crt" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN"

echo "Certificate generated:"
echo "  $CERT_DIR/nginx.crt"
echo "  $CERT_DIR/nginx.key"
