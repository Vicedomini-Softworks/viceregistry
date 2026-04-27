# ViceRegistry

![Coverage](./public/badges/coverage.svg) ![Mutation](./public/badges/mutation.svg)

![ViceRegistry](public/logo-wide.png)

A production-ready Docker Registry UI with authentication, user management, and role-based access control. Built on Astro SSR + React + TypeScript + Tailwind CSS.

The app acts as a Docker Registry token auth server — the registry delegates all authentication to ViceRegistry, so a single set of credentials works for both the web UI and `docker login`.

## Features

- **Public browsing** — dashboard, repositories, and image details are accessible without login
- **Search** — live search across repository names and image tags (debounced, backed by PostgreSQL)
- Browse repositories, tags, and image layer details
- Copy pull commands to clipboard
- Delete images (admin only, requires sign-in)
- JWT-based web sessions
- Docker Registry token auth (RS256, Docker auth spec)
- User management with roles: `admin`, `push`, `viewer`
- Audit log
- PostgreSQL for users, roles, and registry metadata cache
- S3-compatible storage for registry blobs (AWS S3 or MinIO)
- Registry metadata (repos, tags, OS, arch, size) cached in PG — refreshed automatically every 5 minutes

## Prerequisites

- Node.js 22+
- Docker + Docker Compose **or** Podman 4.4+ (CentOS/RHEL production)
- A PostgreSQL instance (provided by compose in local dev)
- An S3 bucket (MinIO provided by compose in local dev, AWS S3 for production)

## Local development

### 1. Clone and install

```bash
git clone <repo>
cd viceregistry
npm install
```

### 2. Generate RSA keys

The keys sign Docker registry tokens. Generate them once and never commit the private key.

```bash
npm run keys:generate
```

This writes `keys/registry-token.key` (private) and `keys/registry-token.crt` (public) and prints the env vars to add to `.env`.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random 32-byte hex string — run `openssl rand -hex 32` |
| `REGISTRY_TOKEN_PRIVATE_KEY` | From `npm run keys:generate` output |
| `REGISTRY_TOKEN_PUBLIC_KEY` | From `npm run keys:generate` output |
| `REGISTRY_TOKEN_ISSUER` | Token issuer string, e.g. `viceregistry` |
| `REGISTRY_URL` | Internal URL of the registry, e.g. `http://registry:5000` |
| `REGISTRY_PUBLIC_HOST` | Public hostname shown in pull commands, e.g. `registry.example.com` |
| `AWS_ACCESS_KEY_ID` | S3 access key (use `minioadmin` for local MinIO) |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_REGION` | S3 region |
| `S3_BUCKET` | Bucket name for registry blobs |
| `S3_ENDPOINT_URL` | Leave blank for AWS; set to MinIO URL for local dev |
| `SEED_ADMIN_USERNAME` | Initial admin username (default: `admin`) |
| `SEED_ADMIN_EMAIL` | Initial admin email |
| `SEED_ADMIN_PASSWORD` | Initial admin password — change after first login |

### 4. Run migrations and seed

```bash
# Apply database schema (users, roles, repositories, image metadata)
npm run db:migrate

# Insert default roles (admin, push, viewer)
psql $DATABASE_URL -f drizzle/seed/0001_default_roles.sql

# Create the initial admin user
npm run db:seed
```

Migrations are applied in order from `drizzle/migrations/`. The schema includes:

- `users`, `roles`, `user_roles`, `audit_log` — auth and access control
- `repositories`, `image_metadata` — registry metadata cache (populated automatically from the registry on first page load; refreshed every 5 minutes)

### 5. Start the local stack

```bash
docker-compose up
```

This starts:
- **app** — ViceRegistry UI on `http://localhost:4321`
- **db** — PostgreSQL 17
- **registry** — Docker Registry v2 on `localhost:5000`
- **minio** — S3-compatible storage on `http://localhost:9000` (console at `:9001`)
- **minio-init** — one-shot job that creates the registry bucket

Open `http://localhost:4321` and sign in with your seed credentials.

### 6. Test Docker push/pull

```bash
docker login localhost:5000
docker pull alpine
docker tag alpine localhost:5000/my-app:latest
docker push localhost:5000/my-app:latest
```

The image now appears in the dashboard.

## Production deployment

### Option A — Podman on CentOS/RHEL (recommended)

Uses rootful Podman with systemd Quadlet units. All three containers (app, registry, db) run inside a single pod sharing the same network namespace. No Docker or docker-compose required.

#### 1. Install Podman

```bash
dnf install -y podman
```

#### 2. Configure

```bash
cp podman/config/app.env.example /etc/viceregistry/.env
# Edit /etc/viceregistry/.env — fill in all CHANGE_ME values
```

Key variables to set:

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgresql://viceregistry:<password>@localhost:5432/viceregistry` — use `localhost`, containers share network |
| `POSTGRES_PASSWORD` | Must match password in `DATABASE_URL` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `REGISTRY_URL` | `http://localhost:5000` — use `localhost` for the same reason |
| `REGISTRY_TOKEN_PRIVATE_KEY` | From `npm run keys:generate` |
| `REGISTRY_TOKEN_PUBLIC_KEY` | From `npm run keys:generate` |
| `REGISTRY_AUTH_TOKEN_REALM` | `https://registry.example.com/api/auth/token` |
| `REGISTRY_PUBLIC_HOST` | `registry.example.com` |
| `AWS_*` / `REGISTRY_STORAGE_S3_*` | S3 credentials (set both blocks — registry uses its own var names) |

If GHCR is private, authenticate first:

```bash
podman login ghcr.io
```

#### 3. Deploy

```bash
sudo ./podman/deploy.sh
```

The script:
1. Validates all required env vars
2. Writes the RSA public key to `/etc/viceregistry/certs/token.crt`
3. Installs Quadlet units to `/etc/containers/systemd/`
4. Pulls `ghcr.io/vicedomini-softworks/viceregistry:latest`, `postgres:17-alpine`, `registry:2`
5. Starts the pod → `db` (waits healthy) → `registry` → `app`
6. The app container runs migrations and seeds the admin user on first start

Re-deploy after a config change or image update:

```bash
sudo ./podman/deploy.sh
```

View logs:

```bash
journalctl -fu app.service
journalctl -fu db.service
journalctl -fu registry.service
```

#### Rotating RSA keys

```bash
# Update REGISTRY_TOKEN_PRIVATE_KEY and REGISTRY_TOKEN_PUBLIC_KEY in /etc/viceregistry/.env
sudo ./podman/deploy.sh   # rewrites the cert and restarts all services
```

---

### Option B — Docker Compose

#### Build the image

```bash
docker build -t viceregistry .
```

The Dockerfile is multi-stage (builder → runner), runs as a non-root user (uid 1001), and exposes port 4321. A health check pings `/api/health`.

#### Deploy with AWS S3

Use the production override file to swap MinIO for AWS S3:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Set these additional env vars in production:

```bash
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_REGION=us-east-1
S3_BUCKET=my-registry-bucket
S3_ENDPOINT_URL=   # leave blank for native AWS
```

---

### TLS (both options)

Put a reverse proxy (nginx, Caddy, Traefik) in front of the app and the registry. Docker requires HTTPS for registries unless the host is `localhost`.

Example Caddyfile:

```
registry.example.com {
  reverse_proxy localhost:4321
}
```

If the registry is on a separate port or subdomain, update `REGISTRY_PUBLIC_HOST` and `REGISTRY_URL` accordingly.

### Registry token realm

`REGISTRY_AUTH_TOKEN_REALM` must be the **externally reachable** URL of `/api/auth/token` — the URL Docker clients contact, not the internal container address:

```
REGISTRY_AUTH_TOKEN_REALM=https://registry.example.com/api/auth/token
```

## User roles

| Role | Pull | Push | Delete | User management |
|---|---|---|---|---|
| `viewer` | Yes | No | No | No |
| `push` | Yes | Yes | No | No |
| `admin` | Yes | Yes | Yes | Yes |

Manage users at `/admin/users` (admin only).

## Development commands

```bash
npm run dev          # start Astro dev server
npm run build        # production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run db:generate  # regenerate migration SQL from schema changes
npm run db:migrate   # apply pending migrations
npm run db:seed      # create/reset the admin user
npm run keys:generate  # regenerate RSA keypair
```

## Architecture

```
Browser
  └─ Astro SSR (node adapter)
       ├─ /api/auth/token    ← Docker Registry token endpoint (RS256 JWT)
       ├─ /api/auth/login    ← session cookie (HS256 JWT)
       ├─ /api/users/*       ← user CRUD (admin only)
       └─ /api/registry/*    ← proxy to registry v2 API

PostgreSQL  ← users, roles, user_roles, audit_log
registry:2  ← delegates auth to /api/auth/token
S3 / MinIO  ← image blob storage
```

Database schema is managed with [Drizzle ORM](https://orm.drizzle.team). Migrations live in `drizzle/migrations/`.
