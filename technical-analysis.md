# Technical Analysis

## Architecture Overview

ViceRegistry is an Astro 5 full-stack application providing a UI layer for Docker Registry v2, with integrated authentication and repository caching.

### Technology Stack

| Layer | Technology | Version |
|-------|-------------|---------|
| Framework | Astro | 5.x |
| UI Runtime | React | 19.x |
| Styling | Tailwind CSS | v4 |
| Components | shadcn/ui | latest |
| Database | PostgreSQL | 14+ |
| ORM | Drizzle | latest |
| Authentication | jose (JWT) | latest |
| Validation | Zod | latest |

## System Architecture

### Request Flow

```
Client Request
    │
    ▼
┌─────────────────┐
│  Middleware     │ ──► Auth verification, role checks
│  (src/middleware/index.ts)
└────────┬────────┘
         │
    ┌────▼────────────┐
    │  Route Handler │
    │  (Astro pages) │
    └────┬────────────┘
         │
    ┌────▼────────────┐
    │  Data Layer    │ ──► Repository sync, cache management
    │  (Drizzle)    │
    └────┬────────────┘
         │
    ┌────▼────────────┐
    │  External      │ ──► Docker Registry v2 API
    │  Integration   │
    └─────────────────┘
```

### Authentication Flow

1. **Web Sessions**: HTTP-only cookie with 8-hour HS256 JWT
2. **Docker Auth**: HTTP Basic → bcrypt verification → RS256 JWT scoped by roles

### Role-Based Access Control

ViceRegistry has two role systems:

**Docker Token Auth** (src/pages/api/auth/token.ts):
```
viewer   ──► pull only
push    ──► pull + push
admin   ──► pull + push + delete
```

**Organization Roles** (src/lib/schema.ts):
```
owner     ──► full org control
admin     ──► org management
developer ──► repository push access
member    ──► basic access
```

## Scalability Analysis

### Horizontal Scaling Requirements

For enterprise multi-node deployments:

1. **Application Layer**
   - Stateless Astro SSR instances (no local session state)
   - Load balancer with sticky sessions optional (JWT is verified client-side)
   - Horizontal scaling via replication behind standard load balancer

2. **Database Layer**
   - PostgreSQL connection pooling (pgbouncer or built-in)
   - Read replicas for query-heavy workloads
   - Write master for mutations

3. **Registry Cache**
   - Cached metadata uses 5-minute staleness threshold
   - For high-frequency updates, reduce staleness threshold
   - Consider Redis for distributed cache layer

4. **Shared State**
   - Session JWT verifiable without database (cryptographic verification)
   - No external session store required
   - Token signing key must be shared across instances

### Concurrency Limits

Current implementation:
- Registry sync: 8 concurrent requests (configurable in `registry-sync.ts`)
- Database: Drizzle connection pooling
- Per-instance limits apply

## Integration Points

### CI/CD Integration

Webhook endpoints support integration with CI/CD systems:

```
/api/auth/token      ──► Docker token issuance
/api/registry/*     ──► Repository management
/api/search         ──► Image discovery
```

Example GitHub Actions:

```yaml
- name: Login to Registry
  run: |
    echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login \
      registry.example.com -u "${{ secrets.REGISTRY_USER }}" --password-stdin
```

### Monitoring Integration

- **Health Endpoint**: `GET /api/health`
- **Metrics**: Custom instrumentation required for Prometheus export
- **Logging**: JSON structured logs to stdout
- **Tracing**: OpenTelemetry integration planned for future releases

## Performance Characteristics

### Typical Load Profiles

| Metric | Value |
|--------|-------|
| Startup Time | ~2s |
| Memory Usage | ~150MB |
| Sync Throughput | 8 concurrent requests |
| Response Time (cached) | <100ms |
| Response Time (fresh) | 500ms-2s |

### Optimization Strategies

1. **Caching**: Repository metadata cached in PostgreSQL
2. **Batched Sync**: Multiple repositories synced in single operation
3. **Lazy Loading**: React islands loaded on interaction
4. **Connection Pooling**: Reused database connections

## Security Considerations

- JWT tokens signed with RS256 (Docker) and HS256 (Web sessions)
- Passwords hashed with bcrypt
- No secrets in logs or error messages
- CSRF protection via middleware
- Session fixation prevention

## Known Limitations

1. **Multi-Instance Docker Auth**: Token signing key must be shared
2. **No Built-in Rate Limiting**: Rate limiting not yet implemented
3. **PostgreSQL Required**: SQLite not supported for production
4. **Single Registry**: One registry per instance

## Future Technical Directions

1. Redis caching layer for improved performance
2. Plugin system for extensibility
3. Prometheus metrics export
4. OpenTelemetry tracing
5. Multi-registry support
6. Rate limiting middleware