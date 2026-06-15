# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# openssl so `prisma generate` detects the right engine at build time.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

COPY . .
# A throwaway DATABASE_URL satisfies prisma generate; no DB is contacted.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma engines need these on alpine.
RUN apk add --no-cache openssl

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma CLI + schema + engines for running migrations on boot. We invoke
# it via node node_modules/prisma/build/index.js (see entrypoint), so the
# .bin symlink is intentionally NOT copied — Docker flattens it and breaks
# the CLI's relative .wasm lookup.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# The generated client + its query-engine .so.node live here. Next's
# standalone tracing can miss the dynamically-loaded engine binary, so
# copy it explicitly — needed by both the app server and bootstrap-admin.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/scripts/discord-backfill.mjs ./scripts/discord-backfill.mjs
COPY --from=builder /app/scripts/discord-embed.mjs ./scripts/discord-embed.mjs
# Spawned by the admin "Rebuild insights" button (Discord Stats). Self-contained
# like the other scripts — only needs @prisma/client, already present at runtime.
COPY --from=builder /app/scripts/discord-insights.mjs ./scripts/discord-insights.mjs
# sharp's native libvips lives in @img/* optional deps; standalone tracing
# copies sharp's JS but misses the .so packages — copy them explicitly
# (needed by the world-avatar compositor).
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
