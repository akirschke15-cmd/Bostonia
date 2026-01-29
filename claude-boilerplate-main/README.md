# Claude Code Boilerplate

A comprehensive, production-ready boilerplate configuration for Claude Code that provides intelligent agents, auto-activating skills, and automation hooks for modern software development. Optimized for Python, TypeScript, and Terraform projects covering the complete software development lifecycle (SDLC).

## Features

- **🤖 Intelligent Agents** - 19 specialized agents including language experts, role specialists (frontend, backend, fullstack, QA), architecture (system, API, UI design), quality, infrastructure, documentation, and troubleshooting
- **⚡ Auto-Activating Skills** - Context-aware skills that load automatically based on file types and project context
- **🎯 Language Support** - First-class support for Python, TypeScript/JavaScript, and Terraform
- **🔄 SDLC Coverage** - Complete lifecycle support from design to deployment
- **🔐 Security First** - Built-in security best practices and auditing
- **🧪 Testing Focus** - Comprehensive testing strategies and automation
- **📚 Documentation** - Rich documentation and examples for all components

## Quick Start

### 1. Copy Configuration to Your Project

```bash
# Clone this repository
git clone https://github.com/your-org/claude-boilerplate.git

# Copy .claude directory to your project
cp -r claude-boilerplate/.claude /path/to/your/project/

# Make hooks executable (Unix/Mac)
chmod +x /path/to/your/project/.claude/hooks/*
```

### 2. Customize Settings

Edit `.claude/settings.json` to match your project needs:

```json
{
  "customSettings": {
    "projectType": "multi-language",
    "supportedLanguages": ["python", "typescript", "terraform"],
    "preferredFrameworks": {
      "python": ["fastapi", "django"],
      "typescript": ["react", "nextjs"]
    }
  }
}
```

### 3. Start Using Claude Code

Skills will automatically activate based on your context:

```bash
# Working with Python
code myapp.py  # python-development skill loads automatically

# Working with TypeScript
code App.tsx  # typescript-development skill loads automatically

# Working with Terraform
code main.tf  # terraform-infrastructure skill loads automatically
```

## Directory Structure

```text
.claude/
├── agents/                        # Specialized AI agents
│   ├── 01-language-specialists/   # Python, TypeScript, Terraform experts
│   ├── 02-role-specialists/       # Frontend, Backend, Fullstack, QA engineers
│   ├── 03-architecture/           # System architect, API designer
│   ├── 04-quality/                # Code reviewer, test architect, security auditor
│   ├── 05-infrastructure/         # DevOps engineer
│   ├── 06-documentation/          # Technical writer
│   └── 07-troubleshooting/        # Debugger, performance optimizer
│
├── skills/                        # Auto-activating knowledge modules
│   ├── python-development/        # Python best practices
│   ├── typescript-development/    # TypeScript patterns
│   ├── terraform-infrastructure/  # Infrastructure as Code
│   ├── testing-best-practices/    # Testing strategies
│   └── skill-rules.json           # Auto-activation triggers
│
├── hooks/                         # Automation hooks
│   ├── skill-activation-prompt    # Auto-suggest relevant skills
│   └── post-tool-use-tracker      # Track tool usage
│
├── commands/                      # Slash commands
│   ├── review.md                  # /review - Code review
│   ├── test.md                    # /test - Run tests
│   └── deploy.md                  # /deploy - Deployment guide
│
└── settings.json                  # Configuration
```

## Agents

This boilerplate uses a **hybrid agent architecture** combining language specialists with role-based specialists:

- **Language Specialists** (Python, TypeScript, Terraform) - Deep expertise in language features, syntax, and ecosystem
- **Role Specialists** (Frontend, Backend, Fullstack, QA) - Applied expertise in specific engineering roles
- **Specialized Agents** (Architecture, Quality, Infrastructure, Documentation, Troubleshooting) - Domain-specific expertise

**When to use which:**
- Use **Language Specialists** when focusing on language-specific features, patterns, or best practices
- Use **Role Specialists** when building features or applications (they compose language knowledge with practical patterns)
- Use **Specialized Agents** for specific concerns (architecture decisions, security audits, performance optimization)

### Language Specialists

#### Python Expert (`01-language-specialists/python-expert.md`)
- Modern Python best practices (3.10+)
- FastAPI, Django, Flask expertise
- Type hints and Pydantic validation
- pytest testing patterns
- Async/await patterns

**When to use:** Python development, API building, data processing

#### TypeScript Expert (`01-language-specialists/typescript-expert.md`)
- Strict TypeScript configuration
- React, Next.js, Node.js patterns
- Advanced type patterns (generics, conditionals, mapped types)
- tRPC for type-safe APIs
- Testing with Vitest/Jest

**When to use:** TypeScript/JavaScript development, frontend/backend applications

#### Terraform Expert (`01-language-specialists/terraform-expert.md`)
- Multi-cloud infrastructure (AWS, Azure, GCP)
- Module development
- State management best practices
- Security and compliance
- CI/CD integration

**When to use:** Infrastructure provisioning, IaC development

### Role Specialists

#### Frontend Engineer (`02-role-specialists/frontend-engineer.md`)
- React/Next.js/Vue expertise
- Component architecture and design systems
- State management (Zustand, Redux, TanStack Query)
- Performance optimization (Core Web Vitals)
- Accessibility (WCAG, a11y)
- CSS-in-JS, Tailwind, styling solutions
- E2E testing with Playwright

**When to use:** Building UIs, frontend applications, React/Vue development, performance optimization, design system implementation

#### Backend Engineer (`02-role-specialists/backend-engineer.md`)
- API development (REST, GraphQL, tRPC)
- Database architecture (SQL, NoSQL, ORMs)
- Authentication & authorization (JWT, OAuth)
- Python (FastAPI, Django, Flask) and TypeScript (Express, NestJS) backends
- Microservices and distributed systems
- Caching, background jobs, message queues
- Security best practices (OWASP Top 10)

**When to use:** Building APIs, backend services, database design, authentication systems, microservices architecture

#### Fullstack Engineer (`02-role-specialists/fullstack-engineer.md`)
- End-to-end application development
- Type-safe full-stack patterns (tRPC, Next.js Server Actions)
- Frontend + backend integration
- Real-time communication (WebSockets, SSE)
- File upload/download handling
- Monorepo architecture
- Authentication flows across the stack

**When to use:** Complete feature development (UI to database), full-stack applications, Next.js/Nuxt projects, type-safe APIs

#### QA Engineer (`04-quality/qa-engineer.md`)
- Test strategy and automation
- Unit, integration, and E2E testing
- Testing frameworks (pytest, Vitest, Jest, Playwright)
- Test data management and factories
- CI/CD test pipelines
- Quality metrics and coverage
- Performance and security testing

**When to use:** Test strategy design, test automation setup, quality gates, CI/CD testing, debugging flaky tests

### Architecture

#### System Architect (`03-architecture/system-architect.md`)
- Architecture patterns (microservices, monolith, serverless)
- Technology stack selection
- Scalability and reliability design
- Architecture Decision Records (ADRs)
- Migration strategies

**When to use:** System design, architecture reviews, technology selection

#### API Designer (`03-architecture/api-designer.md`)
- RESTful API design
- GraphQL schema design
- gRPC service definition
- API versioning strategies
- Authentication and rate limiting

**When to use:** API design, endpoint specification, API documentation

#### UI Designer (`03-architecture/ui-designer.md`)
- Design systems and component libraries
- Accessibility-first design (WCAG 2.1 Level AA)
- Responsive and adaptive design
- Design tokens and style guides
- Interaction design and micro-interactions
- User experience patterns and flows
- Design specifications and handoff to frontend

**When to use:** UI/UX design, design systems creation, visual design specifications, accessibility design, design handoff before frontend implementation

### Quality Assurance

#### Code Reviewer (`04-quality/code-reviewer.md`)
- Comprehensive code review checklist
- Security vulnerability detection
- Performance analysis
- Test coverage assessment
- Constructive feedback patterns

**When to use:** Pull request reviews, code quality audits

#### Test Architect (`04-quality/test-architect.md`)
- Testing pyramid strategy
- Unit, integration, E2E testing
- Property-based testing
- Test automation in CI/CD
- Coverage goals and metrics

**When to use:** Test strategy design, test implementation, quality gates

#### Security Auditor (`04-quality/security-auditor.md`)
- OWASP Top 10 coverage
- Authentication and authorization
- Secrets management
- Infrastructure security
- Compliance (GDPR, PCI DSS, SOC 2)

**When to use:** Security reviews, vulnerability assessment, compliance

### Infrastructure

#### DevOps Engineer (`05-infrastructure/devops-engineer.md`)
- CI/CD pipeline design
- Container orchestration (Kubernetes, Docker)
- Deployment strategies (blue-green, canary)
- Monitoring and observability
- Disaster recovery

**When to use:** Pipeline setup, deployment automation, infrastructure operations

### Documentation

#### Technical Writer (`06-documentation/technical-writer.md`)
- README templates
- API documentation
- User guides
- Architecture documentation
- Runbooks and changelogs

**When to use:** Documentation creation, technical writing, knowledge transfer

### Troubleshooting

#### Debugger (`07-troubleshooting/debugger.md`)
- Systematic debugging approaches
- Stack trace analysis
- Profiling and instrumentation
- Memory leak detection
- Race condition debugging
- Python (pdb, logging), TypeScript (DevTools), Infrastructure debugging

**When to use:** Bug investigation, error analysis, troubleshooting test failures, post-mortem analysis

#### Performance Optimizer (`07-troubleshooting/performance-optimizer.md`)
- Performance profiling and analysis
- Bottleneck identification
- Code optimization patterns
- Database query optimization
- Caching strategies
- Infrastructure scaling
- Performance monitoring and metrics

**When to use:** Performance issues, optimization needs, cost reduction, load testing, monitoring setup

## Skills

Skills are automatically loaded based on file types and context:

### Python Development
**Triggers:** `*.py`, `pyproject.toml`, `requirements.txt`, keywords like "python", "pytest"

**Main Skill:** Comprehensive Python development guide with modern best practices

**Resource Files:**
- `resources/django-guide.md` - Complete Django framework patterns (models, DRF, authentication, testing, performance)
- `resources/fastapi-guide.md` - FastAPI application structure (Pydantic schemas, dependencies, async patterns, testing)

**Includes:**
- Modern Python setup (pyproject.toml)
- Type hints and Pydantic validation
- FastAPI, Django, Flask expertise
- pytest testing patterns
- Async/await patterns
- Common patterns (context managers, decorators)

### TypeScript Development
**Triggers:** `*.ts`, `*.tsx`, `package.json`, keywords like "typescript", "react"

**Main Skill:** Modern TypeScript development with advanced patterns

**Resource Files:**
- `resources/react-patterns.md` - React with TypeScript (hooks, context, compound components, performance optimization, error boundaries)

**Includes:**
- Strict TypeScript configuration
- Advanced type patterns (generics, conditionals, mapped types, utility types)
- React hooks and patterns
- API development (Express, tRPC, Fastify)
- Testing with Vitest/Jest
- Performance optimization

### Terraform Infrastructure
**Triggers:** `*.tf`, `*.tfvars`, keywords like "terraform", "infrastructure"

**Main Skill:** Infrastructure as Code with Terraform for multi-cloud deployments

**Resource Files:**
- `resources/aws-patterns.md` - AWS infrastructure patterns (3-tier architecture, serverless, static sites with CloudFront, Lambda + API Gateway)

**Includes:**
- Project structure and organization
- AWS/Azure/GCP patterns
- Module development and reusability
- State management and backends
- Security best practices (least privilege, secrets management)
- CI/CD integration

### Testing Best Practices
**Triggers:** Test files, keywords like "test", "testing", "coverage"

**Main Skill:** Comprehensive testing strategies across all languages

**Includes:**
- Testing pyramid strategy
- Python testing with pytest (fixtures, parametrization, mocking)
- TypeScript testing with Vitest/Jest
- Integration and E2E testing (Playwright)
- Mocking patterns and test doubles
- CI/CD integration
- Coverage goals and metrics
- Testing anti-patterns to avoid

## Slash Commands

### `/review` - Code Review
Comprehensive code review focusing on:
- Code quality and best practices
- Type safety
- Security vulnerabilities
- Testing coverage
- Performance implications
- Documentation

### `/test` - Run Tests
Executes tests and analyzes:
- Test execution (pytest, npm test)
- Coverage analysis
- Failed tests
- Coverage gaps
- Recommendations

### `/deploy` - Deployment Guide
Deployment process with:
- Pre-deployment checklist
- Platform-specific steps (AWS, Kubernetes, Serverless)
- Post-deployment validation
- Rollback procedures
- Monitoring checklist

## Hooks

### Skill Activation Prompt
**Type:** `UserPromptSubmit`

Automatically analyzes your prompts and file context to suggest relevant skills. When you start working with Python files, it suggests the python-development skill.

### Post-Tool-Use Tracker
**Type:** `PostToolUse`

Tracks tool usage and provides contextual reminders (e.g., "Consider running tests after code changes").

## Configuration

### settings.json

Key configuration options:

```json
{
  "skills": {
    "enabled": true,
    "autoActivate": true,
    "maxActive": 3
  },
  "hooks": {
    "enabled": true
  },
  "agents": {
    "autoSuggest": true
  },
  "security": {
    "scanOnCommit": true,
    "preventSecretsCommit": true
  }
}
```

## Customization

### Adding Custom Agents

1. Create a new markdown file in the appropriate `agents/` subdirectory
2. Follow the template structure:

```markdown
# Agent Name

## Role
[Description of the agent's expertise]

## Core Responsibilities
[What the agent does]

## Activation Context
[When to use this agent]
```

### Adding Custom Skills

1. Create a new directory in `.claude/skills/`
2. Add `SKILL.md` with skill content
3. Create `resources/` subdirectory for detailed topics
4. Update `skill-rules.json` with triggers:

```json
{
  "name": "my-skill",
  "triggers": {
    "filePatterns": ["**/*.ext"],
    "keywords": ["keyword1", "keyword2"]
  },
  "autoActivate": true
}
```

### Adding Slash Commands

Create a new markdown file in `.claude/commands/`:

```markdown
# My Command

Description of what this command does.

## Steps
1. Step 1
2. Step 2

## Example
[Provide examples]
```

## Best Practices

### For Python Projects
- Use `pyproject.toml` for modern dependency management
- Enable strict type checking with mypy
- Use ruff for linting and formatting
- Write tests with pytest
- Use Pydantic for validation

### For TypeScript Projects
- Enable strict mode in `tsconfig.json`
- Avoid `any` types, use `unknown` instead
- Use Zod or similar for runtime validation
- Implement proper error handling
- Write tests with Vitest or Jest

### For Terraform Projects
- Use remote state with locking
- Create reusable modules
- Pin provider versions
- Never commit secrets
- Use workspaces for environments

## Examples

### Example: Building a React Dashboard (Frontend-Focused)

1. Claude detects `.tsx` files → `typescript-development` skill auto-loads
2. **Use UI Designer agent** for design specifications, layout, and component design
3. **Use Frontend Engineer agent** for component implementation and state management
4. Use API Designer agent for endpoint contracts
5. Use QA Engineer agent for component testing strategy
6. Run `/review` before committing

**Why UI Designer first?** Creates design specifications, ensures accessibility, defines design tokens before implementation
**Why Frontend Engineer?** Implements designed components with React, state management, performance optimization

### Example: Building a FastAPI Backend (Backend-Focused)

1. Claude detects `.py` files → `python-development` skill auto-loads
2. **Use Backend Engineer agent** for API design and database architecture
3. Use Security Auditor for authentication implementation
4. Use QA Engineer agent for integration testing
5. Use Python Expert for async patterns or advanced language features
6. Run `/test` to verify coverage

**Why Backend Engineer?** Focused on APIs, databases, authentication - practical backend concerns

### Example: Full-Stack Feature (E2E Development)

1. Claude detects both `.tsx` and `.py` files → Multiple skills auto-load
2. **Use UI Designer agent** for UI/UX specifications
3. **Use Fullstack Engineer agent** for end-to-end feature design
4. Use Backend Engineer for API implementation
5. Use Frontend Engineer for UI implementation
6. Use QA Engineer for E2E testing with Playwright
7. Run `/review` and `/test` before committing

**Why UI Designer first?** Establishes design specifications and user experience flows
**Why Fullstack Engineer?** Coordinates frontend + backend integration, type-safe APIs, real-time features

### Example: Infrastructure Deployment

1. Claude detects `.tf` files → `terraform-infrastructure` skill auto-loads
2. Use Terraform Expert for module design
3. Use Security Auditor for security review
4. Use DevOps Engineer for CI/CD pipeline
5. Run `/deploy` with deployment checklist

### Example: Language-Specific Deep Dive

**Scenario:** Implementing complex Python async patterns with context managers

1. **Use Python Expert agent** for advanced language features
2. Use Code Reviewer for code quality check
3. Use QA Engineer for testing async code

**Why Python Expert?** Focus on language-specific features like async/await, context managers, decorators

## Troubleshooting

### Skills Not Auto-Activating

1. Check `.claude/skills/skill-rules.json` exists
2. Verify hooks are executable: `chmod +x .claude/hooks/*`
3. Check settings.json: `"skills.autoActivate": true`

### Hooks Not Running

1. Ensure hooks are executable
2. Check hook scripts for syntax errors
3. Verify hooks are enabled in settings.json

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this boilerplate.

## License

MIT License - feel free to use and modify for your projects.

## Resources

- [Claude Code Documentation](https://docs.claude.com/claude-code)
- [Skills Guide](https://docs.claude.com/claude-code/skills)
- [Agents Guide](https://docs.claude.com/claude-code/agents)

## Acknowledgments

Based on best practices from:
- [claude-code-infrastructure-showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
- [wshobson/agents](https://github.com/wshobson/agents)
- [aaronnam/claude-code-config](https://github.com/aaronnam/claude-code-config)

## Support

For issues or questions:
- Check the troubleshooting section above
- Review agent and skill documentation
- Consult official Claude Code documentation

---

Built with ❤️ for productive development with Claude Code
