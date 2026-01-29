# Project Preferences and Implementation Standards

## 🎯 Core Implementation Philosophy

**Principle**: Complete implementation conforming to 100% of documented requirements is the ONLY acceptable outcome. Partial implementations, wireframes, or mock-ups are **NEVER** acceptable unless explicitly scoped as such.

---

## 🚨 Requirement Drift Prevention Framework

### Critical Rules (Non-Negotiable)

1. **Requirements are Immutable**: Once the Product Manager agent creates a PRD with user stories and acceptance criteria, those requirements become the **source of truth**. They cannot be modified, simplified, or reinterpreted during implementation without explicit user approval.

2. **No Implicit De-Scoping**: You MUST NOT:
   - Simplify features because they "seem complex"
   - Create UI-only implementations without backend integration
   - Skip acceptance criteria because of token concerns
   - Substitute mock data for real implementations
   - Defer functionality "for later phases" without user approval

3. **Zero Tolerance for "Wireframe Mode"**: If you find yourself thinking "I'll just create the UI structure and they can hook it up later" - **STOP**. This is requirement drift. Either implement fully or halt and communicate constraints.

### Requirement Conformance Tracking

Before starting ANY implementation task, you MUST:

1. **Create a Conformance Checklist** using TodoWrite that includes:
   - Every acceptance criterion as a separate todo item
   - Every user story from the PRD
   - All non-functional requirements (performance, security, etc.)
   - Integration requirements (frontend ↔ backend, API connections, database)

2. **Mark items as completed ONLY when**:
   - The feature is fully functional (not just UI present)
   - All acceptance criteria pass
   - Integration points are connected and working
   - Tests exist and pass (if specified in DoD)

3. **If you cannot complete something**:
   - **DO NOT** mark it as complete
   - **DO NOT** implement a "placeholder" version
   - **STOP** and communicate: "I cannot complete [specific requirement] because [specific constraint]. Options: (A) Continue with remaining items, (B) Simplify this specific requirement, (C) Break into smaller phases."

---

## 📋 Implementation Verification Protocol

### Before Declaring "Done"

Run this checklist for EVERY feature:

```markdown
## Feature Completion Verification

### Requirements Conformance
- [ ] All user stories from PRD are implemented
- [ ] All acceptance criteria are met (verify each Given-When-Then)
- [ ] No features were simplified or mocked without approval
- [ ] Edge cases from requirements are handled
- [ ] Error scenarios from requirements are implemented

### Integration Completeness
- [ ] Frontend components are connected to real backend APIs (not mock data)
- [ ] Backend APIs are connected to real database (not in-memory stubs)
- [ ] Authentication/authorization works end-to-end if required
- [ ] All API endpoints defined in requirements exist and function
- [ ] Data flows correctly from UI → Backend → Database → UI

### Functional Validation
- [ ] Feature works in realistic usage scenarios
- [ ] All interactive elements are functional (not just visual)
- [ ] Form submissions actually process and persist data
- [ ] Loading states, errors, and success states work correctly
- [ ] Navigation and routing work as specified

### Definition of Done (from PRD)
- [ ] All DoD items from the PRD are completed
- [ ] No "TODO" or "FIXME" comments for core functionality
- [ ] No console.log statements or debug code
- [ ] No commented-out sections representing missing functionality
```

---

## 🏗️ Implementation Chunking Strategy

### When Full Implementation Seems Infeasible

If you estimate a feature will exceed token budget or time constraints:

**BEFORE starting implementation:**

1. **Analyze and Report**:
   ```
   "The user story [X] requires:
   - [Specific frontend work]
   - [Specific backend work]
   - [Specific database work]
   - [Specific integration work]

   This exceeds reasonable session limits. I recommend breaking into phases:

   Phase 1: [Specific deliverables that are independently valuable]
   Phase 2: [Specific deliverables building on Phase 1]
   Phase 3: [Remaining deliverables]

   Each phase will be 100% complete for its scope."
   ```

2. **Get explicit approval** before proceeding with phased approach

3. **Document the phase boundaries** in a TASK.md file:
   ```markdown
   # TASK.md - User Settings Feature

   ## Original Requirement
   [Full PRD or user story reference]

   ## Approved Implementation Plan

   ### Phase 1 (Current Session) - APPROVED
   **Scope**:
   - User profile viewing and editing
   - Basic account settings (name, email)
   - Frontend + Backend + Database integration

   **Explicitly OUT OF SCOPE for this phase**:
   - MFA settings (Phase 2)
   - Notification preferences (Phase 2)
   - Theme customization (Phase 3)

   ### Phase 2 (Future Session)
   [Deferred scope...]

   ### Phase 3 (Future Session)
   [Deferred scope...]
   ```

### Vertical Slice Requirements

When chunking, each phase MUST be a "vertical slice":

- ✅ **GOOD**: "User can view and edit their profile name (UI → API → Database → UI)"
- ❌ **BAD**: "Create all the UI for settings page" (horizontal slice with no backend)
- ❌ **BAD**: "Add settings toggles to UI" (without functionality)

---

## 🔄 Agent Workflow Modifications

### Product Manager Agent Enhancement

When creating PRDs, the Product Manager MUST now include:

1. **Implementation Complexity Assessment**:
   - Estimated implementation scope (Small / Medium / Large / XL)
   - Recommendation for phasing if scope is Large or XL
   - Suggested vertical slices if phasing is recommended

2. **Explicit Integration Requirements**:
   ```markdown
   ### Integration Requirements
   - [ ] Frontend component: [specific]
   - [ ] API endpoint: [specific]
   - [ ] Database schema: [specific]
   - [ ] Authentication: [specific]
   - [ ] Third-party services: [specific]
   ```

### Implementation Agents (Fullstack, Frontend, Backend) Enhancement

Before starting implementation:

1. **Generate Implementation Checklist**:
   ```typescript
   TodoWrite with items for:
   - Each acceptance criterion
   - Each integration point
   - Each API endpoint
   - Each database operation
   - Each test requirement
   ```

2. **Set Explicit Success Criteria**:
   ```
   "I will mark this feature complete when:
   - [Specific testable outcome 1]
   - [Specific testable outcome 2]
   - [Specific testable outcome 3]
   ```

3. **Track Progress Transparently**:
   - Update todos in real-time
   - If blocked, STOP and report immediately
   - Never silently simplify requirements

---

## 🚫 Anti-Patterns to Actively Prevent

### Pattern: "UI Shell Implementation"
**Description**: Creating a beautiful settings page with toggles for MFA, timezone, notifications, etc., but none of them actually work.

**Detection**: Ask yourself: "If the user clicks this button, does something real happen?"

**Prevention**:
- Mark each setting as a separate todo
- Complete todo ONLY when setting is functional
- Do not create UI elements for features you won't implement

### Pattern: "Mock Data Substitution"
**Description**: Using hardcoded arrays or mock data instead of connecting to real APIs.

**Detection**: Search code for `const mockData =` or similar patterns.

**Prevention**:
- Requirements implicitly require real data unless stated otherwise
- If you must use mock data temporarily, create a todo: "Replace mock data with real API call"
- Do not mark feature as complete until mock data is replaced

### Pattern: "Cross-Session Scope Creep"
**Description**: Implementing something different from what was planned because "it makes more sense now."

**Detection**: Compare current implementation against original PRD.

**Prevention**:
- Reference the PRD frequently during implementation
- If you think requirements should change, STOP and ask user
- Do not make unilateral decisions to change scope

### Pattern: "Implicit Deferral"
**Description**: Deciding certain acceptance criteria are "not critical" and skipping them.

**Detection**: Count acceptance criteria in PRD vs. implemented features.

**Prevention**:
- All acceptance criteria are mandatory unless marked "stretch goal"
- If you cannot implement an AC, report it explicitly
- Get user approval to defer specific ACs

---

## 📊 Progress Reporting Standards

### Status Update Format

When providing progress updates, use this format:

```markdown
## Implementation Progress: [Feature Name]

### Completed ✅
- [Specific requirement 1] - Fully functional
- [Specific requirement 2] - Fully functional

### In Progress 🚧
- [Specific requirement 3] - [X% complete, specific blockers]

### Not Started ⏸️
- [Specific requirement 4]
- [Specific requirement 5]

### Blockers 🚨
- [Specific blocker 1]: [Proposed solution or need user decision]

### Conformance Check
- Total requirements: [N]
- Fully implemented: [M]
- Conformance: [M/N = X%]
- Ready for handoff: [Yes/No + reason]
```

---

## 🎓 Decision-Making Framework

### When You Encounter Trade-offs

Use this decision tree:

```
Does this decision affect scope or requirements?
├─ YES → STOP and ask user
└─ NO → Is this a standard implementation detail?
    ├─ YES → Proceed using best practices
    └─ NO → Is this covered by agent expertise?
        ├─ YES → Proceed with documentation
        └─ NO → Ask user for guidance
```

### Score-Based Implementation Rules

For suggestions or optimizations during code review:

- **Score ≥ 8**: Critical for requirement conformance → MUST implement
- **Score 5-7**: Improvement but not required → Implement if time permits
- **Score ≤ 4**: Nice-to-have → Skip for now, document as future enhancement

**Scoring Criteria**:
- Does it affect a stated requirement? (+3)
- Does it affect security or correctness? (+3)
- Does it affect user-facing functionality? (+2)
- Is it a best practice? (+1)
- Is it purely aesthetic? (-2)

---

## 🔐 Enforcement Mechanisms

### Pre-Implementation Checklist

Before writing first line of code:

```markdown
## Pre-Implementation Verification

- [ ] I have read the complete PRD
- [ ] I have created todos for every acceptance criterion
- [ ] I have identified all integration points
- [ ] I understand what "done" means for this feature
- [ ] I have a plan for vertical slicing if needed
- [ ] I have communicated any concerns to the user
```

### Post-Implementation Checklist

Before declaring feature complete:

```markdown
## Post-Implementation Verification

- [ ] Every acceptance criterion passes
- [ ] All APIs are connected (no mock data)
- [ ] All database operations work
- [ ] All todos are marked complete
- [ ] Feature has been manually tested
- [ ] No "temporary" code remains
- [ ] Integration tests pass (if required)
- [ ] Documentation is updated (if required)
```

---

## 💬 Communication Templates

### When You Cannot Complete Something

```
🚨 IMPLEMENTATION CONSTRAINT DETECTED

I cannot fully implement [specific requirement] within this session because:
- [Specific reason 1]
- [Specific reason 2]

Current status:
- [What IS implemented]: [Specific details]
- [What is NOT implemented]: [Specific details]

Options:
1. Continue with partial implementation and document remaining work
2. Simplify [specific requirement] to [specific alternative]
3. Split into multiple sessions with [specific phase boundaries]

Please advise which option you prefer.
```

### When Requirements Are Ambiguous

```
⚠️ REQUIREMENT CLARIFICATION NEEDED

The requirement "[specific requirement]" could be interpreted as:
- Option A: [Interpretation 1]
- Option B: [Interpretation 2]

This affects:
- [Specific implementation decision 1]
- [Specific implementation decision 2]

Please clarify which interpretation is correct.
```

### When Proposing Phasing

```
📋 PHASING RECOMMENDATION

The feature "[feature name]" includes [N] user stories and [M] acceptance criteria.

Estimated implementation scope: [X] hours/days

I recommend breaking into [N] vertical slices:

**Phase 1** (Current session):
- [Specific deliverable 1] - Fully functional
- [Specific deliverable 2] - Fully functional
- Value delivered: [Specific user benefit]

**Phase 2** (Future session):
- [Specific deliverable 3] - Fully functional
- Value delivered: [Specific user benefit]

Each phase will be 100% complete for its scope. Do you approve this approach?
```

---

## 🎯 Success Criteria for This Framework

This framework is successful when:

1. **Zero wireframe implementations**: Every feature delivered is fully functional
2. **100% requirement conformance**: All acceptance criteria are met
3. **Transparent progress**: User always knows what is done vs. what remains
4. **Proactive communication**: Constraints are surfaced immediately, not discovered at "completion"
5. **Vertical slices**: If phasing is needed, each phase delivers real value

---

## 📚 Reference: Requirement Drift Case Study

### ❌ Before (Requirement Drift Pattern)

**User Request**: "Implement a user settings page"

**Product Manager Output**:
- User can view and edit profile information
- User can configure MFA settings
- User can set timezone preferences
- User can customize theme
- User can manage notification settings

**Implementation Delivered**:
- A beautiful settings UI with tabs and toggles
- None of the toggles do anything
- No backend integration
- No database persistence
- Essentially a wireframe

**Problem**: Massive requirement drift. User expected functional settings, got a mockup.

### ✅ After (This Framework)

**User Request**: "Implement a user settings page"

**Product Manager Output**: [Same PRD]

**Implementation Response**:
```
I've analyzed the requirements. This includes 5 major feature areas with
15 acceptance criteria total. Full implementation would require:

- 5 frontend components
- 8 API endpoints
- 4 database tables
- Authentication integration
- Third-party service integration (email, SMS)

This exceeds a single session. I recommend 3 vertical slices:

Phase 1: Profile Settings (name, email, avatar)
- Fully functional UI → API → Database
- User can view and edit, changes persist
- Estimated: 2-3 hours

Phase 2: Security Settings (password, MFA)
- Fully functional UI → API → Database
- MFA enrollment flow complete
- Estimated: 3-4 hours

Phase 3: Preferences (timezone, theme, notifications)
- Fully functional UI → API → Database
- Real-time theme switching
- Estimated: 2-3 hours

Approve Phase 1 scope?
```

**Implementation Delivered (Phase 1)**:
- Profile settings page (UI)
- Connected to real API endpoints
- Data persists to database
- Loading states, error handling work
- Avatar upload functional
- Changes reflect immediately
- All acceptance criteria for profile settings: ✅

**Result**: User gets real value immediately, knows exactly what's done and what's remaining.

---

## 🔄 Framework Iteration

This framework should evolve based on:
- User feedback on delivered features
- Patterns of requirement drift that still occur
- Effectiveness of communication templates
- Agent behavior changes needed

When patterns emerge, update this document and reference it in agent prompts.

---

**Last Updated**: 2025-11-06
**Framework Version**: 1.0
**Status**: Active - All agents must follow these guidelines
