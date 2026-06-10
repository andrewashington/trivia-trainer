#!/bin/sh
set -e

echo "Applying database migrations…"
# Invoke Prisma via its real entry, not the .bin symlink: Docker COPY
# flattens the symlink into a standalone file, which breaks the CLI's
# relative lookup of its bundled .wasm (ENOENT prisma_schema_build_bg.wasm).
node node_modules/prisma/build/index.js migrate deploy

echo "Ensuring admin account…"
node prisma/bootstrap-admin.mjs

echo "Starting UDM+…"
exec node server.js
