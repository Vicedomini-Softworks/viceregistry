# Contributor License Agreement

## Overview

ViceRegistry is a Docker Registry v2 UI built with Astro, React, and PostgreSQL. This project is maintained by **Vicedomini Softworks SRL** as part of our FOSS initiative.

## Maintainer

- **Organization**: Vicedomini Softworks SRL
- **Role**: Primary Maintainer
- **License**: MIT

## Contribution Guidelines

### Code Style

Adhere to the project's existing coding standards:
- No semicolons (Prettier ES5 config)
- Double quotes for strings
- 2-space indentation
- Trailing commas (ES5)
- 80-character line width
- Path alias `@/*` maps to `src/*`

### Architecture Conventions

- Pages own server-side data fetching
- React components receive props and handle interactivity
- Astro + React islands via `client:load`
- Drizzle ORM for database operations
- Tailwind v4 for styling
- shadcn/ui for components

### Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Write or update tests
4. Ensure all tests pass (`npm run test` or `npm run test:watch`)
5. Run type checking (`npm run typecheck`)
6. Run linter (`npm run lint`)
7. Submit a pull request with a clear description of changes

### Code Review

All contributions undergo review by Vicedomini Softworks SRL maintainers. Review criteria:
- Code quality and adherence to conventions
- Test coverage
- Security considerations
- Performance implications
- Documentation completeness

## Security Policy

Security issues should be reported privately to the maintainer. Do not disclose vulnerabilities in public issues or pull requests.

## License

By contributing, you agree that your contributions will be licensed under the MIT License, matching the project's license.