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
ok()   { echo "    ✓ $*"; }
debug() { [[ "${VERBOSE:-0}" == "1" ]] && echo "    • $*" || true; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root: sudo $0"

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites"
command -v podman    >/dev/null 2>&1 || die "podman not found — install: dnf install -y podman"
command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
PODMAN_VERSION=$(podman --version | awk '{print $3}')
debug "Podman version: $PODMAN_VERSION"
ok "podman $PODMAN_VERSION"

# ── Env file ──────────────────────────────────────────────────────────────────
info "Config directory: $CONFIG_DIR"
mkdir -p "$CONFIG_DIR" "$CERTS_DIR"
chmod 700 "$CONFIG_DIR"
debug "Created $CONFIG_DIR with mode 700"
debug "Created $CERTS_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  info "Env file not found — creating from template"
  cp "$SCRIPT_DIR/config/app.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  debug "Copied template from $SCRIPT_DIR/config/app.env.example"
  debug "Set permissions 600 on $ENV_FILE"
  echo
  echo "  Created $ENV_FILE"
  echo "  Fill in all CHANGE_ME values then re-run: sudo $0"
  exit 0
fi

chmod 600 "$ENV_FILE"
debug "Env file exists, permissions set to 600"
ok "Env file found: $ENV_FILE"

# Validate required vars are set
REQUIRED_VARS=(
  DATABASE_URL SESSION_SECRET
  REGISTRY_URL REGISTRY_AUTH_TOKEN_REALM
  REGISTRY_TOKEN_PUBLIC_KEY
  REGISTRY_TOKEN_ISSUER
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_BUCKET
  REGISTRY_STORAGE_S3_ACCESSKEY REGISTRY_STORAGE_S3_SECRETKEY
  REGISTRY_STORAGE_S3_BUCKET REGISTRY_STORAGE_S3_REGION
)
debug "Validating ${#REQUIRED_VARS[@]} required environment variables"
set -a; . "$ENV_FILE"; set +a
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" || "$val" == *CHANGE_ME* ]]; then
    MISSING+=("$var")
  else
    debug "  ✓ $var"
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "Missing or incomplete variables: ${MISSING[*]}"
fi
ok "All ${#REQUIRED_VARS[@]} required variables present"

# ── Write registry cert ───────────────────────────────────────────────────────
info "Writing registry public key certificate"
printf "%b\n" "$REGISTRY_TOKEN_PUBLIC_KEY" > "$CERTS_DIR/token.crt"
chmod 644 "$CERTS_DIR/token.crt"
CERT_SIZE=$(wc -c < "$CERTS_DIR/token.crt")
debug "Wrote $CERTS_DIR/token.crt ($CERT_SIZE bytes)"
debug "Certificate contents preview:"
debug "$(head -3 "$CERTS_DIR/token.crt" | sed 's/^/      /')"
ok "Certificate installed"

# ── Install quadlet units ─────────────────────────────────────────────────────
info "Installing Quadlet units → $QUADLET_DIR"
mkdir -p "$QUADLET_DIR"
debug "Copying unit files from $SCRIPT_DIR"
cp "$SCRIPT_DIR"/*.container \
   "$SCRIPT_DIR"/*.pod \
   "$SCRIPT_DIR"/*.volume \
   "$QUADLET_DIR/"
UNIT_FILES=$(ls "$QUADLET_DIR" | grep -E '\.(container|pod|volume)$' | wc -l)
debug "Copied $UNIT_FILES files:"
for f in "$QUADLET_DIR"/*; do
  debug "  - $(basename "$f")"
done
ok "Quadlet units installed"

# ── Reload systemd to generate service symlinks ───────────────────────────────
info "Reloading systemd daemon (generates .service symlinks)"
systemctl daemon-reload
debug "Checking generated service files..."
for svc in db registry app viceregistry-pod; do
  if systemctl list-unit-files --type=service | grep -q "$svc"; then
    debug "  ✓ $svc.service recognized"
  else
    debug "  ⚠ $svc.service not found — checking $QUADLET_DIR"
    ls -la "$QUADLET_DIR"/*.service 2>/dev/null || debug "    No .service files in $QUADLET_DIR"
  fi
done
ok "Systemd daemon reloaded"

# ── Pull images ───────────────────────────────────────────────────────────────
info "Pulling container images"
for img in "$APP_IMAGE" docker.io/library/postgres:17-alpine docker.io/library/registry:2; do
  debug "Pulling: $img"
  podman pull "$img"
  debug "  ✓ Image pulled successfully"
done
debug "Local images:"
podman images --format "    • {{.Repository}}:{{.Tag}} ({{.Size}})"
ok "All images ready"

# ── Start services (pod is auto-created by Quadlet) ───────────────────────────
info "Starting database (pod will be auto-created by Quadlet)"
debug "Starting db.service"
systemctl start db.service
debug "Waiting for postgres to become healthy (max 120s)"
echo -n "    "
for i in $(seq 60); do
  if podman healthcheck run viceregistry-db &>/dev/null; then
    echo "✓ Database healthy after ${i}s"
    debug "Postgres is ready to accept connections"
    break
  fi
  echo -n "."
  sleep 2
  [[ $i -lt 60 ]] || { echo; die "Database not healthy after 120s — check: journalctl -u db.service"; }
done

# ── Start registry ────────────────────────────────────────────────────────────
info "Starting Docker Registry v2"
debug "Starting registry.service"
systemctl start registry.service
debug "Registry container should be starting..."
sleep 2
if podman ps --filter "name=viceregistry-registry" --format "{{.Status}}" | grep -q "Up"; then
  ok "Registry started and running"
else
  debug "Registry status: $(podman ps -a --filter 'name=viceregistry-registry' --format '{{.Status}}')"
  ok "Registry service enabled (may take a moment to start)"
fi

# ── Start app ─────────────────────────────────────────────────────────────────
info "Starting ViceRegistry app (entrypoint runs migrations + seed)"
debug "Starting app.service"
debug "Note: App entrypoint will wait for DB, then run migrations and seed"
systemctl start app.service

echo -n "    Waiting for app to become healthy"
for i in $(seq 30); do
  if podman healthcheck run viceregistry-app &>/dev/null; then
    echo " ✓ App healthy after ${i}s"
    debug "App is ready to serve requests"
    break
  fi
  echo -n "."
  sleep 3
  [[ $i -lt 30 ]] || { echo; die "App failed to become healthy after 90s — check: journalctl -u app.service"; }
done

# ── Verify pod and ports ──────────────────────────────────────────────────────
info "Verifying deployment"
debug "Checking pod is running..."
if ! podman pod inspect viceregistry &>/dev/null; then
  die "Pod 'viceregistry' not found — check Quadlet configuration in $QUADLET_DIR"
fi
debug "Pod 'viceregistry' is running"

debug "Checking exposed ports..."
if ! ss -tlnp | grep -q ":4321 "; then
  die "Port 4321 not listening — pod may have failed to start"
fi
debug "  ✓ Port 4321 listening"

if ! ss -tlnp | grep -q ":5000 "; then
  die "Port 5000 not listening — pod may have failed to start"
fi
debug "  ✓ Port 5000 listening"

# ── Firewall configuration ────────────────────────────────────────────────────
if command -v firewall-cmd >/dev/null 2>&1; then
  info "Configuring firewall"
  if firewall-cmd --permanent --add-port=4321/tcp 2>/dev/null; then
    debug "  ✓ Port 4321 added to firewall"
  else
    debug "  ⚠ Could not add port 4321 to firewall (may require manual configuration)"
  fi
  if firewall-cmd --permanent --add-port=5000/tcp 2>/dev/null; then
    debug "  ✓ Port 5000 added to firewall"
  else
    debug "  ⚠ Could not add port 5000 to firewall (may require manual configuration)"
  fi
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "Firewall configured"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
info "Deploy complete ✓"
echo
info "Service status"
systemctl is-active db.service registry.service app.service | while read status; do
  debug "  $(echo $status)"
done
echo
systemctl status db.service registry.service app.service --no-pager -l || true
echo
info "Pod status"
podman pod ps || true
echo
info "Access URLs"
echo "  Web UI:      ${PUBLIC_URL:-http://<host>:4321}"
echo "  Registry:    ${REGISTRY_PUBLIC_HOST:-<host>}:5000"
echo
info "Management"
echo "  Logs (all):  journalctl -fu app.service -fu db.service -fu registry.service"
echo "  Logs (app):  journalctl -fu app.service"
echo "  Re-deploy:   sudo $0"
echo "  Key rotation: update REGISTRY_TOKEN_* in .env then re-run deploy"
echo "  Stop:        sudo systemctl stop app.service registry.service db.service"
echo "  Start:       sudo systemctl start app.service registry.service db.service"
echo "  Restart:     sudo systemctl restart app.service registry.service db.service"
echo "  Autostart:   services auto-start when pod starts (StartWithPod=true)"
