#!/bin/bash
# Host-level security hardening helpers for OmniDeck.
# Run as root on the production VM.
set -euo pipefail

ADMIN_IP="${ADMIN_IP:-}"

log() { echo "[security] $*"; }

install_fail2ban() {
    log "installing fail2ban"
    apt-get update
    apt-get install -y fail2ban

    cat >/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[omnideck-nginx]
enabled = true
port = http,https
filter = omnideck-nginx
logpath = /var/log/nginx/access.log
maxretry = 5
EOF

    cat >/etc/fail2ban/filter.d/omnideck-nginx.conf <<'EOF'
[Definition]
failregex = ^<HOST> .* "POST /admin/login HTTP/.*" (401|403|302) .* "invalid"
            ^<HOST> .* "POST /dashboard/login HTTP/.*" (401|403|302) .* "invalid"
ignoreregex =
EOF

    systemctl restart fail2ban
    systemctl enable fail2ban
    log "fail2ban configured"
}

harden_ssh() {
    log "hardening SSH"
    sed -i 's/^#*\s*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    sed -i 's/^#*\s*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/^#*\s*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
    systemctl restart sshd
    log "SSH hardened"
}

configure_ufw() {
    log "configuring UFW firewall"
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 80/tcp
    ufw allow 443/tcp
    if [ -n "$ADMIN_IP" ]; then
        ufw allow from "$ADMIN_IP" to any port 22
    else
        log "WARNING: ADMIN_IP not set; SSH port 22 will remain closed"
    fi
    ufw --force enable
    log "UFW configured"
}

enable_unattended_upgrades() {
    log "enabling unattended-upgrades"
    apt-get install -y unattended-upgrades
    dpkg-reconfigure -plow unattended-upgrades
    log "unattended-upgrades enabled"
}

case "${1:-all}" in
    fail2ban) install_fail2ban ;;
    ssh) harden_ssh ;;
    firewall) configure_ufw ;;
    upgrades) enable_unattended_upgrades ;;
    all)
        install_fail2ban
        harden_ssh
        configure_ufw
        enable_unattended_upgrades
        log "all security hardening steps completed"
        ;;
    *) echo "Usage: $0 [fail2ban|ssh|firewall|upgrades|all]"; exit 1 ;;
esac
