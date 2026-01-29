# Python Development Skill

## Overview
This skill provides comprehensive guidance for Python development, covering modern best practices, popular frameworks, testing strategies, and tooling recommendations. It helps you write clean, maintainable, and production-ready Python code.

## When This Skill Activates
- Working with `.py` files
- Python project setup (pyproject.toml, requirements.txt)
- Python frameworks (Django, Flask, FastAPI)
- Python testing and debugging
- Data science with Python (pandas, NumPy)

## Quick Reference

### Project Structure
```text
my-python-project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── main.py
│       └── utils.py
├── tests/
│   ├── __init__.py
│   └── test_main.py
├── pyproject.toml
├── README.md
└── .gitignore
```

### Modern Python Setup (pyproject.toml)
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "my-package"
version = "0.1.0"
description = "A modern Python package"
requires-python = ">=3.10"
dependencies = [
    "requests>=2.31.0",
    "pydantic>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "ruff>=0.1.0",
    "mypy>=1.5.0",
]

[tool.ruff]
line-length = 100
select = ["E", "F", "I", "N", "W", "UP"]
ignore = []

[tool.mypy]
python_version = "3.10"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"
addopts = "--cov=src --cov-report=html --cov-report=term"
```

### Type Hints Best Practices
```python
from typing import Any, List, Dict, Optional, Union, Literal
from collections.abc import Sequence, Mapping
from dataclasses import dataclass

# Modern union syntax (Python 3.10+)
def process_data(data: str | int) -> dict[str, Any]:
    """Process data and return results."""
    return {"result": str(data)}

# Optional with None default
def get_user(user_id: int, include_deleted: bool = False) -> Optional[User]:
    """Retrieve user by ID."""
    pass

# Generic collections
def filter_items(items: Sequence[Item], key: str) -> list[Item]:
    """Filter items by key."""
    return [item for item in items if hasattr(item, key)]

# Literal types for constants
Status = Literal["pending", "active", "completed"]

def update_status(status: Status) -> None:
    """Update status to a valid value."""
    pass

# Dataclasses for structured data
@dataclass
class User:
    id: int
    name: str
    email: str
    is_active: bool = True
```

### Pydantic for Validation
```python
from pydantic import BaseModel, EmailStr, Field, validator
from datetime import datetime

class User(BaseModel):
    id: int
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    created_at: datetime = Field(default_factory=datetime.now)
    age: int = Field(..., ge=0, le=150)

    @validator('name')
    def name_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "John Doe",
                "email": "john@example.com",
                "age": 30
            }
        }

# Usage
user = User(id=1, name="John", email="john@example.com", age=30)
print(user.model_dump_json())  # Serialize to JSON
```

## Framework Quick Guides

### FastAPI (Modern Async API)
```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import List

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    is_available: bool = True

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/items", response_model=List[Item])
async def list_items(skip: int = 0, limit: int = 10):
    # Fetch items from database
    return items[skip:skip + limit]

@app.post("/items", response_model=Item, status_code=201)
async def create_item(item: Item):
    # Save to database
    return item

@app.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail="Item not found")
    return items_db[item_id]
```

### Django (Full-Featured Web Framework)
See `resources/django-guide.md` for comprehensive Django patterns.

### Flask (Lightweight Web Framework)
See `resources/flask-guide.md` for Flask best practices.

## Testing with pytest

### Basic Test Structure
```python
# tests/test_calculator.py
import pytest
from myapp.calculator import Calculator

@pytest.fixture
def calculator():
    """Provide a calculator instance for tests."""
    return Calculator()

def test_addition(calculator):
    """Test basic addition."""
    result = calculator.add(2, 3)
    assert result == 5

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

### Mocking with pytest
```python
from unittest.mock import Mock, patch
import pytest

@pytest.fixture
def mock_database():
    """Mock database connection."""
    return Mock()

def test_user_service_with_mock(mock_database):
    """Test service with mocked database."""
    mock_database.get_user.return_value = {"id": 1, "name": "Test"}

    service = UserService(mock_database)
    user = service.get_user(1)

    assert user["name"] == "Test"
    mock_database.get_user.assert_called_once_with(1)

@patch('myapp.external_api.requests.get')
def test_external_api_call(mock_get):
    """Test external API call with patching."""
    mock_get.return_value.json.return_value = {"status": "ok"}

    response = fetch_data()

    assert response["status"] == "ok"
    mock_get.assert_called_once()
```

## Common Patterns

### Context Managers
```python
from contextlib import contextmanager
from typing import Generator

@contextmanager
def database_transaction(db) -> Generator:
    """Context manager for database transactions."""
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

# Usage
with database_transaction(db) as conn:
    conn.execute("INSERT INTO users ...")
```

### Async/Await
```python
import asyncio
import aiohttp

async def fetch_url(session: aiohttp.ClientSession, url: str) -> str:
    """Fetch URL asynchronously."""
    async with session.get(url) as response:
        return await response.text()

async def fetch_multiple_urls(urls: list[str]) -> list[str]:
    """Fetch multiple URLs concurrently."""
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, url) for url in urls]
        return await asyncio.gather(*tasks)

# Run
results = asyncio.run(fetch_multiple_urls([url1, url2, url3]))
```

### Error Handling
```python
class ApplicationError(Exception):
    """Base exception for application errors."""
    pass

class ValidationError(ApplicationError):
    """Raised when validation fails."""
    pass

class NotFoundError(ApplicationError):
    """Raised when resource is not found."""
    pass

def process_user(user_id: int) -> User:
    """Process user with proper error handling."""
    try:
        user = get_user(user_id)
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        raise ApplicationError("Failed to fetch user") from e

    if not user:
        raise NotFoundError(f"User {user_id} not found")

    return user
```

## Tooling & Development Workflow

### Essential Tools
- **Ruff**: Fast linting and formatting (replaces black, flake8, isort)
- **mypy**: Static type checker
- **pytest**: Testing framework
- **pytest-cov**: Coverage reporting
- **pre-commit**: Git hooks for quality checks

### Pre-commit Configuration
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.14
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
```

## Additional Resources

For detailed guidance on specific topics:

### Framework Guides
- `resources/django-guide.md` (675 lines) - Django framework patterns, models, DRF, authentication, testing, performance optimization
- `resources/fastapi-guide.md` (691 lines) - FastAPI application structure, Pydantic schemas, async patterns, security, testing
- `resources/flask-guide.md` (550+ lines) - Flask application factory, blueprints, SQLAlchemy, JWT authentication, testing

### Development Patterns
- `resources/async-patterns.md` (989 lines) - Advanced async/await, asyncio fundamentals, concurrent execution, async I/O, testing async code
- `resources/database-patterns.md` (943 lines) - SQLAlchemy Core/ORM, relationships, query optimization, migrations, connection pooling, N+1 solutions
- `resources/testing-patterns.md` (991 lines) - pytest fixtures, parametrization, mocking, property-based testing, coverage strategies, test organization
- `resources/api-security.md` (1,216 lines) - Authentication (JWT, OAuth2), authorization, rate limiting, CORS, input validation, OWASP Top 10

**Total: 6,055+ lines of Python guidance across 7 comprehensive resource files**

## Best Practices Summary

1. **Type Hints**: Use comprehensive type hints for better IDE support and error detection
2. **Dataclasses/Pydantic**: Use for structured data with validation
3. **Testing**: Write tests with pytest, aim for high coverage
4. **Error Handling**: Use custom exceptions, provide context
5. **Async**: Use async/await for I/O-bound operations
6. **Documentation**: Write clear docstrings (Google or NumPy style)
7. **Tooling**: Use ruff for linting/formatting, mypy for type checking
8. **Dependencies**: Pin versions, use pyproject.toml
9. **Virtual Environments**: Always use venv or poetry
10. **Pre-commit Hooks**: Automate quality checks

## Common Pitfalls to Avoid

- ❌ Mutable default arguments: `def func(items=[])`
- ❌ Using `except Exception` without re-raising
- ❌ Not closing resources (use context managers)
- ❌ Circular imports
- ❌ Using `any` type instead of proper type hints
- ❌ Not validating user input
- ❌ Hardcoding credentials
- ❌ Ignoring code quality tools (linters, formatters)
