# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

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
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
