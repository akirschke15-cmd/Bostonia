# Hybrid Agent Strategy

This document explains when Claude should use **visible agent execution** (Task tool) vs. **silent context injection** (hooks) for optimal workflow visibility and efficiency.

---

## 🚨 CRITICAL DIRECTIVE: Hook Agent Priority

**When a hook activates a specific agent, that is a DIRECTIVE, not a suggestion.**

### The Rule

IF hook injects agent context (e.g., "test-architect")
AND task is complex (requires visible execution)
THEN:
  ✅ Launch THE HOOK'S AGENT using Task tool
  ❌ DO NOT substitute with a different agent
  ❌ DO NOT make your own agent choice

### Example

User: "create a dashboard test strategy"

Hook output in system reminders:
  🎯 Auto-Activated Agents: test-architect


CORRECT behavior:
  Task(subagent_type="test-architect", ...)  ✅

INCORRECT behavior:
  Task(subagent_type="Explore", ...)  ❌
  Task(subagent_type="Plan", ...)    ❌
  [Any agent other than test-architect]  ❌

### Why This Matters

The hook performs intelligent pattern matching:
- "test strategy" → **test-architect**
- "test authentication" → **qa-engineer**
- "design feature" → **product-manager**
- "implement API" → **backend-engineer**

When you override the hook's choice:
- ❌ You ignore intelligent routing
- ❌ You break expected workflow visibility
- ❌ You use generic agents instead of specialized ones

**Always respect the hook's agent selection.**

---

## Two Agent Mechanisms

### 1. Silent Context Injection (Hooks)
- Hook injects `<agent_context>` into system reminders
- Claude follows agent instructions in same thread
- Fast, seamless, good for simple tasks
- No visibility into progress

### 2. Visible Agent Execution (Task Tool)
- Claude calls `Task(subagent_type="agent-name", ...)`
- Launches separate subprocess
- User sees: "agent-name is running..."
- Better for complex work

---

## Decision Matrix

### Decision Flow

1. Check system reminders for hook-activated agent
↓
2. Is specific agent activated? ("🎯 Auto-Activated Agents: test-architect")
↓
YES → Proceed to step 3
NO  → Choose agent based on task type
↓
3. Is task complex? (multi-step, >2 min, requires exploration)
↓
YES → Launch THE HOOK'S AGENT via Task tool ✅
NO  → Follow hook's injected context silently ✅

### Complexity Indicators (Use Task Tool)

- Multi-step work requiring 5+ tool calls
- Need to explore 10+ files
- Creating comprehensive documentation (>500 lines)
- Implementing complex features (>3 files modified)
- Deep codebase analysis
- Estimated duration >2 minutes

### Simplicity Indicators (Use Silent Context)

- Quick guidance or advice
- Single-file modification
- Simple code review comments
- Answer questions with existing context
- Response needed immediately
- No file exploration needed

---

## Agent Selection Priority Order

**1. Hook-Activated Agent (HIGHEST PRIORITY)**
- If hook activates specific agent → USE THAT AGENT
- Example: Hook says "test-architect" → You MUST use test-architect
- Do NOT substitute with Explore, Plan, or any other agent

**2. User-Explicit Request**
- If user explicitly requests agent → USE THAT AGENT
- Example: "Use qa-engineer to test this" → You MUST use qa-engineer

**3. Task Type Pattern Matching (ONLY if no hook/user directive)**
- Use pattern matching only when hook doesn't activate an agent
- And user doesn't explicitly request one

---

## Best Practices for Claude

### Before Every Task Tool Call:

1. ✅ **Check system reminders** for `🎯 Auto-Activated Agents:`
2. ✅ **Use hook's agent if present** - This is a DIRECTIVE, not a suggestion
3. ✅ **Never substitute** - Don't use Explore/Plan when hook activates specific agent
4. ✅ **Announce agent usage**: "I'll launch the [hook's agent]..."
5. ✅ **Update todos** when launching agents to show progress

### Common Mistakes to Avoid:

- ❌ Seeing "test-architect" in system reminders → launching Explore
- ❌ Seeing "qa-engineer" in system reminders → launching Plan
- ❌ Ignoring hook directive and choosing your own agent
- ❌ Using generic agents (Explore/Plan) when specialized agent is activated

### Correct Pattern:

1. Read system reminders
2. See: "🎯 Auto-Activated Agents: test-architect"
3. Task is complex → Launch test-architect (NOT Explore/Plan)
4. Announce: "I'll launch the test-architect agent..."
5. Task(subagent_type="test-architect", ...)

---

**Version**: 2.0 (2025-11-07)
