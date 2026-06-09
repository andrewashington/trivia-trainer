#!/bin/sh
set -e

echo "Applying database migrations…"
./node_modules/.bin/prisma migrate deploy

echo "Starting UDM+…"
exec node server.js
