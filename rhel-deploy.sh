#!/usr/bin/env bash
# One-click deployment on a RHEL/CentOS machine.
# This script clones the repository (from the public mirror) if it does not
# already exist, copies the podman deployment files to the system and runs
# the bundled deploy.sh.  It is intended to be run as root.
#
# Usage: sudo ./rhel-deploy.sh
#
# Prerequisites: git, podman, systemctl.
#
# The script will:
#   1. Ensure the source repo exists under /opt/viceregistry.
#   2. Copy the podman sub‑directory (containing deploy.sh and other
#      Quadlet units) to a temporary location.
#   3. Move deploy.sh into /opt/viceregistry/podman.
#   4. Execute that deploy script.
#
# Note: The deployment will pull the application container from GHCR. If you
# prefer a local build, modify the APP_IMAGE in podman/deploy.sh accordingly.
#
# The script keeps all user‑configurable files under /etc/viceregistry so the
# result is idempotent.

set -euo pipefail

REPO_GIT='https://github.com/vicedomini-softworks/viceregistry.git'
TARGET_DIR='/opt/viceregistry'

# Ensure we run as root
[[ $EUID -eq 0 ]] || { echo 'Must run as root'; exit 1; }

# Make sure git and podman are available
command -v git >/dev/null 2>&1 || { echo 'git not found'; exit 1; }
command -v podman >/dev/null 2>&1 || { echo 'podman not found'; exit 1; }

# Clone or update repo
if [[ ! -d "$TARGET_DIR" ]]; then
    echo 'Cloning repository...'
    git clone --depth 1 "$REPO_GIT" "$TARGET_DIR"
else
    echo 'Repository exists – pulling latest...'
    pushd "$TARGET_DIR" > /dev/null
    git pull --ff-only
    popd > /dev/null
fi

# Copy the podman deployment folder to /opt/viceregistry
PODMAN_DIR="$TARGET_DIR/podman"
if [[ ! -d "$PODMAN_DIR" ]]; then
    echo 'podman directory missing in the source repo'; exit 1;
fi

# Ensure the target podman dir exists
mkdir -p "$PODMAN_DIR"

# Copy all the *.container, *.pod, *.volume, and deploy.sh files
for f in "$PODMAN_DIR"/*.container "$PODMAN_DIR"/*.pod "$PODMAN_DIR"/*.volume "$PODMAN_DIR"/deploy.sh; do
    [[ -e "$f" ]] || continue
    cp -f "$f" "$TARGET_DIR/podman/${{f##*/}}"
done

chmod +x "$TARGET_DIR/podman/deploy.sh"

# Run the real deploy script
echo 'Starting podman deployment…'
sudo "$TARGET_DIR/podman/deploy.sh"

echo 'Deployment finished. Check systemctl status for services.'
