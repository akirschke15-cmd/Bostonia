# Comprehensive Testing Patterns with Pytest

## Overview
Testing is critical for maintaining code quality and preventing regressions. This guide covers pytest fundamentals through advanced patterns including fixtures, mocking, parametrization, and testing strategies for different application types.

## Pytest Fundamentals

### Basic Test Structure
```python
# test_basic.py
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

def test_add():
    """Test the add function."""
    result = add(2, 3)
    assert result == 5

def test_add_negative():
    """Test add with negative numbers."""
    result = add(-1, -1)
    assert result == -2

def test_add_zero():
    """Test add with zero."""
    assert add(5, 0) == 5
    assert add(0, 5) == 5
```

### Test Organization
```text
project/
├── src/
│   └── myapp/
│       ├── __init__.py
│       ├── models.py
│       └── services.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Shared fixtures
│   ├── unit/                 # Unit tests
│   │   ├── __init__.py
│   │   ├── test_models.py
│   │   └── test_services.py
│   └── integration/          # Integration tests
│       ├── __init__.py
│       └── test_api.py
└── pytest.ini
```

### pytest.ini Configuration
```ini
[pytest]
# Test discovery patterns
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*

# Options
addopts =
    -v
    --strict-markers
    --cov=src
    --cov-report=html
    --cov-report=term-missing
    --tb=short

# Markers for test categorization
markers =
    unit: Unit tests
    integration: Integration tests
    slow: Slow running tests
    smoke: Smoke tests for CI
    asyncio: Async tests

# Test paths
testpaths = tests

# Ignore patterns
norecursedirs = .git .tox dist build *.egg
```

## Fixture Patterns

### Basic Fixtures
```python
import pytest
from typing import Generator

@pytest.fixture
def sample_data() -> dict:
    """Provide sample data for tests."""
    return {"name": "Alice", "age": 30}

def test_with_fixture(sample_data):
    """Test using fixture."""
    assert sample_data["name"] == "Alice"
    assert sample_data["age"] == 30

# Fixture with setup and teardown
@pytest.fixture
def temp_file() -> Generator[Path, None, None]:
    """Create temporary file."""
    from pathlib import Path
    import tempfile

    # Setup
    temp = Path(tempfile.mktemp())
    temp.write_text("test content")

    yield temp  # Provide to test

    # Teardown
    if temp.exists():
        temp.unlink()

def test_temp_file(temp_file):
    """Test with temporary file."""
    assert temp_file.exists()
    content = temp_file.read_text()
    assert content == "test content"
```

### Fixture Scopes
```python
import pytest

# Function scope (default) - runs for each test
@pytest.fixture(scope="function")
def function_fixture():
    print("\nSetup function fixture")
    yield "function data"
    print("\nTeardown function fixture")

# Module scope - runs once per module
@pytest.fixture(scope="module")
def module_fixture():
    print("\nSetup module fixture")
    yield "module data"
    print("\nTeardown module fixture")

# Session scope - runs once per test session
@pytest.fixture(scope="session")
def session_fixture():
    print("\nSetup session fixture")
    yield "session data"
    print("\nTeardown session fixture")

# Class scope - runs once per test class
@pytest.fixture(scope="class")
def class_fixture():
    return "class data"

class TestExample:
    def test_one(self, class_fixture):
        assert class_fixture == "class data"

    def test_two(self, class_fixture):
        assert class_fixture == "class data"
```

### Fixture Factories
```python
import pytest
from typing import Callable

@pytest.fixture
def user_factory() -> Callable:
    """Factory fixture for creating users."""
    created_users = []

    def _create_user(username: str = "testuser", email: str = None) -> dict:
        if email is None:
            email = f"{username}@example.com"

        user = {
            "id": len(created_users) + 1,
            "username": username,
            "email": email
        }
        created_users.append(user)
        return user

    return _create_user

def test_user_factory(user_factory):
    """Test using factory fixture."""
    user1 = user_factory("alice")
    user2 = user_factory("bob")

    assert user1["username"] == "alice"
    assert user2["username"] == "bob"
    assert user1["id"] != user2["id"]
```

### Fixture Dependencies
```python
import pytest

@pytest.fixture
def database_connection():
    """Mock database connection."""
    print("\nConnecting to database")
    conn = {"connected": True}
    yield conn
    print("\nClosing database connection")

@pytest.fixture
def database_session(database_connection):
    """Database session depends on connection."""
    print("\nCreating session")
    session = {"connection": database_connection, "active": True}
    yield session
    print("\nClosing session")

@pytest.fixture
def repository(database_session):
    """Repository depends on session."""
    return {"session": database_session, "data": []}

def test_with_dependencies(repository):
    """Test with dependent fixtures."""
    assert repository["session"]["active"] is True
    assert repository["session"]["connection"]["connected"] is True
```

## Parametrized Tests

### Basic Parametrization
```python
import pytest

@pytest.mark.parametrize("input,expected", [
    (2, 4),
    (3, 9),
    (4, 16),
    (5, 25),
])
def test_square(input, expected):
    """Test squaring numbers."""
    assert input ** 2 == expected

# Multiple parameters
@pytest.mark.parametrize("a,b,expected", [
    (1, 1, 2),
    (2, 3, 5),
    (-1, 1, 0),
    (0, 0, 0),
])
def test_add(a, b, expected):
    assert a + b == expected
```

### Parametrizing with IDs
```python
import pytest

@pytest.mark.parametrize(
    "username,email,valid",
    [
        ("alice", "alice@example.com", True),
        ("bob", "invalid-email", False),
        ("", "test@example.com", False),
        ("charlie", "charlie@example.com", True),
    ],
    ids=["valid_user", "invalid_email", "empty_username", "another_valid"]
)
def test_user_validation(username, email, valid):
    """Test user validation with clear test IDs."""
    result = validate_user(username, email)
    assert result == valid

def validate_user(username: str, email: str) -> bool:
    return bool(username) and "@" in email
```

### Parametrizing Fixtures
```python
import pytest

@pytest.fixture(params=["sqlite", "postgresql", "mysql"])
def database_type(request):
    """Test with different database types."""
    return request.param

def test_database_connection(database_type):
    """Test runs once for each database type."""
    print(f"\nTesting with {database_type}")
    assert database_type in ["sqlite", "postgresql", "mysql"]

# Combining parametrized fixture and test
@pytest.fixture(params=[1, 10, 100])
def batch_size(request):
    return request.param

@pytest.mark.parametrize("operation", ["insert", "update", "delete"])
def test_batch_operations(batch_size, operation):
    """Test runs for each combination of batch_size and operation."""
    print(f"\nTesting {operation} with batch size {batch_size}")
    assert batch_size > 0
    assert operation in ["insert", "update", "delete"]
```

## Mocking and Patching

### Basic Mocking
```python
import pytest
from unittest.mock import Mock, MagicMock

def test_mock_basic():
    """Basic mock usage."""
    mock = Mock()

    # Configure mock
    mock.return_value = 42
    assert mock() == 42

    # Check calls
    mock.assert_called_once()

    # Mock with side effects
    mock.side_effect = [1, 2, 3]
    assert mock() == 1
    assert mock() == 2
    assert mock() == 3

def test_magic_mock():
    """MagicMock supports magic methods."""
    mock = MagicMock()

    # Supports __getitem__
    mock.__getitem__.return_value = "value"
    assert mock["key"] == "value"

    # Supports __len__
    mock.__len__.return_value = 5
    assert len(mock) == 5
```

### Patching Functions
```python
import pytest
from unittest.mock import patch, call

# Module to test
# myapp/services.py
import requests

def fetch_user_data(user_id: int) -> dict:
    """Fetch user data from API."""
    response = requests.get(f"https://api.example.com/users/{user_id}")
    response.raise_for_status()
    return response.json()

# Test file
@patch('myapp.services.requests.get')
def test_fetch_user_data(mock_get):
    """Test with patched requests."""
    # Setup mock
    mock_response = Mock()
    mock_response.json.return_value = {"id": 1, "name": "Alice"}
    mock_response.status_code = 200
    mock_get.return_value = mock_response

    # Call function
    result = fetch_user_data(1)

    # Assertions
    assert result == {"id": 1, "name": "Alice"}
    mock_get.assert_called_once_with("https://api.example.com/users/1")

# Context manager patching
def test_with_context_manager():
    """Test with context manager patching."""
    with patch('myapp.services.requests.get') as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = {"id": 2, "name": "Bob"}
        mock_get.return_value = mock_response

        result = fetch_user_data(2)
        assert result["name"] == "Bob"
```

### Patching Objects and Methods
```python
from unittest.mock import patch, PropertyMock

class UserService:
    def __init__(self, db):
        self.db = db

    def get_user(self, user_id: int):
        return self.db.query(f"SELECT * FROM users WHERE id={user_id}")

    @property
    def connection_status(self):
        return self.db.is_connected()

@patch.object(UserService, 'get_user')
def test_patch_method(mock_get_user):
    """Patch instance method."""
    mock_get_user.return_value = {"id": 1, "name": "Alice"}

    service = UserService(db=None)
    result = service.get_user(1)

    assert result["name"] == "Alice"
    mock_get_user.assert_called_once_with(1)

@patch.object(UserService, 'connection_status', new_callable=PropertyMock)
def test_patch_property(mock_status):
    """Patch property."""
    mock_status.return_value = True

    service = UserService(db=None)
    assert service.connection_status is True
```

## Test Doubles

### Mocks
```python
from unittest.mock import Mock

def test_mock_interaction():
    """Mock tracks how it's called."""
    mock = Mock()
    mock.method(1, 2, key="value")

    # Verify call
    mock.method.assert_called_with(1, 2, key="value")
    assert mock.method.call_count == 1

    # Access call arguments
    args, kwargs = mock.method.call_args
    assert args == (1, 2)
    assert kwargs == {"key": "value"}
```

### Stubs
```python
def test_stub():
    """Stub provides canned responses."""
    stub = Mock()
    stub.get_config.return_value = {"timeout": 30, "retries": 3}

    config = stub.get_config()
    assert config["timeout"] == 30
```

### Spies
```python
from unittest.mock import Mock, wraps

def real_function(x: int) -> int:
    """Real function to spy on."""
    return x * 2

def test_spy():
    """Spy calls real function but tracks calls."""
    spy = Mock(wraps=real_function)

    result = spy(5)

    # Real function was called
    assert result == 10

    # Call was tracked
    spy.assert_called_once_with(5)
```

### Fakes
```python
class FakeDatabase:
    """Fake database for testing."""

    def __init__(self):
        self.data = {}

    def save(self, key: str, value: dict) -> None:
        self.data[key] = value

    def get(self, key: str) -> dict:
        return self.data.get(key)

    def delete(self, key: str) -> None:
        self.data.pop(key, None)

def test_with_fake_database():
    """Test using fake database."""
    db = FakeDatabase()

    # Use fake like real database
    db.save("user:1", {"name": "Alice"})
    user = db.get("user:1")

    assert user["name"] == "Alice"

    db.delete("user:1")
    assert db.get("user:1") is None
```

## Testing Async Code

### Basic Async Tests
```python
import pytest
import asyncio

@pytest.mark.asyncio
async def test_async_function():
    """Test async function."""
    result = await async_add(2, 3)
    assert result == 5

async def async_add(a: int, b: int) -> int:
    await asyncio.sleep(0.1)
    return a + b

@pytest.mark.asyncio
async def test_concurrent_operations():
    """Test concurrent async operations."""
    results = await asyncio.gather(
        async_add(1, 2),
        async_add(3, 4),
        async_add(5, 6)
    )
    assert results == [3, 7, 11]
```

### Async Fixtures
```python
import pytest
import asyncio

@pytest.fixture
async def async_client():
    """Async fixture with setup/teardown."""
    client = {"connected": False}

    # Setup
    await asyncio.sleep(0.1)
    client["connected"] = True

    yield client

    # Teardown
    await asyncio.sleep(0.1)
    client["connected"] = False

@pytest.mark.asyncio
async def test_with_async_fixture(async_client):
    """Test using async fixture."""
    assert async_client["connected"] is True
```

### Mocking Async Functions
```python
import pytest
from unittest.mock import AsyncMock, patch

async def fetch_data(url: str) -> dict:
    """Async function to test."""
    # Would normally make async HTTP request
    pass

@pytest.mark.asyncio
@patch('module.fetch_data', new_callable=AsyncMock)
async def test_async_mock(mock_fetch):
    """Test with async mock."""
    mock_fetch.return_value = {"data": "test"}

    result = await fetch_data("https://example.com")

    assert result == {"data": "test"}
    mock_fetch.assert_called_once_with("https://example.com")

@pytest.mark.asyncio
async def test_async_mock_side_effect():
    """Test async mock with side effects."""
    mock = AsyncMock()
    mock.side_effect = [1, 2, 3]

    assert await mock() == 1
    assert await mock() == 2
    assert await mock() == 3
```

## Testing Databases

### SQLite In-Memory Database
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from models import Base, User

@pytest.fixture(scope="function")
def db_session():
    """Create in-memory database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()

    yield session

    session.close()

def test_create_user(db_session):
    """Test user creation."""
    user = User(username="alice", email="alice@example.com")
    db_session.add(user)
    db_session.commit()

    # Query back
    retrieved = db_session.query(User).filter_by(username="alice").first()
    assert retrieved is not None
    assert retrieved.email == "alice@example.com"
```

### Factory Boy for Test Data
```python
import factory
from factory import Faker
from models import User, Post

class UserFactory(factory.Factory):
    """Factory for creating test users."""
    class Meta:
        model = User

    username = Faker('user_name')
    email = Faker('email')
    age = Faker('pyint', min_value=18, max_value=80)

class PostFactory(factory.Factory):
    """Factory for creating test posts."""
    class Meta:
        model = Post

    title = Faker('sentence', nb_words=4)
    content = Faker('paragraph', nb_sentences=5)
    author = factory.SubFactory(UserFactory)

def test_with_factories():
    """Test using factories."""
    # Create user with random data
    user = UserFactory()
    assert user.username is not None
    assert "@" in user.email

    # Create with specific data
    user = UserFactory(username="alice")
    assert user.username == "alice"

    # Create post with author
    post = PostFactory()
    assert post.author is not None
    assert post.title is not None

    # Create multiple
    users = UserFactory.create_batch(5)
    assert len(users) == 5
```

### Database Fixtures with Factories
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from factory.alchemy import SQLAlchemyModelFactory

@pytest.fixture(scope="session")
def db_engine():
    """Create test database engine."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine

@pytest.fixture
def db_session(db_engine):
    """Create database session."""
    SessionLocal = sessionmaker(bind=db_engine)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()

class UserFactory(SQLAlchemyModelFactory):
    """SQLAlchemy-aware factory."""
    class Meta:
        model = User
        sqlalchemy_session = None  # Set dynamically

    username = Faker('user_name')
    email = Faker('email')

@pytest.fixture
def user_factory(db_session):
    """Factory fixture with session."""
    UserFactory._meta.sqlalchemy_session = db_session
    return UserFactory

def test_with_db_factory(user_factory, db_session):
    """Test with factory that saves to database."""
    user = user_factory.create()

    # User is in database
    retrieved = db_session.query(User).filter_by(id=user.id).first()
    assert retrieved is not None
    assert retrieved.username == user.username
```

## Coverage Strategies

### Measuring Coverage
```bash
# Run tests with coverage
pytest --cov=src --cov-report=html --cov-report=term-missing

# Coverage for specific modules
pytest --cov=src.myapp.services --cov-report=term

# Fail if coverage below threshold
pytest --cov=src --cov-fail-under=80
```

### Coverage Configuration
```ini
# .coveragerc or pyproject.toml
[coverage:run]
source = src
omit =
    */tests/*
    */migrations/*
    */__pycache__/*
    */venv/*

[coverage:report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    @abstractmethod
```

### Branch Coverage
```python
# Enable branch coverage
pytest --cov=src --cov-branch

def process_value(value: int) -> str:
    """Function with branches."""
    if value > 0:  # Branch 1
        return "positive"
    elif value < 0:  # Branch 2
        return "negative"
    else:  # Branch 3
        return "zero"

# Test all branches
def test_positive():
    assert process_value(1) == "positive"

def test_negative():
    assert process_value(-1) == "negative"

def test_zero():
    assert process_value(0) == "zero"
```

## Property-Based Testing

### Hypothesis Basics
```python
from hypothesis import given, strategies as st

@given(st.integers())
def test_absolute_value(n):
    """Test that absolute value is always non-negative."""
    assert abs(n) >= 0

@given(st.integers(), st.integers())
def test_addition_commutative(a, b):
    """Test that addition is commutative."""
    assert a + b == b + a

@given(st.text())
def test_string_reverse(s):
    """Test reversing a string twice returns original."""
    assert s == s[::-1][::-1]
```

### Custom Strategies
```python
from hypothesis import given, strategies as st
from dataclasses import dataclass

@dataclass
class User:
    username: str
    email: str
    age: int

# Custom strategy for User
user_strategy = st.builds(
    User,
    username=st.text(min_size=3, max_size=20),
    email=st.emails(),
    age=st.integers(min_value=18, max_value=100)
)

@given(user_strategy)
def test_user_validation(user):
    """Test user validation with random users."""
    assert len(user.username) >= 3
    assert "@" in user.email
    assert 18 <= user.age <= 100
```

### Stateful Testing
```python
from hypothesis.stateful import RuleBasedStateMachine, rule, initialize
from hypothesis import strategies as st

class ShoppingCart:
    def __init__(self):
        self.items = {}

    def add_item(self, item_id: str, quantity: int):
        self.items[item_id] = self.items.get(item_id, 0) + quantity

    def remove_item(self, item_id: str, quantity: int):
        if item_id in self.items:
            self.items[item_id] = max(0, self.items[item_id] - quantity)

    def get_quantity(self, item_id: str) -> int:
        return self.items.get(item_id, 0)

class ShoppingCartStateMachine(RuleBasedStateMachine):
    """Stateful testing of shopping cart."""

    @initialize()
    def init_cart(self):
        self.cart = ShoppingCart()
        self.expected = {}

    @rule(item_id=st.text(min_size=1, max_size=10), quantity=st.integers(min_value=1, max_value=10))
    def add_item(self, item_id, quantity):
        self.cart.add_item(item_id, quantity)
        self.expected[item_id] = self.expected.get(item_id, 0) + quantity
        assert self.cart.get_quantity(item_id) == self.expected[item_id]

    @rule(item_id=st.text(min_size=1, max_size=10), quantity=st.integers(min_value=1, max_value=10))
    def remove_item(self, item_id, quantity):
        self.cart.remove_item(item_id, quantity)
        self.expected[item_id] = max(0, self.expected.get(item_id, 0) - quantity)
        assert self.cart.get_quantity(item_id) == self.expected[item_id]

TestShoppingCart = ShoppingCartStateMachine.TestCase
```

## Integration vs Unit Tests

### Unit Test Example
```python
# Unit test: Tests single function in isolation
from myapp.services import calculate_price

def test_calculate_price():
    """Unit test for price calculation."""
    price = calculate_price(quantity=2, unit_price=10.0, tax_rate=0.1)
    assert price == 22.0  # 2 * 10 * 1.1
```

### Integration Test Example
```python
# Integration test: Tests multiple components together
import pytest
from fastapi.testclient import TestClient
from myapp.main import app
from myapp.database import get_db
from tests.utils import get_test_db

@pytest.fixture
def client():
    """Test client with test database."""
    app.dependency_overrides[get_db] = get_test_db
    with TestClient(app) as client:
        yield client

def test_create_and_get_user(client):
    """Integration test for user creation and retrieval."""
    # Create user
    response = client.post(
        "/users/",
        json={"username": "alice", "email": "alice@example.com"}
    )
    assert response.status_code == 201
    user_id = response.json()["id"]

    # Get user
    response = client.get(f"/users/{user_id}")
    assert response.status_code == 200
    assert response.json()["username"] == "alice"

    # List users
    response = client.get("/users/")
    assert response.status_code == 200
    assert len(response.json()) >= 1
```

## Test Organization Best Practices

### Good: Clear Test Names
```python
# GOOD: Descriptive test names
def test_user_creation_with_valid_email_succeeds():
    pass

def test_user_creation_with_invalid_email_raises_validation_error():
    pass

# BAD: Unclear test names
def test_user_1():
    pass

def test_user_2():
    pass
```

### Good: Arrange-Act-Assert Pattern
```python
def test_shopping_cart_total():
    # Arrange
    cart = ShoppingCart()
    cart.add_item("item1", price=10.0, quantity=2)
    cart.add_item("item2", price=5.0, quantity=3)

    # Act
    total = cart.calculate_total()

    # Assert
    assert total == 35.0
```

### Good: One Assertion Per Test
```python
# GOOD: Single logical assertion
def test_user_email_validation():
    with pytest.raises(ValueError, match="Invalid email"):
        User(email="invalid")

def test_user_username_validation():
    with pytest.raises(ValueError, match="Username too short"):
        User(username="ab")

# BAD: Multiple unrelated assertions
def test_user_validation():
    with pytest.raises(ValueError):
        User(email="invalid")
    with pytest.raises(ValueError):
        User(username="ab")
```

## Best Practices

1. **Use fixtures for setup**: Avoid repetitive setup code
2. **Parametrize tests**: Test multiple cases efficiently
3. **Mock external dependencies**: Keep tests fast and isolated
4. **Use factories for test data**: Generate realistic test data easily
5. **Test behavior, not implementation**: Focus on what, not how
6. **Keep tests independent**: Tests should not depend on each other
7. **Use meaningful test names**: Describe what is being tested
8. **Follow AAA pattern**: Arrange, Act, Assert
9. **Test edge cases**: Empty inputs, null values, boundaries
10. **Aim for high coverage**: But focus on critical paths first
11. **Use hypothesis for complex logic**: Find edge cases automatically
12. **Separate unit and integration tests**: Different speeds and purposes
13. **Keep tests fast**: Fast tests get run more often
14. **Test async code properly**: Use pytest-asyncio and async fixtures
15. **Review test quality**: Tests are code too, maintain them well

This guide provides comprehensive patterns for building robust test suites with pytest.
