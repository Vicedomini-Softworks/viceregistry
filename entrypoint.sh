#!/bin/sh
set -e

echo "Running migrations..."
npm run db:migrate

echo "Running seeds..."
npm run db:seed

echo "Starting app..."
exec "$@"
