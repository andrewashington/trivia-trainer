#!/bin/sh
set -e

echo "Applying database migrations…"
# Invoke Prisma via its real entry, not the .bin symlink: Docker COPY
# flattens the symlink into a standalone file, which breaks the CLI's
# relative lookup of its bundled .wasm (ENOENT prisma_schema_build_bg.wasm).
node node_modules/prisma/build/index.js migrate deploy

echo "Ensuring admin account…"
# Non-fatal: a bootstrap hiccup (e.g. missing SEED_ADMIN_EMAIL) must not
# crash-loop the whole app — start the server regardless and surface it.
node prisma/bootstrap-admin.mjs || echo "⚠ admin bootstrap failed — starting the app anyway"

echo "Starting UDM+…"
exec node server.js
