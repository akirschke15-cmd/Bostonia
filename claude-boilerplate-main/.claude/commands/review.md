# Code Review Command

Perform a comprehensive code review of recent changes, focusing on:

## Review Checklist

### Code Quality
- [ ] Code follows language-specific best practices
- [ ] Naming conventions are consistent and clear
- [ ] Functions/methods are appropriately sized
- [ ] No code duplication (DRY principle)
- [ ] Complex logic is well-documented

### Type Safety (TypeScript/Python)
- [ ] Type hints/annotations are comprehensive
- [ ] No `any` types without justification (TypeScript)
- [ ] Proper error types defined
- [ ] Null/undefined handling is explicit

### Security
- [ ] No hardcoded credentials or secrets
- [ ] Input validation implemented
- [ ] SQL queries are parameterized
- [ ] Authentication/authorization checks present
- [ ] Dependencies have no known vulnerabilities

### Testing
- [ ] New code has corresponding tests
- [ ] Happy path and edge cases covered
- [ ] Tests are independent and repeatable
- [ ] Mock usage is appropriate

### Performance
- [ ] No obvious performance issues
- [ ] Database queries are optimized
- [ ] Appropriate caching strategies
- [ ] Resource cleanup (connections, files)

### Documentation
- [ ] Public APIs documented
- [ ] Complex logic explained
- [ ] README updated if needed
- [ ] Breaking changes noted

## Review Process

1. Run automated checks:
   ```bash
   # Python
   ruff check .
   mypy .
   pytest

   # TypeScript
   npm run lint
   npm run type-check
   npm test

   # Terraform
   terraform fmt -check
   terraform validate
   tflint
   ```

2. Review changed files for the items above

3. Provide specific, actionable feedback

4. Suggest improvements with examples

## Output Format

Provide feedback in this format:

```markdown
## Summary
[Brief overview of changes reviewed]

## Critical Issues
- [Issue 1 with file:line reference]
- [Issue 2 with file:line reference]

## Major Suggestions
- [Suggestion 1]
- [Suggestion 2]

## Minor Improvements
- [Improvement 1]
- [Improvement 2]

## Positive Observations
- [What was done well]
```

Please proceed with the code review of recent changes.
