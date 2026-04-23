# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Astro dev server with HMR
npm run build        # Production build
npm run typecheck    # TypeScript check (astro check)
npm run lint         # ESLint on .ts/.tsx files
npm run format       # Prettier write

npm run db:generate  # Regenerate migration SQL from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:seed      # Create/reset admin user

npm run keys:generate  # Generate RSA 4096 keypair for registry token signing
```

No test suite exists.

## Architecture

**ViceRegistry** = Docker Registry v2 UI + token authentication server. Docker delegates all auth to this app via the [Docker token auth spec](https://distribution.github.io/distribution/spec/auth/token/).

**Stack:** Astro 5 (full SSR, `@astrojs/node` standalone) + React 19 (interactive islands via `client:load`) + Tailwind v4 + shadcn/ui + Drizzle ORM + PostgreSQL + jose (JWT) + Zod.

### Request flow

1. **Web sessions** — HS256 JWT in `httpOnly` cookie (8-hour expiry). Middleware at `src/middleware/index.ts` verifies on every request, populates `Astro.locals.user`.
2. **Docker auth** — Docker client hits `GET /api/auth/token` with HTTP Basic. App bcrypt-verifies, issues RS256 JWT scoped by user roles: `viewer`=pull, `push`=pull+push, `admin`=pull+push+delete.
3. **Registry data** — Cached in PG (`repositories`, `image_metadata`). Astro pages fire a background `syncRepositories()` / `syncRepository(name)` (5-min staleness threshold) then immediately serve cached data. Live search (`/api/search`) queries PG with `ILIKE`.

### Key files

| Path | Role |
|------|------|
| `src/middleware/index.ts` | Auth enforcement, route protection, role checks |
| `src/lib/schema.ts` | Drizzle schema (all tables) |
| `src/lib/registry-token.ts` | Docker RS256 token issuance + scope computation |
| `src/lib/registry-sync.ts` | PG cache sync (batched manifest fetching, 8 concurrent) |
| `src/lib/registry-client.ts` | Thin HTTP client for Docker Registry v2 API |
| `src/lib/auth.ts` | Web session JWT helpers |
| `src/pages/api/auth/token.ts` | Docker token endpoint |
| `drizzle/seed/0001_default_roles.sql` | Must be applied manually via psql before seeding |

### Route protection (middleware)

- **Public:** `/login`, `/dashboard`, `/repository`, `/image`, `/api/auth/*`, `/api/health`, `/api/search`
- **Admin-only:** `/admin/*`, `/api/users/*`, `DELETE /api/registry/*`
- **Auth required:** `/settings`, `/api/auth/logout`, `/api/auth/me`

## Local dev setup

Requires Docker Compose (MinIO + PostgreSQL + Registry v2 run as services).

1. Copy `.env.example` → `.env` and fill in values
2. Run `npm run keys:generate` — copies output into `.env`
3. `docker-compose up -d db minio minio-init registry`
4. `npm run db:migrate`
5. Apply roles seed: `psql $DATABASE_URL -f drizzle/seed/0001_default_roles.sql`
6. `npm run db:seed`
7. `npm run dev`

## Production notes

- `REGISTRY_AUTH_TOKEN_REALM` must be the externally reachable URL (not container-internal). Update before deploying.
- TLS termination required (Docker rejects HTTP for non-localhost registries). Put nginx/Caddy/Traefik in front of both port 4321 (app) and 5000 (registry).
- Run migrations + role seed before app starts — not automated in Dockerfile.
- AWS S3 production overlay: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

## Conventions

- Prettier: no semicolons, double quotes, 2-space indent, trailing commas (ES5), 80-char width.
- Path alias `@/*` → `src/*`.
- Astro pages own server-side data fetching; React components receive data as props and handle interactivity.
- `audit.ts` writes are fire-and-forget — don't await them in hot paths.
