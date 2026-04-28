# Project Status

## Current State

**ViceRegistry** is an actively maintained Docker Registry v2 UI project.

### Repository Vitality

- **Active Development**: Regular commits with feature additions and bug fixes
- **Recent Activity**: Continuous development cycle with iterative improvements
- **Focus Areas**:
  - Repository synchronization enhancements
  - User interface improvements (Toaster, SyncButton, confirmation dialogs)
  - Token generation for M2M services
  - Visibility and tag management
  - Scroll and UX refinements

### Release Cadence

- Development follows semantic versioning
- Changes tracked in git history with clear commit messages
- Production-ready builds via Docker containerization

## Architecture Maturity

- **Production Deployment**: Ready with Docker Compose and nginx templating
- **Security**: JWT-based authentication (HS256 for sessions, RS256 for Docker tokens)
- **Database**: PostgreSQL with Drizzle ORM
- **Testing**: Vitest with coverage reporting
- **CI/CD**: GitHub Actions for build and test automation

## Scalability Considerations

### Horizontal Scaling

Current architecture supports horizontal scaling through:

1. **Stateless Application**: Astro SSR instances are stateless
2. **Database**: PostgreSQL can be scaled via read replicas
3. **Caching**: Repository metadata cached in database with staleness thresholds
4. **Concurrency**: Registry sync operations limited to 8 concurrent requests

### Enterprise Multi-Node

For multi-node deployments:
- Application layer can be distributed across multiple instances
- Database connection pooling required for high availability
- Docker token auth is per-instance; consider single shared instance for token issuance

## Integration Ecosystem

### CI/CD Integration

ViceRegistry can integrate with:

- **GitHub Actions**: Automated builds and deployments
- **GitLab CI**: Pipeline integration for registry management
- **Jenkins**: Custom pipeline steps for registry operations
- **Docker Hub**: Standard Docker CLI authentication flow

### Monitoring

Recommended integration points:

- **Prometheus**: Export metrics via custom instrumentation
- **Grafana**: Dashboard templates for registry health
- **Logging**: Structured JSON logs for centralized aggregation
- **Health Checks**: `/api/health` endpoint for load balancer integration

## Roadmap

### Planned Features

1. **Advanced Search**: Full-text search with fuzzy matching
2. **Image Layer Management**: Layer-level operations and cleanup
3. **Webhook Support**: Event notifications for registry operations
4. **Rate Limiting**: Configurable request throttling
5. **Audit Logging**: Comprehensive operation tracking
6. **Multi-Repository Views**: Organized repository collections
7. **API Rate Limiting**: Token-based rate limiting for Docker auth

### Technical Improvements

1. **Horizontal Scaling**: Multi-instance token auth support
2. **Caching Layer**: Redis integration for improved performance
3. **Plugin System**: Extensibility for custom features
4. **Performance Optimization**: Bundle splitting and lazy loading
5. **Accessibility**: Enhanced WCAG compliance

## Governance

### FOSS Philosophy

ViceRegistry is developed under the MIT License, allowing:
- Commercial use
- Modification
- Distribution
- Patent use
- Private use

### Contribution Model

Open to community contributions through pull requests. All contributions:
- Reviewed by Vicedomini Softworks SRL
- Licensed under MIT
- Expected to follow coding standards
- Subject to security and quality review

### Decision Making

Technical decisions are made by the maintainer (Vicedomini Softworks SRL) with community input. Major architectural changes discussed in issues and pull requests.

## Version History

- **Current**: Active development
- **Stability**: Production-ready with bug fixes and feature enhancements
- **Support**: Maintained by Vicedomini Softworks SRL