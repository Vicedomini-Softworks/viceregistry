#!/usr/bin/env bash
# One-click deploy for CentOS — rootful Podman + systemd Quadlet (single pod)
# Usage: sudo ./deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_IMAGE="ghcr.io/vicedomini-softworks/viceregistry:latest"
CONFIG_DIR="/etc/viceregistry"
ENV_FILE="$CONFIG_DIR/.env"
CERTS_DIR="$CONFIG_DIR/certs"
QUADLET_DIR="/etc/containers/systemd"

# ── Helpers ───────────────────────────────────────────────────────────────────
die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo; echo "==> $*"; }
ok()   { echo "    OK: $*"; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root: sudo $0"

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites"
command -v podman    >/dev/null 2>&1 || die "podman not found — install: dnf install -y podman"
command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
ok "podman $(podman --version | awk '{print $3}')"

# ── Env file ──────────────────────────────────────────────────────────────────
info "Config directory: $CONFIG_DIR"
mkdir -p "$CONFIG_DIR" "$CERTS_DIR"
chmod 700 "$CONFIG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPT_DIR/config/app.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo
  echo "  Created $ENV_FILE"
  echo "  Fill in all CHANGE_ME values then re-run: sudo $0"
  exit 0
fi

chmod 600 "$ENV_FILE"
ok "Env file found"

# Validate required vars are set
REQUIRED_VARS=(
  DATABASE_URL SESSION_SECRET
  REGISTRY_URL REGISTRY_AUTH_TOKEN_REALM
  REGISTRY_TOKEN_PRIVATE_KEY REGISTRY_TOKEN_PUBLIC_KEY
  REGISTRY_TOKEN_ISSUER
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_BUCKET
  REGISTRY_STORAGE_S3_ACCESSKEY REGISTRY_STORAGE_S3_SECRETKEY
  REGISTRY_STORAGE_S3_BUCKET REGISTRY_STORAGE_S3_REGION
)
set -a; . "$ENV_FILE"; set +a
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  [[ -n "$val" && "$val" != *CHANGE_ME* ]] || die "$var not set in $ENV_FILE"
done
ok "All required vars present"

# ── Write registry cert ───────────────────────────────────────────────────────
info "Writing registry public key cert"
printf "%b\n" "$REGISTRY_TOKEN_PUBLIC_KEY" > "$CERTS_DIR/token.crt"
chmod 644 "$CERTS_DIR/token.crt"
ok "Wrote $CERTS_DIR/token.crt"

# ── Install quadlet units ─────────────────────────────────────────────────────
info "Installing Quadlet units → $QUADLET_DIR"
mkdir -p "$QUADLET_DIR"
cp "$SCRIPT_DIR"/*.container \
   "$SCRIPT_DIR"/*.pod \
   "$SCRIPT_DIR"/*.volume \
   "$QUADLET_DIR/"
ok "Units installed"

# ── Pull images ───────────────────────────────────────────────────────────────
info "Pulling images"
podman pull "$APP_IMAGE"
podman pull docker.io/library/postgres:17-alpine
podman pull docker.io/library/registry:2
ok "Images ready"

# ── Reload systemd ────────────────────────────────────────────────────────────
info "Reloading systemd"
systemctl daemon-reload
ok "daemon-reload done"

# ── Start services (pod is auto-created by Quadlet) ───────────────────────────
info "Starting database (pod will be auto-created)"
systemctl enable --now db.service
echo -n "    Waiting for postgres to be healthy"
for i in $(seq 60); do
  if podman healthcheck run viceregistry-db &>/dev/null; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 2
  [[ $i -lt 60 ]] || die "Database not healthy after 120s"
done

# ── Start registry ────────────────────────────────────────────────────────────
info "Starting registry"
systemctl enable --now registry.service
ok "Registry started"

# ── Start app ─────────────────────────────────────────────────────────────────
info "Starting app (entrypoint runs migrations + seed)"
systemctl enable --now app.service

echo -n "    Waiting for app to become healthy"
for i in $(seq 30); do
  if podman healthcheck run viceregistry-app &>/dev/null; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 3
  [[ $i -lt 30 ]] || { echo; echo "  App not healthy yet — check: journalctl -u app.service"; }
done

# ── Summary ───────────────────────────────────────────────────────────────────
info "Deploy complete"
echo
systemctl status db.service registry.service app.service --no-pager -l || true
podman pod ps || true
echo
echo "  Web UI:      ${PUBLIC_URL:-http://<host>:4321}"
echo "  Registry:    ${REGISTRY_PUBLIC_HOST:-<host>}:5000"
echo
echo "  Logs:        journalctl -fu app.service"
echo "  Re-deploy:   sudo $0"
echo "  Key rotation: update .env then re-run deploy (cert is rewritten)"
