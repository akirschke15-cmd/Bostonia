# Test Command

Run comprehensive tests for the project and analyze coverage.

## Test Execution Strategy

### 1. Identify Test Framework

Detect the project type and run appropriate tests:

**Python:**
```bash
pytest --cov --cov-report=html --cov-report=term -v
```

**TypeScript/JavaScript:**
```bash
# Vitest
npm run test -- --coverage

# Jest
npm test -- --coverage

# Or
pnpm test --coverage
```

**Terraform:**
```bash
# Validation
terraform validate

# Linting
tflint

# Security checks
tfsec .
checkov -d .
```

### 2. Analyze Results

Review:
- Test pass/fail status
- Coverage percentages (overall, per file)
- Uncovered lines
- Failed assertions

### 3. Coverage Goals

Target coverage by component:
- Critical business logic: 90%+
- API endpoints: 80%+
- Utility functions: 70%+
- Overall project: 70%+

### 4. Report Format

Provide a summary:

```markdown
## Test Results

### Status
✅ All tests passing | ❌ X tests failing

### Coverage Summary
- Overall: X%
- Statements: X%
- Branches: X%
- Functions: X%
- Lines: X%

### Coverage by Module
- module1: X%
- module2: X%

### Failed Tests (if any)
1. test_name - Reason
2. test_name - Reason

### Uncovered Critical Paths
- File: path/to/file.py:123-145
  Reason: [explanation]

### Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
```

## Additional Checks

### Test Quality
- Do tests verify behavior rather than implementation?
- Are tests independent and isolated?
- Have edge cases been covered?
- Are error conditions tested?

### Performance
- Do tests run quickly?
- Are there any flaky tests?
- Is test setup/teardown optimized?

Please run tests and provide the analysis.
