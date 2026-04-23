# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Ensure keys dir exists (RSA keys are provided via env vars at runtime)
RUN mkdir -p keys

RUN npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S astro  -G nodejs

# Copy only what the standalone server needs
COPY --from=builder --chown=astro:nodejs /app/dist ./dist
COPY --from=builder --chown=astro:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=astro:nodejs /app/package.json ./package.json

# Drizzle migrations (run via db:migrate in entrypoint or init container)
COPY --from=builder --chown=astro:nodejs /app/drizzle ./drizzle

USER astro
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4321/api/health || exit 1

ENV HOST=0.0.0.0
ENV PORT=4321

CMD ["node", "dist/server/entry.mjs"]
