# Skills Library

This directory contains auto-activating skills that provide comprehensive guidance for specific technologies and patterns.

## Structure

Each skill follows this structure:
```text
skill-name/
├── SKILL.md           # Main skill file (<500 lines)
└── resources/         # Detailed topic files
    ├── topic1.md
    ├── topic2.md
    └── topic3.md
```

## Available Skills

### python-development
Comprehensive Python development with modern frameworks and best practices.

**Resources** (7 files, 6,055+ lines):
- `django-guide.md` (675 lines) - Django models, DRF, authentication, testing, performance
- `fastapi-guide.md` (691 lines) - FastAPI application structure, Pydantic, async patterns, security
- `flask-guide.md` (550 lines) - Application factory, blueprints, SQLAlchemy, JWT authentication
- `async-patterns.md` (989 lines) - Async/await, asyncio, concurrent execution, testing async code
- `database-patterns.md` (943 lines) - SQLAlchemy 2.0, migrations, query optimization, N+1 prevention
- `testing-patterns.md` (991 lines) - pytest fixtures, parametrization, mocking, property-based testing
- `api-security.md` (1,216 lines) - JWT, OAuth2, rate limiting, OWASP Top 10

### typescript-development
Modern TypeScript development with frontend and backend patterns.

**Resources** (6 files, 7,432+ lines):
- `react-patterns.md` (709 lines) - React hooks, context, compound components, performance, error boundaries
- `nextjs-guide.md` (1,319 lines) - App Router, Server Components, data fetching, Server Actions, deployment
- `state-management.md` (1,355 lines) - Zustand, Redux Toolkit, TanStack Query, React Hook Form
- `api-development.md` (1,543 lines) - Express, tRPC, Fastify, Prisma, authentication, API testing
- `advanced-types.md` (1,188 lines) - Generics, conditional types, template literals, type guards, branded types
- `testing-guide.md` (1,318 lines) - Vitest, Testing Library, Playwright, mocking strategies, coverage

### terraform-infrastructure
Infrastructure as Code with Terraform for multi-cloud deployments.

**Resources** (6 files, 7,632+ lines):
- `aws-patterns.md` (767 lines) - 3-tier apps, serverless, Lambda + API Gateway, RDS, CloudFront
- `azure-patterns.md` (1,134 lines) - App Service, SQL Database, Key Vault, Container Instances, Front Door
- `gcp-patterns.md` (1,280 lines) - Compute Engine, Cloud SQL, Cloud Functions, Cloud Run, load balancing
- `modules-guide.md` (1,365 lines) - Reusable modules, input validation, outputs, testing, registry publishing
- `state-management.md` (1,482 lines) - Remote backends, locking, workspaces, state migration, disaster recovery
- `security-patterns.md` (1,604 lines) - Secrets management, IAM policies, encryption, audit logging, CIS benchmarks

### testing-best-practices
Testing strategies and patterns for all supported languages.

**Covers:**
- Testing pyramid
- Unit, integration, E2E testing
- Mocking and fixtures
- CI/CD integration
- Coverage strategies

## Auto-Activation

Skills automatically activate based on:
- **File patterns**: Detected file types in your workspace
- **Keywords**: Mentioned in your prompts
- **Context**: Working directory and git status

Configuration: `skill-rules.json`

## Adding New Skills

1. Create skill directory: `.claude/skills/your-skill/`
2. Add `SKILL.md` with overview and quick reference
3. Create `resources/` for detailed topics (keep each <500 lines)
4. Update `skill-rules.json` with trigger patterns
5. Test auto-activation by opening relevant files

## Best Practices

- Keep main SKILL.md under 500 lines (overview + navigation)
- Use resources/ for deep dives on specific topics
- Include code examples and patterns
- Provide both "good" and "bad" examples
- Link to official documentation
- Keep content current with latest versions
