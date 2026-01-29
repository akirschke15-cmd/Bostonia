# Contributing to Claude Code Boilerplate

Thank you for your interest in contributing! This document provides guidelines for contributing to this boilerplate configuration.

## How to Contribute

### Reporting Issues

If you find a problem:

1. Check if the issue already exists
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Claude Code version)

### Suggesting Enhancements

For feature requests:

1. Describe the enhancement clearly
2. Explain the use case
3. Provide examples if possible

## Development Guidelines

### Adding New Agents

1. **Choose the right category** - Place agents in the appropriate subdirectory
2. **Follow the template**:

```markdown
# Agent Name

## Role
[Clear description of expertise]

## Core Responsibilities
[Specific responsibilities]

## [Domain-specific sections]
[Relevant content for this agent type]

## Code Review Checklist
[If applicable]

## Communication Style
[How the agent should communicate]

## Activation Context
[When to use this agent]
```

3. **Keep it focused** - Each agent should have a specific, well-defined role
4. **Provide examples** - Include code examples and patterns
5. **Test the agent** - Ensure the guidance is accurate and helpful

### Adding New Skills

1. **Create skill directory**:
   ```text
   .claude/skills/skill-name/
   ├── SKILL.md
   └── resources/
       └── topic1.md
   ```

2. **Follow the 500-line rule** - Main SKILL.md should be under 500 lines
3. **Use progressive disclosure** - Basic info in SKILL.md, details in resources/
4. **Update skill-rules.json**:

```json
{
  "name": "skill-name",
  "description": "Clear description",
  "triggers": {
    "filePatterns": ["**/*.ext"],
    "keywords": ["keyword1", "keyword2"],
    "contexts": ["context description"]
  },
  "autoActivate": true,
  "priority": "high|medium|low"
}
```

5. **Test auto-activation** - Verify triggers work correctly

### Adding Slash Commands

1. **Create command file** in `.claude/commands/`
2. **Use clear structure**:
   - Command description
   - Steps or checklist
   - Examples
   - Expected output format

3. **Make it actionable** - Provide specific steps Claude can follow

### Updating Hooks

1. **Keep hooks simple** - Complex logic should be in agents/skills
2. **Handle errors gracefully** - Don't break on edge cases
3. **Make them fast** - Hooks should not slow down workflow
4. **Document behavior** - Clear comments explaining what the hook does

## Code Style

### Markdown Formatting

- Use consistent heading levels
- Include code blocks with language specification
- Use checklists for actionable items
- Include examples for complex concepts

### Code Examples

Python:
```python
# ✅ Good: Clear, type-hinted, documented
def calculate_total(items: List[Item], discount: float = 0.0) -> Decimal:
    """Calculate total with optional discount."""
    # Implementation
    pass

# ❌ Bad: No types, unclear
def calc(i, d=0):
    # Implementation
    pass
```

TypeScript:
```typescript
// ✅ Good: Strict types, clear names
function processUser(user: User): Result<ProcessedUser> {
  // Implementation
}

// ❌ Bad: Any types, unclear
function process(data: any): any {
  // Implementation
}
```

## Testing Your Contributions

Before submitting:

1. **Test with real projects** - Try your changes with actual codebases
2. **Verify auto-activation** - If you modified triggers, test them
3. **Check for conflicts** - Ensure your changes don't break existing functionality
4. **Review documentation** - Update README.md if needed

## Pull Request Process

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes**
4. **Test thoroughly**
5. **Commit with clear messages**:
   ```text
   feat: Add Python testing agent

   - Comprehensive pytest patterns
   - Coverage strategies
   - Mocking examples
   ```

6. **Submit PR with**:
   - Description of changes
   - Why the changes are needed
   - How you tested them
   - Any breaking changes

## Review Criteria

Pull requests are reviewed for:

- **Accuracy** - Is the technical content correct?
- **Clarity** - Is it easy to understand?
- **Completeness** - Does it cover the topic adequately?
- **Consistency** - Does it match existing style and structure?
- **Usefulness** - Will it help users?

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have questions about contributing, please open an issue with the "question" label.

## Recognition

Contributors will be recognized in the project's acknowledgments.

Thank you for helping make this boilerplate better for everyone!
