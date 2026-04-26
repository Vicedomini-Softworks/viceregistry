# ── Stage 1: Build ─────────────────────────────��──────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN mkdir -p keys
RUN npm run build

# ── Stage 2: Runner ───────────────────────��───────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache nginx supervisor gettext

# Copy app artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/lib/schema.ts ./src/lib/schema.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

# nginx + supervisor config
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY supervisord.conf /etc/supervisord.conf

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENV PORT=4321

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
