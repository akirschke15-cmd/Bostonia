# Agent Auto-Activation System

## Overview

The agent auto-activation system intelligently detects the intent of your prompts and automatically loads the most relevant specialist agents into the conversation context. This ensures you always get expert-level assistance without needing to know which agents exist or manually invoke them.

> **⚠️ Current Status**: The auto-activation hook (`agent-activation-prompt`) is provided as an **optional enhancement** but may have limited functionality depending on your environment. Claude Code's hook execution environment has restricted PATH access which can prevent the hook from finding required utilities (`jq`, `grep`, `tr`, etc.).
>
> **Workaround**: Manual agent invocation always works reliably. Simply say "Use the [agent-name] agent to help with [task]" and Claude will load the appropriate specialist. See the [Manual Invocation](#manual-invocation) section below.
>
> **Future**: We're exploring alternative activation methods that don't rely on external utilities.

## Manual Invocation

Manual agent invocation is the **most reliable method** for working with specialized agents and always works regardless of your environment or auto-activation setup.

### How to Manually Invoke Agents

Simply use natural language to request a specific agent by name:

```
Use the [agent-name] agent to help with [task description]
```

### Examples

**Product Requirements:**
```
Use the product-manager agent to refine these requirements into user stories
```

**System Design:**
```
Use the system-architect agent to design the architecture for this microservices system
```

**Code Review:**
```
Use the code-reviewer agent to review this pull request for quality issues
```

**Implementation:**
```
I need the frontend-engineer agent to help build this React component
Use the backend-engineer agent to design this API endpoint
```

**Testing:**
```
Use the qa-engineer agent to create test cases for this feature
Use the test-architect agent to design our testing strategy
```

**Debugging:**
```
Help me debug this issue using the debugger agent
Use the performance-optimizer agent to identify bottlenecks
```

### Available Agents

See [Agents README](README.md) for the complete list of 19 available specialists and when to use each.

**Quick Reference:**

| Agent | Use When |
|-------|----------|
| product-manager | Refining requirements, creating user stories |
| system-architect | Designing system architecture, making technical decisions |
| api-designer | Designing REST/GraphQL APIs |
| ui-designer | Creating UI/UX designs, design systems |
| frontend-engineer | Building UI components, React/Vue development |
| backend-engineer | Building APIs, database design, backend services |
| fullstack-engineer | Full-stack features, end-to-end development |
| python-expert | Python language features, frameworks, patterns |
| typescript-expert | TypeScript/JavaScript language features |
| terraform-expert | Infrastructure as Code, multi-cloud deployments |
| qa-engineer | Test case creation, quality validation |
| test-architect | Testing strategy, test frameworks |
| code-reviewer | Pull request reviews, code quality |
| security-auditor | Security reviews, vulnerability scanning |
| devops-engineer | CI/CD pipelines, deployment strategies |
| technical-writer | Documentation, API docs, diagrams |
| debugger | Troubleshooting, root cause analysis |
| performance-optimizer | Performance tuning, bottleneck identification |

### When to Use Manual Invocation

**Always use manual invocation when:**
1. Auto-activation is not working or disabled
2. You want a specific agent that may not auto-activate
3. You need precise control over which agents assist
4. You're working in an environment without hook support
5. You want to ensure a particular specialist is consulted

**Manual invocation advantages:**
- ✅ **100% reliable** - Always works
- ✅ **Precise control** - Get exactly the agent you need
- ✅ **No dependencies** - Doesn't require external tools
- ✅ **Clear intent** - Explicitly documents which agent you want
- ✅ **Environment agnostic** - Works everywhere

### Combining Manual and Auto-Activation

You can use both methods together:
- Let auto-activation handle common scenarios
- Manually invoke when you need specific expertise
- Override auto-activation by explicitly requesting different agents

**Example:**
```
Use the security-auditor agent to review this code, even though you might
have auto-activated another agent. I specifically need security expertise.
```

## How It Works

### Architecture

```
User Prompt
    ↓
[UserPromptSubmit Hook] ← agent-activation-prompt
    ↓
[Prompt Analysis] ← Keyword, phrase, file pattern matching
    ↓
[Scoring Engine] ← Priority-weighted scoring algorithm
    ↓
[Agent Selection] ← Top 3 agents meeting confidence threshold
    ↓
[Context Injection] ← Full agent content loaded into prompt
    ↓
Claude Response (with agent expertise)
```

### Matching Algorithm

The system uses a multi-factor scoring algorithm:

#### 1. Keyword Matching (5-15 points per match)
- Searches for specific terms in your prompt
- Case-insensitive matching with word boundaries
- Examples: "API", "frontend", "test", "debug"
- Weight varies by agent priority:
  - **Critical**: 15 points (product-manager, qa-engineer, code-reviewer, security-auditor)
  - **High**: 10 points (system-architect, engineers, language experts)
  - **Medium**: 7 points (technical-writer)
  - **Low**: 5 points

#### 2. Phrase Matching (10-25 points per match)
- Searches for multi-word phrases indicating clear intent
- Higher weight than keywords due to stronger signal
- Examples: "review this code", "design the system", "create tests"
- Weight by priority:
  - **Critical**: 25 points
  - **High**: 20 points
  - **Medium**: 15 points
  - **Low**: 10 points

#### 3. File Pattern Matching (8 points per match)
- Analyzes current directory files and recently changed files
- Matches glob patterns like `**/*.ts`, `**/*.py`
- Provides context awareness based on what you're working on
- Examples:
  - `.tsx/.jsx` files → frontend-engineer, typescript-expert
  - `.py` files → python-expert, backend-engineer
  - `.tf` files → terraform-expert

#### 4. Anti-Pattern Matching (-10 points per match)
- Reduces score if conflicting keywords are detected
- Prevents inappropriate agent activation
- Example: "implement" reduces product-manager score (they define requirements, not implement)

#### 5. Priority Weighting
Agents have four priority levels that affect scoring:
- **Critical**: Requirements, testing, review, security
- **High**: Architecture, implementation, infrastructure
- **Medium**: Documentation, optimization
- **Low**: Utility agents

### Selection Process

1. **Score Calculation**: Each agent receives a total score based on all factors
2. **Threshold Filter**: Only agents with score ≥ 14 are considered (confidence threshold)
3. **Ranking**: Agents are sorted by score (highest first)
4. **Limit**: Top 3 agents are selected (configurable via `maxActiveAgents`)
5. **Context Injection**: Selected agent markdown files are injected into the prompt

## Configuration

### agent-rules.json Structure

```json
{
  "agents": [
    {
      "name": "agent-name",
      "path": ".claude/agents/path/to/agent.md",
      "description": "Short description",
      "triggers": {
        "keywords": ["keyword1", "keyword2"],
        "phrases": ["exact phrase match"],
        "filePatterns": ["**/*.ext"],
        "antiPatterns": ["conflicting", "keyword"]
      },
      "autoActivate": true,
      "priority": "critical|high|medium|low",
      "phase": "requirements|design|implementation|testing|review|deployment|documentation|troubleshooting"
    }
  ],
  "globalSettings": {
    "maxActiveAgents": 3,
    "confidenceThreshold": 0.7,
    "suggestionMode": "auto",
    "phaseAwareness": true,
    "contextWindow": 3
  }
}
```

### Global Settings

- **maxActiveAgents**: Maximum number of agents to activate simultaneously (default: 3)
- **confidenceThreshold**: Minimum confidence score (0-1) to activate (default: 0.7, corresponds to score ≥ 14)
- **suggestionMode**: "auto" enables automatic activation, "manual" disables
- **phaseAwareness**: Enable SDLC phase-based prioritization
- **contextWindow**: File search depth for pattern matching

## Examples

### Example 1: Requirements Gathering

**Prompt:**
```
I want to add a user authentication feature to my app
```

**Analysis:**
- "authentication" → backend-engineer (+10)
- "feature" → product-manager (+10), system-architect (+10)
- "user" → product-manager (+5), frontend-engineer (+5)

**Result:** Activates `product-manager` + `system-architect`

**Why:** Product manager helps define requirements and user stories, architect designs the auth system

---

### Example 2: Code Review Request

**Prompt:**
```
Please review this pull request for security issues
```

**Analysis:**
- "review" → code-reviewer (+15 critical)
- "pull request" → code-reviewer (+25 critical phrase)
- "security" → security-auditor (+15 critical)
- "security issues" → security-auditor (+25 critical phrase)

**Result:** Activates `code-reviewer` + `security-auditor`

**Why:** Code reviewer checks quality and best practices, security auditor focuses on vulnerabilities

---

### Example 3: Implementation Task

**Prompt:**
```
Help me implement the React component for the user profile page
```

**Analysis:**
- "React" → typescript-expert (+10), frontend-engineer (+10)
- "component" → frontend-engineer (+10)
- "implement" → product-manager (-10 anti-pattern)
- Context: Working in `.tsx` files → typescript-expert (+8), frontend-engineer (+8)

**Result:** Activates `frontend-engineer` + `typescript-expert`

**Why:** Frontend engineer guides UI patterns, TypeScript expert provides language-specific expertise

---

### Example 4: Bug Fixing

**Prompt:**
```
The app is crashing with a null pointer error in the Python API
```

**Analysis:**
- "crashing" → debugger (+10)
- "error" → debugger (+10)
- "Python" → python-expert (+10)
- "API" → backend-engineer (+10), api-designer (+10)
- Context: `.py` files → python-expert (+8), backend-engineer (+8)

**Result:** Activates `debugger` + `python-expert`

**Why:** Debugger provides troubleshooting methodology, Python expert knows language-specific debugging

---

### Example 5: Testing Strategy

**Prompt:**
```
We need to create a comprehensive test plan for the new API endpoints
```

**Analysis:**
- "test plan" → qa-engineer (+25 critical phrase), test-architect (+25 critical phrase)
- "test" → qa-engineer (+15), test-architect (+15)
- "API" → api-designer (+10)
- "comprehensive" → test-architect (+10)

**Result:** Activates `test-architect` + `qa-engineer`

**Why:** Test architect designs testing strategy, QA engineer creates test cases

## Customization

### Adding Custom Agents

1. **Create agent markdown file**:
   ```bash
   touch .claude/agents/custom/my-agent.md
   ```

2. **Add entry to agent-rules.json**:
   ```json
   {
     "name": "my-agent",
     "path": ".claude/agents/custom/my-agent.md",
     "description": "Specialized domain expertise",
     "triggers": {
       "keywords": ["domain", "specialized"],
       "phrases": ["work with domain"],
       "filePatterns": ["**/*.domain"]
     },
     "autoActivate": true,
     "priority": "high",
     "phase": "implementation"
   }
   ```

3. **Test activation**:
   ```
   Test prompt: "Help me work with domain-specific code"
   ```

### Tuning Activation Sensitivity

**Too many false positives?** (Agents activating when not needed)
- Increase `confidenceThreshold` in agent-rules.json (e.g., 0.8)
- Add more anti-patterns to agent definitions
- Make trigger keywords more specific
- Reduce keyword lists to most essential terms

**Missing activations?** (Agents not activating when needed)
- Decrease `confidenceThreshold` (e.g., 0.6)
- Add more keywords and phrases
- Add common synonyms and variations
- Increase agent priority level

### Adjusting Agent Count

**Want more agents active?**
```json
"maxActiveAgents": 3
```
⚠️ Warning: More agents = more context usage. May reduce response quality if too many.

**Want only the best match?**
```json
"maxActiveAgents": 1
```
✓ Benefit: Focused expertise, less context overhead

## Advanced Features

### Phase Awareness

The system tracks SDLC phases and can prioritize agents based on project state:

- **requirements** → product-manager prioritized
- **design** → system-architect, api-designer, ui-designer prioritized
- **implementation** → engineers and language experts prioritized
- **testing** → qa-engineer, test-architect prioritized
- **review** → code-reviewer, security-auditor prioritized
- **deployment** → devops-engineer prioritized
- **troubleshooting** → debugger, performance-optimizer prioritized

Enable with: `"phaseAwareness": true`

### Context-Aware Matching

The system analyzes:
- **Current directory files**: What files exist in your workspace
- **Recently changed files**: Files modified in git working tree
- **File patterns**: Matches glob patterns like `**/*.ts`

This provides implicit context without requiring you to mention file types.

### Fallback Behavior

If no agents meet the confidence threshold:
- No agents are activated
- Prompt passes through unchanged
- Claude responds with general capabilities
- You can still manually invoke agents

## Troubleshooting

### Hook Not Executing

1. **Check hook is executable**:
   ```bash
   chmod +x .claude/hooks/agent-activation-prompt
   ```

2. **Verify hook type in filename**: Must match pattern for UserPromptSubmit hooks

3. **Check for errors**:
   ```bash
   # Test hook manually
   echo "test prompt" | .claude/hooks/agent-activation-prompt
   ```

### jq Not Available

The hook requires `jq` for JSON parsing:

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (Git Bash)
# jq is usually included with Git for Windows
```

If `jq` is not available, the hook will silently pass through prompts unchanged.

### Debugging Activation

Add debug output to the hook (before `exit 0`):

```bash
# Add at the end of agent-activation-prompt
echo "DEBUG: Matched agents: ${MATCHED_AGENTS[*]}" >&2
echo "DEBUG: Scores: ${!AGENT_SCORES[*]}" >&2
```

This will print activation details to stderr without affecting the prompt.

### Testing Specific Scenarios

Create test prompts to validate matching:

```bash
# Test requirements detection
echo "I need help defining user stories for authentication" | \
  .claude/hooks/agent-activation-prompt | grep -A 5 "Auto-Activated"

# Test code review detection
echo "Please review this PR for security vulnerabilities" | \
  .claude/hooks/agent-activation-prompt | grep -A 5 "Auto-Activated"

# Test implementation detection
echo "Help me build a React component in TypeScript" | \
  .claude/hooks/agent-activation-prompt | grep -A 5 "Auto-Activated"
```

## Performance Considerations

### Context Usage

Each activated agent adds ~200-500 lines to the prompt context:
- **3 agents**: ~600-1500 lines
- **Impact**: Minimal (well within Claude's 200k token context)
- **Benefit**: Significantly improved response quality with multi-specialist collaboration

### Hook Execution Time

- **Typical**: < 50ms
- **With file scanning**: < 200ms
- **Impact**: Negligible for user experience

### Optimization Tips

1. Keep agent files concise (focus on patterns, not examples)
2. Use file pattern matching sparingly (most expensive operation)
3. Limit keyword lists to most discriminative terms
4. Set reasonable `maxActiveAgents` (3 is optimal for cross-cutting concerns)

## Best Practices

### Writing Effective Prompts

To get the best agent matches:

1. **Be specific**: "Design a REST API" vs "Help with API"
2. **Use domain terminology**: "authentication", "component", "test coverage"
3. **State your intent**: "review", "implement", "debug", "design"
4. **Mention technologies**: "React", "Python", "Terraform"

### Maintaining agent-rules.json

1. **Review activation patterns** after using the system
2. **Add missed keywords** when agents don't activate
3. **Prune excessive keywords** if too many false positives
4. **Test changes** with sample prompts
5. **Document custom additions** with comments (via separate docs)

### Agent Design

When creating agents:

1. **Clear expertise boundary**: Focus on specific domain
2. **Comprehensive triggers**: Cover variations and synonyms
3. **Anti-patterns**: Exclude conflicting scenarios
4. **Appropriate priority**: Be honest about criticality
5. **Concise content**: Keep agent files focused

## Future Enhancements

Potential improvements to the system:

- **LLM-based matching**: Use Claude Haiku for semantic understanding
- **Learning system**: Track activation quality and adjust weights
- **Phase detection**: Automatically detect project phase from git history
- **Multi-language support**: Better handling of non-English prompts
- **Confidence display**: Show why agents were selected
- **Agent chaining**: Sequential activation based on phase progression

## Learn More

- [Agents README](README.md) - Overview of all available agents
- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks) - Hook system reference
- [agent-rules.json](agent-rules.json) - Current configuration
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Guide for adding agents

---

**Last Updated**: 2025-11-06
**System Version**: 1.0.0
