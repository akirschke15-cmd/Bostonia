# Testing Best Practices Skill

## Overview
Comprehensive testing strategies, patterns, and tools for ensuring software quality across Python, TypeScript, and infrastructure code.

## When This Skill Activates
- Working with test files (`*test*.py`, `*test*.ts`, `*spec*.ts`)
- Testing configuration files (`pytest.ini`, `jest.config.js`, `vitest.config.ts`)
- Keywords: test, testing, coverage, mock, fixture, e2e
- CI/CD pipeline configuration with test stages

## Testing Pyramid

```text
       /\
      /  \ E2E Tests (10%)
     /    \ - Full user workflows
    /------\ - Slow, expensive
   /        \
  / Integration \ (20%)
 /   Tests       \ - Component interaction
/                 \ - Moderate speed
/-------------------\
/   Unit Tests (70%) \ - Individual functions
/---------------------\ - Fast, cheap, many
```

## Quick Reference by Language

### Python Testing (pytest)

#### Basic Test Structure
```python
# tests/test_calculator.py
import pytest
from myapp.calculator import Calculator

@pytest.fixture
def calculator():
    """Provide calculator instance for tests."""
    return Calculator()

def test_addition(calculator):
    """Test basic addition."""
    assert calculator.add(2, 3) == 5
    assert calculator.add(-1, 1) == 0
    assert calculator.add(0, 0) == 0

def test_division_by_zero(calculator):
    """Test division by zero raises error."""
    with pytest.raises(ZeroDivisionError):
        calculator.divide(10, 0)

@pytest.mark.parametrize("a,b,expected", [
    (2, 3, 5),
    (0, 0, 0),
    (-1, 1, 0),
    (100, 200, 300),
])
def test_addition_parametrized(calculator, a, b, expected):
    """Test addition with multiple inputs."""
    assert calculator.add(a, b) == expected
```

#### pytest.ini Configuration
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    --verbose
    --strict-markers
    --cov=src
    --cov-report=html
    --cov-report=term-missing
    --cov-fail-under=80
markers =
    slow: marks tests as slow
    integration: integration tests
    unit: unit tests
```

### TypeScript Testing (Vitest/Jest)

#### Basic Test Structure
```typescript
// src/calculator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Calculator } from './calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  it('adds two numbers', () => {
    expect(calculator.add(2, 3)).toBe(5);
    expect(calculator.add(-1, 1)).toBe(0);
  });

  it('throws on division by zero', () => {
    expect(() => calculator.divide(10, 0)).toThrow('Division by zero');
  });

  it.each([
    [2, 3, 5],
    [0, 0, 0],
    [-1, 1, 0],
  ])('adds %i + %i = %i', (a, b, expected) => {
    expect(calculator.add(a, b)).toBe(expected);
  });
});
```

#### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

## Testing Patterns

### Test Organization (AAA Pattern)

```python
def test_user_registration():
    # Arrange - Set up test data and conditions
    user_data = {
        "email": "test@example.com",
        "password": "SecurePass123!"
    }
    user_service = UserService()

    # Act - Execute the code being tested
    result = user_service.register(user_data)

    # Assert - Verify the outcome
    assert result.success is True
    assert result.user.email == "test@example.com"
    assert result.user.is_active is True
```

### Mocking and Patching

#### Python (unittest.mock)
```python
from unittest.mock import Mock, patch, MagicMock
import pytest

def test_api_call_with_mock():
    """Test external API call with mocking."""
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": "test"}

    with patch('requests.get', return_value=mock_response) as mock_get:
        result = fetch_user_data(user_id=123)

        mock_get.assert_called_once_with(
            'https://api.example.com/users/123',
            headers={'Authorization': 'Bearer token'}
        )
        assert result["data"] == "test"

@pytest.fixture
def mock_database():
    """Mock database for testing."""
    db = MagicMock()
    db.query.return_value = [{"id": 1, "name": "Test"}]
    return db

def test_service_with_mock_db(mock_database):
    """Test service with mocked database."""
    service = UserService(db=mock_database)
    users = service.get_all_users()

    assert len(users) == 1
    mock_database.query.assert_called_once()
```

#### TypeScript (vitest)
```typescript
import { describe, it, expect, vi } from 'vitest';
import { UserService } from './UserService';
import { ApiClient } from './ApiClient';

vi.mock('./ApiClient');

describe('UserService', () => {
  it('fetches user data', async () => {
    const mockApiClient = {
      get: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Test User'
      })
    };

    const service = new UserService(mockApiClient as any);
    const user = await service.getUser(1);

    expect(user.name).toBe('Test User');
    expect(mockApiClient.get).toHaveBeenCalledWith('/users/1');
  });

  it('handles API errors', async () => {
    const mockApiClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error'))
    };

    const service = new UserService(mockApiClient as any);

    await expect(service.getUser(1)).rejects.toThrow('Network error');
  });
});
```

### Fixture Patterns

#### Pytest Fixtures
```python
import pytest
from datetime import datetime

@pytest.fixture(scope="session")
def database_connection():
    """Database connection for entire test session."""
    conn = create_connection()
    yield conn
    conn.close()

@pytest.fixture(scope="module")
def sample_data():
    """Load sample data once per module."""
    return load_test_data()

@pytest.fixture
def user(db_session):
    """Create user for each test."""
    user = User(email="test@example.com")
    db_session.add(user)
    db_session.commit()
    yield user
    db_session.delete(user)
    db_session.commit()

@pytest.fixture
def authenticated_client(client, user):
    """Client with authentication."""
    token = generate_token(user)
    client.headers["Authorization"] = f"Bearer {token}"
    return client
```

## Integration Testing

### API Integration Tests (Python)
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_create_user(client):
    response = client.post(
        "/api/users",
        json={"email": "test@example.com", "password": "SecurePass123!"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

def test_get_user_requires_auth(client):
    response = client.get("/api/users/1")
    assert response.status_code == 401

def test_authenticated_request(client, auth_headers):
    response = client.get("/api/users/me", headers=auth_headers)
    assert response.status_code == 200
```

### Database Integration Tests
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, User

@pytest.fixture(scope="session")
def engine():
    return create_engine("sqlite:///:memory:")

@pytest.fixture(scope="session")
def tables(engine):
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def db_session(engine, tables):
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.rollback()
    session.close()

def test_create_user(db_session):
    user = User(email="test@example.com")
    db_session.add(user)
    db_session.commit()

    retrieved = db_session.query(User).filter_by(email="test@example.com").first()
    assert retrieved is not None
    assert retrieved.email == "test@example.com"
```

## End-to-End Testing

### Playwright (TypeScript)
```typescript
import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test('should register new user successfully', async ({ page }) => {
    // Navigate to registration page
    await page.goto('/register');

    // Fill form using modern locator API
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('input[name="password"]').fill('SecurePass123!');
    await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');

    // Submit form
    await page.locator('button[type="submit"]').click();

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // Verify welcome message
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('should show validation errors', async ({ page }) => {
    await page.goto('/register');

    // Submit empty form
    await page.locator('button[type="submit"]').click();

    // Verify error messages
    await expect(page.locator('[data-testid="email-error"]'))
      .toContainText('Email is required');
    await expect(page.locator('[data-testid="password-error"]'))
      .toContainText('Password is required');
  });
});
```

## Test Coverage

### Coverage Goals
- **Critical Business Logic**: 90%+
- **API Endpoints**: 80%+
- **Utility Functions**: 70%+
- **Overall Project**: 70%+

### Measuring Coverage

```bash
# Python
pytest --cov=src --cov-report=html --cov-report=term

# TypeScript
npm test -- --coverage
```

### Coverage Reports
```text
----------- coverage: platform linux, python 3.11 -----------
Name                     Stmts   Miss  Cover   Missing
------------------------------------------------------
src/__init__.py              0      0   100%
src/calculator.py           20      0   100%
src/user_service.py         45      3    93%   78-80
src/database.py             30      5    83%   45-49
------------------------------------------------------
TOTAL                       95      8    92%
```

## CI/CD Integration

### GitHub Actions
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -e '.[dev]'

      - name: Run tests
        run: |
          pytest --cov --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
```

## Testing Anti-Patterns

### ❌ Don't Test Implementation Details
```typescript
// ❌ Bad - Testing internal state
it('updates internal counter', () => {
  component.counter = 5;  // Accessing internal state
  expect(component.counter).toBe(5);
});

// ✅ Good - Testing behavior
it('displays updated count', () => {
  component.increment();
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

### ❌ Don't Write Flaky Tests
```python
# ❌ Bad - Time-dependent test
def test_cache_expiration():
    cache.set('key', 'value', ttl=1)
    time.sleep(1.1)  # Flaky timing
    assert cache.get('key') is None

# ✅ Good - Mock time
def test_cache_expiration(mocker):
    mocker.patch('time.time', return_value=1000)
    cache.set('key', 'value', ttl=1)

    mocker.patch('time.time', return_value=1002)
    assert cache.get('key') is None
```

### ❌ Don't Test Multiple Things
```python
# ❌ Bad - Testing too much
def test_user_workflow():
    user = create_user()
    user.login()
    user.update_profile()
    user.logout()
    # If this fails, which step broke?

# ✅ Good - Separate tests
def test_create_user():
    user = create_user()
    assert user.id is not None

def test_user_login():
    user = create_user()
    result = user.login()
    assert result.success is True
```

## Additional Resources

- `resources/pytest-advanced.md` - Advanced pytest techniques
- `resources/testing-react.md` - React component testing
- `resources/api-testing.md` - API testing strategies
- `resources/performance-testing.md` - Load and performance testing

## Best Practices Summary

1. **Write tests first** (TDD) or alongside code
2. **Test behavior, not implementation**
3. **Keep tests independent** - No shared state
4. **Use descriptive test names** - Clear what is being tested
5. **Follow AAA pattern** - Arrange, Act, Assert
6. **Mock external dependencies** - Tests should be fast
7. **Aim for high coverage** - But don't obsess over 100%
8. **Run tests in CI/CD** - Automated quality gates
9. **Test edge cases** - Empty inputs, nulls, boundaries
10. **Keep tests maintainable** - Refactor tests like production code
