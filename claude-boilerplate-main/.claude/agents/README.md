# Agents Directory

This directory contains specialized agents that provide expert assistance across different phases of the Software Development Lifecycle (SDLC) and programming domains.

## Architecture

This boilerplate uses a **hybrid architecture** combining three types of specialists:

### 0. Product Management
- **product-manager** - Requirements analysis, user stories, acceptance criteria, PRD creation

**When activated:** Translating raw requirements into implementation-ready specifications

### 1. Language Specialists (Domain Experts)
- **python-expert** - Python frameworks, async patterns, testing
- **typescript-expert** - React, Next.js, state management, TypeScript advanced types
- **terraform-expert** - Infrastructure as Code, multi-cloud patterns, security

**When activated:** Language-specific work (coding, debugging, architecture within that language)

### 2. Role Specialists (SDLC Phase Experts)

#### Engineering Roles
- **frontend-engineer** - UI/UX patterns, React, accessibility, responsive design
- **backend-engineer** - Service architecture, APIs, databases, scalability
- **fullstack-engineer** - Full-stack development combining frontend and backend expertise

#### Architecture & Design
- **system-architect** - System design, architecture decisions, trade-offs
- **api-designer** - RESTful/GraphQL API design, versioning, documentation
- **ui-designer** - UI/UX design, design systems, accessibility, responsive design

#### Quality Assurance
- **qa-engineer** - Test strategy, test case generation, quality validation
- **test-architect** - Testing architecture, coverage analysis, test frameworks
- **code-reviewer** - Code quality, security vulnerabilities, best practices
- **security-auditor** - OWASP Top 10, dependency scanning, secure coding patterns

#### Infrastructure & Operations
- **devops-engineer** - CI/CD pipelines, deployment strategies, infrastructure automation

#### Documentation & Support
- **technical-writer** - Technical writing, API docs, architecture diagrams

#### Troubleshooting & Performance
- **debugger** - Debugging strategies, root cause analysis, systematic investigation
- **performance-optimizer** - Profiling, bottleneck identification, optimization strategies

**When activated:** Phase-specific work (reviewing PRs, designing systems, optimizing performance, etc.)

## Development Workflow

This boilerplate implements a complete SDLC workflow:

```
Raw Requirements
    ↓
[Product Manager] ← Creates user stories, acceptance criteria, PRDs
    ↓
[System Architect] ← Designs architecture, makes technical decisions
    ↓
┌─────────────────────────────────────┐
│  Design Phase (Parallel Activities) │
├─────────────────────────────────────┤
│ [API Designer]  ← API contracts     │
│ [UI Designer]   ← UI/UX specs       │
└─────────────────────────────────────┘
    ↓
[Implementation Teams] ← Frontend/Backend/Fullstack Engineers + Language Specialists
    ↓
[QA Engineer] ← Tests functionality, validates acceptance criteria
    ↓
[Code Reviewer] ← Reviews code quality, security, best practices
    ↓
Production Ready ✓
```

### Parallel Activities
Throughout the workflow, these agents can be engaged as needed:
- **Security Auditor** - Security reviews at any phase
- **Performance Optimizer** - Performance tuning and profiling
- **DevOps Engineer** - CI/CD, deployment, infrastructure
- **Technical Writer** - Documentation creation
- **Debugger** - Troubleshooting and issue resolution

## How It Works

### Automatic Agent Activation ⭐ NEW (Optional)
Agents can be **automatically activated** based on your prompt content! The system intelligently matches your request to the most appropriate specialists:

> **Note**: Auto-activation is currently an experimental feature that may not work in all environments due to Claude Code's restricted hook execution environment. **Manual invocation** (see below) is the recommended and most reliable method.

**How it works:**
1. You submit a prompt (e.g., "I need to add a user authentication feature")
2. The `agent-activation-prompt` hook analyzes your prompt for:
   - **Keywords**: "authentication", "API", "frontend", etc.
   - **Phrases**: "review this code", "design the system", etc.
   - **File context**: Working with `.py`, `.ts`, `.tf` files
   - **Change context**: Files you've recently modified
3. The system scores each agent based on relevance and priority
4. Top 2 most relevant agents are auto-activated with their full context
5. Claude responds using the activated agent expertise

**Example:** If you say "Help me design a REST API for user management", the system will automatically activate:
- `api-designer` (matches "REST API" phrase)
- `backend-engineer` (matches "user management" context)

**Configuration:** `.claude/agents/agent-rules.json`

**Smart Features:**
- **Phase awareness**: Prioritizes agents based on SDLC phase
- **Anti-patterns**: Avoids wrong agent (e.g., won't activate product-manager for "debug this bug")
- **Priority weighting**: Critical agents (product-manager, qa-engineer, code-reviewer) score higher
- **Context sensitivity**: Considers your current files and recent changes
- **Score-based ranking**: Only activates agents meeting confidence threshold (70%)

### Manual Invocation (Recommended)
You can explicitly request agents using natural language - this is the **most reliable method**:
```
Use the product-manager agent to refine these requirements
Use the system-architect agent to design the solution
Use the qa-engineer agent to create test cases
Help me with this using the debugger agent
I need the frontend-engineer agent for this React component
```

This method always works regardless of your environment and gives you precise control over which agents assist you.

### Skills Auto-Activation
Related skills are also auto-activated based on:
1. **File patterns** - Working with `.tf` files → terraform-infrastructure skill
2. **Keywords** - "python" → python-development skill
3. **Task context** - Testing keywords → testing-best-practices skill

Configuration: `.claude/skills/skill-rules.json`

### Progressive Disclosure
Each agent uses a two-tier structure:
- **Main file** - Core patterns and quick reference (loaded in context)
- **Resource files** - Deep-dive guides (referenced, loaded on-demand)

This prevents context overload while maintaining depth.

## Agent Selection Guide

| Task | Agent | Why |
|------|-------|-----|
| Refine raw requirements | product-manager | User stories, acceptance criteria, PRDs |
| Design new system | system-architect | Architecture patterns, trade-offs |
| Design API | api-designer | REST/GraphQL best practices |
| Design UI/UX | ui-designer | Design systems, accessibility, visual design |
| Build UI component | frontend-engineer | React patterns, accessibility, responsive design |
| Build backend service | backend-engineer | Service architecture, APIs, scalability |
| Full-stack feature | fullstack-engineer | End-to-end development |
| Python development | python-expert | Python frameworks, async, testing |
| TypeScript/React work | typescript-expert | TypeScript, React, Next.js patterns |
| Terraform/IaC | terraform-expert | Infrastructure as code, multi-cloud |
| Create test strategy | test-architect | Testing architecture, frameworks |
| Validate functionality | qa-engineer | Test cases, quality validation |
| Review pull request | code-reviewer | Code quality, security, best practices |
| Security audit | security-auditor | OWASP, vulnerability scanning |
| Setup CI/CD | devops-engineer | Pipeline patterns, deployment |
| Write API docs | technical-writer | Technical writing, diagrams |
| Debug production issue | debugger | Root cause analysis, systematic debugging |
| App running slow | performance-optimizer | Profiling, bottleneck analysis |

## Creating Custom Agents

1. Create `my-agent.md` in this directory
2. Follow the structure:
   ```markdown
   # Agent Name
   Brief description of expertise

   ## Core Competencies
   - Skill 1
   - Skill 2

   ## Resources
   - resource-1.md - Description

   ## When to Use
   Activation scenarios
   ```
3. Add auto-activation rules to `skill-rules.json`
4. (Optional) Create resource files in `resources/my-agent/`

## Tips for Effective Use

1. **Be specific in requests** - "Review this code for security issues" > "Look at this"
2. **Combine agents** - Use python-specialist + test-engineer for Python testing
3. **Reference resources** - Ask "Show me the FastAPI patterns from resources"
4. **Check activation** - Look for "🎯 Activated: agent-name" in responses
5. **Override when needed** - Explicitly request an agent if auto-activation misses

## Troubleshooting

**Agent not activating automatically?**
- Check `agent-rules.json` for trigger patterns
- Verify you have `jq` installed (`brew install jq` or `apt-get install jq`)
- Use more specific keywords in your prompt
- Lower `confidenceThreshold` in `agent-rules.json` (default: 0.7)
- Use explicit request: "Use the X agent to help with Y"
- Check hook is executable: `chmod +x .claude/hooks/agent-activation-prompt`

**Wrong agent activating?**
- Make your prompt more specific
- Add anti-pattern keywords to agent-rules.json
- Use explicit agent request to override
- Adjust keyword weights in the hook script

**Too many agents active?**
- Reduce `maxActiveAgents` in `agent-rules.json` (currently 2)
- More focused requests activate fewer agents
- Increase `confidenceThreshold` to be more selective

**Skills vs Agents - What's the difference?**
- **Skills**: Resource libraries (patterns, examples, guides) loaded as reference
- **Agents**: Specialized personas with expertise that guide implementation
- Both can be auto-activated based on context
- Skills use `.claude/skills/skill-rules.json`
- Agents use `.claude/agents/agent-rules.json`

**Need different expertise?**
- Create custom agents in this directory
- Add activation rules to `agent-rules.json`
- Extend existing agents with new resources
- Adjust trigger patterns to your workflow

## Statistics

- **Total agents**: 19 agents
  - 1 Product Management
  - 3 Language Specialists
  - 3 Engineering Roles
  - 3 Architecture & Design
  - 4 Quality Assurance
  - 1 Infrastructure & Operations
  - 1 Documentation & Support
  - 2 Troubleshooting & Performance
  - 1 Orchestration (in main README)
- **Coverage**: Complete SDLC (requirements → production)

## Learn More

- [Skills README](../skills/README.md) - Detailed resource documentation
- [Contributing Guide](../../CONTRIBUTING.md) - Adding new agents
- [Claude Code Docs](https://docs.claude.com/en/docs/claude-code) - Official documentation
