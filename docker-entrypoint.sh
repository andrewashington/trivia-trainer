#!/bin/sh
set -e

echo "Applying database migrations…"
./node_modules/.bin/prisma migrate deploy

echo "Ensuring admin account…"
node prisma/bootstrap-admin.mjs

echo "Starting UDM+…"
exec node server.js
