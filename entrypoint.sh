#!/bin/sh
set -e

echo "Running migrations..."
npm run db:migrate

echo "Running seeds..."
npm run db:seed

echo "Generating nginx config (PORT=${PORT})..."
envsubst '${PORT} ${REGISTRY_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Starting services..."
exec "$@"
