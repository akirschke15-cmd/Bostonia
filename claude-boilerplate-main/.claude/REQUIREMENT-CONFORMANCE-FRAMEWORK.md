# Requirement Conformance Framework

## Overview

This framework prevents **requirement drift** - the phenomenon where Claude starts with well-defined requirements but delivers incomplete or non-functional implementations (e.g., wireframes instead of fully functional features).

## The Problem This Solves

**Symptom**: You ask for a user settings page with MFA, timezone, and notification preferences. The Product Manager creates detailed requirements. The implementation delivers a beautiful settings UI... but none of the toggles work. They're not connected to any backend. It's essentially a wireframe.

**Root Cause**: Without explicit safety rails, Claude may:
- Simplify features to conserve tokens
- Create UI-only implementations without backend integration
- Use mock data instead of real API calls
- Gradually drift from requirements during long-running implementations
- Mark features as "complete" when they're only partially functional

**This Framework's Solution**: Explicit instructions, checklists, and enforcement mechanisms that ensure 100% requirement conformance or explicit communication when that's not possible.

## Framework Components

### 1. Project Preferences (.claude/project-preferences.md)

**What it does**: Establishes the core philosophy and non-negotiable rules for implementation.

**Key principles**:
- Complete implementation = ONLY acceptable outcome
- Requirements are immutable without user approval
- No implicit de-scoping
- Zero tolerance for "wireframe mode"
- Vertical slices (each phase must be end-to-end functional)

**When Claude reads this**: At the start of any implementation task

### 2. Enhanced Product Manager Agent

**What changed**: The Product Manager now includes:

- **Implementation Scope Assessment**: Estimates complexity (Small/Medium/Large/XL)
- **Vertical Slice Recommendations**: If scope is Large/XL, suggests phasing
- **Integration Requirements Checklist**: Explicit list of:
  - Frontend components needed
  - API endpoints needed
  - Database schema needed
  - Authentication requirements
  - Third-party services
  - Test requirements

**Why this helps**: Implementation agents now have a clear, verifiable checklist of what "done" means.

### 3. Enhanced Implementation Agents

**What changed**: Frontend, Backend, and Fullstack agents now include:

**Pre-Implementation Planning**:
- MUST read PRD completely
- MUST create comprehensive TodoWrite checklist
- MUST identify vertical slices if needed
- MUST set explicit completion criteria

**Implementation Workflow**:
- Follow vertical integration (database → API → frontend)
- Update TodoWrite in real-time
- Track conformance to requirements
- STOP and communicate if blocked

**Pre-Completion Verification**:
- Mandatory checklist before marking complete
- Verify ALL acceptance criteria
- Verify ALL integration points
- Verify feature works end-to-end

**Anti-Patterns Section**:
- Explicit examples of what NOT to do
- "UI Shell Implementation" - forbidden
- "Mock Data Substitution" - forbidden
- "Implicit De-Scoping" - forbidden

### 4. Requirement Conformance Check Hook

**What it does**: Reminds Claude to verify conformance before marking features complete.

**When it runs**: After tool use (when files are modified or todos are updated)

**Location**: `.claude/hooks/requirement-conformance-check`

### 5. Updated Settings Configuration

**What changed**: `settings.json` now references the framework:

```json
"projectPreferences": {
  "enabled": true,
  "preferencesFile": ".claude/project-preferences.md",
  "requirementConformance": {
    "enforceCompletionChecklist": true,
    "preventWireframeImplementations": true,
    "requireVerticalSlices": true,
    "mandatoryTodoTracking": true
  }
}
```

## How to Use This Framework

### For Simple Features (Small scope)

1. **Describe the feature**: "I need a user profile editing page"

2. **Product Manager activates**: Creates PRD with user stories and acceptance criteria

3. **Implementation agent activates**:
   - Creates TodoWrite checklist from acceptance criteria
   - Implements feature fully (UI → API → Database)
   - Verifies all acceptance criteria
   - Marks complete when everything works

### For Complex Features (Large/XL scope)

1. **Describe the feature**: "I need a comprehensive user settings page with profile editing, MFA configuration, timezone selection, theme customization, and notification preferences"

2. **Product Manager activates**:
   - Creates complete PRD
   - Assesses as "Large" complexity
   - Recommends vertical slices:
     - Phase 1: Profile editing (fully functional)
     - Phase 2: Security settings (MFA, password)
     - Phase 3: Preferences (timezone, theme, notifications)

3. **You approve phasing**: "Yes, let's do Phase 1 first"

4. **Implementation agent activates**:
   - Creates TodoWrite for Phase 1 ONLY
   - Implements profile editing completely
   - Verifies all acceptance criteria for Phase 1
   - Marks Phase 1 complete
   - Does NOT create UI for Phase 2/3 features

5. **When ready**: "Now let's do Phase 2"

### What You'll Notice

**Before this framework**:
```
You: "Build a settings page with profile, MFA, and theme options"
Claude: "Here's your settings page! ✅"
Reality: Beautiful UI with 10 toggles, none of which work
```

**After this framework**:
```
You: "Build a settings page with profile, MFA, and theme options"
Claude: "This is a Large feature. I recommend 3 phases:
  Phase 1: Profile editing (name, email, avatar) - fully functional
  Phase 2: MFA configuration - fully functional
  Phase 3: Preferences (theme, etc.) - fully functional

  Approve Phase 1?"

You: "Approved"
Claude: [Implements profile editing completely]
Claude: "Phase 1 complete. Profile editing works end-to-end:
  ✅ User can view profile
  ✅ User can edit name, email
  ✅ User can upload avatar
  ✅ Changes persist to database
  ✅ Error handling works

  Ready for Phase 2?"
```

## Key Behaviors to Expect

### 1. Proactive Scope Communication

If a feature is too large, Claude will:
- STOP before implementation
- Analyze the scope
- Propose vertical slices
- Get your approval

You'll never again get a "surprise wireframe" at the end.

### 2. Transparent Progress Tracking

Claude will:
- Create detailed TodoWrite checklists
- Update them in real-time
- Show exactly what's done vs. what remains
- Never silently simplify requirements

### 3. Explicit Blockers

If Claude can't complete something, you'll get:
```
🚨 IMPLEMENTATION CONSTRAINT DETECTED

I cannot fully implement [specific requirement] because:
- [Specific reason]

Current status:
- [What IS implemented]
- [What is NOT implemented]

Options:
1. Continue with partial implementation and document remaining work
2. Simplify [specific requirement] to [alternative]
3. Split into multiple sessions

Please advise.
```

### 4. Real Integration, Always

Every feature will:
- Connect frontend to backend (no mock data)
- Connect backend to database (no stubs)
- Include error handling
- Include loading states
- Actually work when you test it

## Common Scenarios

### Scenario 1: "Just create the UI, I'll hook it up later"

**If you explicitly want this**:
```
You: "Create the UI for user settings, no backend integration needed yet"
Claude: [Creates UI components]
Claude: "UI complete. Note: This is visual-only and requires backend integration:
  - [ ] Connect to /api/user/settings endpoint
  - [ ] Implement form submission handler
  - [ ] Add error handling"
```

**Framework allows this** when you explicitly request it.

### Scenario 2: "Build the full feature"

```
You: "Build user settings page with profile editing"
Claude: [Creates TodoWrite with all components]
Claude: [Implements UI + API + Database]
Claude: "Feature complete ✅
  - User can view profile
  - User can edit name and email
  - Changes persist to database
  - Error handling works
  - Loading states work

  Tested manually: All functionality works"
```

### Scenario 3: Feature is too complex

```
You: "Build a complete analytics dashboard with real-time metrics,
custom date ranges, export functionality, and user segmentation"

Claude: "This is an XL feature requiring:
  - 15+ frontend components
  - 12 API endpoints
  - Complex database queries
  - Real-time WebSocket integration
  - Export processing

  I recommend 4 phases:

  Phase 1: Basic metrics display (today's stats)
  Phase 2: Date range filtering
  Phase 3: Export functionality
  Phase 4: User segmentation

  Each phase will be fully functional. Approve?"
```

## Customization

### Adjusting Strictness

If you find the framework too strict, you can adjust in `project-preferences.md`:

**Less strict**:
```markdown
## Core Implementation Philosophy

**Principle**: Aim for 100% requirement conformance. If constraints arise,
communicate them proactively and get approval for alternatives.
```

**More strict** (default):
```markdown
## Core Implementation Philosophy

**Principle**: Complete implementation conforming to 100% of documented
requirements is the ONLY acceptable outcome. Partial implementations are
NEVER acceptable unless explicitly scoped as such.
```

### Adjusting Phasing Threshold

In the Product Manager agent, you can change when phasing is recommended:

- **Current**: Large or XL features → recommend phasing
- **More aggressive**: Medium or larger → recommend phasing
- **Less aggressive**: Only XL → recommend phasing

### Adding Domain-Specific Rules

Add to `project-preferences.md`:

```markdown
## Domain-Specific Requirements

### E-commerce Features
- All payment flows MUST include:
  - Success confirmation page
  - Email confirmation
  - Order history update
  - Inventory update

### Data Privacy Features
- All user data exports MUST include:
  - GDPR-compliant data format
  - Deletion confirmation workflow
  - Audit log entry
```

## Troubleshooting

### "Claude is being too cautious"

**Symptom**: Claude asks for approval too often or proposes too many phases.

**Solution**: In `project-preferences.md`, adjust the complexity threshold:

```markdown
### Vertical Slice Requirements

Features under [8] acceptance criteria can be implemented in one phase.
Features with [8+] acceptance criteria should be evaluated for phasing.
```

### "Claude still creates wireframes sometimes"

**Symptom**: Despite the framework, you occasionally get non-functional implementations.

**Solution**:
1. Check if the Product Manager included the Implementation Scope Assessment
2. Verify the implementation agent created a TodoWrite checklist
3. Add a post-implementation hook that runs automated checks

### "Todo lists are getting too granular"

**Symptom**: TodoWrite checklists have 50+ items for simple features.

**Solution**: Update agent instructions to group related items:

```markdown
Instead of:
- [ ] Create user model
- [ ] Add name field
- [ ] Add email field
- [ ] Add password field

Group as:
- [ ] Create user model with name, email, password fields
```

## Measuring Success

Track these metrics to see if the framework is working:

### Before Framework
- **Requirement conformance**: ~40% (many features partially complete)
- **Rework rate**: High (need to ask "can you make this actually work?")
- **Mock data prevalence**: High
- **User frustration**: High

### After Framework
- **Requirement conformance**: ~95% (features work as specified)
- **Rework rate**: Low (features work first time)
- **Mock data prevalence**: Near zero
- **User frustration**: Low

### Key Indicators

**Good signs**:
- ✅ Features work when you test them
- ✅ No "TODO: connect to backend" comments
- ✅ Transparent progress updates
- ✅ Proactive communication about constraints

**Warning signs**:
- ⚠️ Still finding non-functional implementations
- ⚠️ TodoWrite checklists not being created
- ⚠️ Mock data without replacement plan
- ⚠️ Features marked complete without verification

## FAQ

### Q: Will this make implementations slower?

A: Initial planning takes slightly longer, but total time is FASTER because:
- No rework needed ("make this actually work")
- No surprise scope changes mid-implementation
- Clear stopping points for large features

### Q: What if I want a quick mockup?

A: Explicitly request it:
```
"Create a mockup/wireframe of the settings page, no functionality needed"
```

The framework allows this when explicitly requested.

### Q: Can I use this with the existing SDLC workflow?

A: Yes! This enhances the existing workflow:

```
Requirements → [Product Manager + Scope Assessment] →
System Architect → Implementation Agents [with conformance tracking] →
QA → Production
```

### Q: What if requirements change mid-implementation?

A: The framework requires explicit approval:
```
Claude: "The original requirement was X. I recommend changing to Y because
[reason]. This affects [impact]. Approve?"
```

You remain in control of scope changes.

## Advanced Usage

### Integration with CI/CD

Create a pre-commit hook that checks for anti-patterns:

```bash
#!/usr/bin/env bash
# Check for mock data without TODO
if grep -r "const mock" src/ --exclude-dir=tests | grep -v "TODO"; then
  echo "❌ Mock data found without TODO"
  exit 1
fi

# Check for non-functional components
if grep -r "// TODO: implement" src/ --exclude-dir=tests; then
  echo "❌ TODO comments found in source code"
  exit 1
fi
```

### Custom Conformance Metrics

Add to `project-preferences.md`:

```markdown
## Conformance Metrics

Track these for each feature:
- Requirements defined: [N]
- Requirements implemented: [M]
- Conformance: [M/N * 100]%

Target: 100% conformance before marking complete
Minimum acceptable: 95% (with documented exceptions)
```

### Team Adoption

If working with a team:

1. **Share this document**: Ensure everyone understands the framework
2. **Set team standards**: Agree on acceptable conformance levels
3. **Review PRs**: Check that features meet conformance standards
4. **Iterate**: Update `project-preferences.md` based on team feedback

## Credits & Inspiration

This framework draws inspiration from:

- **DarkEye123/claude-global-instructions**: Score-based implementation rules, decision-helper override authority
- **Spec-Driven Development**: Requirements as living documentation
- **Issue #427 (Claude Code GitHub)**: Prompt guidelines enforcement
- **Best practices from the community**: Session management, documentation strategy, memory management

## Version History

- **v1.0** (2025-11-06): Initial release
  - Project preferences established
  - Agents updated with conformance tracking
  - Requirement conformance hook created
  - Settings integration

## License

This framework is part of the Claude Boilerplate project and follows the same license.

---

**Questions or feedback?** Update this document based on your experience!
