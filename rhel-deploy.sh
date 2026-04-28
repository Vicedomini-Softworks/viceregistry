#!/usr/bin/env bash
# One-click deployment on a RHEL/CentOS machine.
# This script clones the repository (from the public mirror) if it does not
# already exist, copies the podman deployment files to the system and runs
# the bundled deploy.sh.  It is intended to be run as root.
#
# Usage: sudo ./rhel-deploy.sh
#
# Prerequisites: git, podman, systemctl.

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

# Copy unit files into the podman directory – overwrite with warning
chmod +x "$TARGET_DIR/podman/deploy.sh"

for f in "$PODMAN_DIR"/*.container "$PODMAN_DIR"/*.pod "$PODMAN_DIR"/*.volume "$PODMAN_DIR"/deploy.sh; do
    [[ -e "$f" ]] || continue
    dst="$TARGET_DIR/podman/${f##*/}"
    if [[ "$f" == "$dst" ]]; then
        # same file, nothing to do
        continue
    fi
    if [[ -e "$dst" ]]; then
        echo "    Overwriting $dst"
    fi
    cp -f "$f" "$dst"
    echo "    Copied ${f##*/} to $dst"

done

# Run the real deploy script
echo 'Starting podman deployment…'
# Running as root; sudo is harmless
sudo "$TARGET_DIR/podman/deploy.sh"

echo 'Deployment finished. Check systemctl status for services.'
