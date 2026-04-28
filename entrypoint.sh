#!/bin/sh
set -e

echo "Generating nginx config (PORT=${PORT})..."
envsubst '${PORT} ${REGISTRY_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting services..."
exec "$@"