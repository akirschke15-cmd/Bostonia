# Database Patterns with SQLAlchemy

## Overview
SQLAlchemy is the most popular Python SQL toolkit and ORM. This guide covers both Core (SQL abstraction) and ORM (object-relational mapping) patterns, with best practices for building scalable database applications.

## SQLAlchemy Core vs ORM

### When to Use Core
```python
from sqlalchemy import create_engine, text, Table, Column, Integer, String, MetaData

# Core: Lower-level, explicit SQL construction
engine = create_engine("postgresql://user:pass@localhost/db")

# Raw SQL with text()
with engine.connect() as conn:
    result = conn.execute(
        text("SELECT * FROM users WHERE age > :age"),
        {"age": 25}
    )
    for row in result:
        print(row)

# SQL Expression Language
metadata = MetaData()
users = Table('users', metadata,
    Column('id', Integer, primary_key=True),
    Column('name', String(50)),
    Column('age', Integer)
)

# Build queries programmatically
stmt = users.select().where(users.c.age > 25)
with engine.connect() as conn:
    result = conn.execute(stmt)
```

### When to Use ORM
```python
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import Session, DeclarativeBase

# ORM: Higher-level, object-oriented approach
class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    age = Column(Integer)

    def __repr__(self):
        return f"User(id={self.id}, name={self.name}, age={self.age})"

# Create tables
engine = create_engine("postgresql://user:pass@localhost/db")
Base.metadata.create_all(engine)

# Use ORM
with Session(engine) as session:
    # Create
    user = User(name="Alice", age=30)
    session.add(user)
    session.commit()

    # Query
    users = session.query(User).filter(User.age > 25).all()
    print(users)
```

## Modern SQLAlchemy 2.0 Setup

### Database Configuration
```python
from typing import AsyncGenerator
from sqlalchemy import create_engine, pool
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Synchronous setup
SYNC_DATABASE_URL = "postgresql://user:pass@localhost:5432/mydb"

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=True,  # Log SQL statements
    pool_size=10,  # Connection pool size
    max_overflow=20,  # Additional connections
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,  # Recycle connections after 1 hour
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine
)

# Async setup
ASYNC_DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/mydb"

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for models
class Base(DeclarativeBase):
    pass

# Dependency for FastAPI
def get_db() -> Session:
    """Dependency for getting DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
```

## Model Relationships

### One-to-Many Relationship
```python
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from typing import List, Optional
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # One user has many posts
    posts: Mapped[List["Post"]] = relationship(
        back_populates="author",
        cascade="all, delete-orphan"  # Delete posts when user deleted
    )

    def __repr__(self):
        return f"User(id={self.id}, username={self.username})"

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Foreign key to user
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Many posts belong to one user
    author: Mapped["User"] = relationship(back_populates="posts")

    def __repr__(self):
        return f"Post(id={self.id}, title={self.title})"

# Usage
with Session(engine) as session:
    # Create user with posts
    user = User(username="alice", email="alice@example.com")
    user.posts = [
        Post(title="First Post", content="Hello World"),
        Post(title="Second Post", content="More content")
    ]
    session.add(user)
    session.commit()

    # Query with relationship
    user = session.query(User).filter_by(username="alice").first()
    print(f"User {user.username} has {len(user.posts)} posts")
    for post in user.posts:
        print(f"  - {post.title}")
```

### Many-to-Many Relationship
```python
from sqlalchemy import Table, Column, Integer, ForeignKey

# Association table for many-to-many
post_tags = Table(
    "post_tags",
    Base.metadata,
    Column("post_id", Integer, ForeignKey("posts.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True)
)

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

    # Many-to-many relationship
    tags: Mapped[List["Tag"]] = relationship(
        secondary=post_tags,
        back_populates="posts"
    )

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)

    # Many-to-many relationship
    posts: Mapped[List["Post"]] = relationship(
        secondary=post_tags,
        back_populates="tags"
    )

# Usage
with Session(engine) as session:
    # Create tags
    python_tag = Tag(name="python")
    web_tag = Tag(name="web")

    # Create post with tags
    post = Post(
        title="Python Web Development",
        content="Learn FastAPI and SQLAlchemy",
        tags=[python_tag, web_tag]
    )

    session.add(post)
    session.commit()

    # Query posts by tag
    posts = session.query(Post).join(Post.tags).filter(Tag.name == "python").all()
```

### One-to-One Relationship
```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)

    # One-to-one with profile
    profile: Mapped["UserProfile"] = relationship(
        back_populates="user",
        uselist=False,  # This makes it one-to-one
        cascade="all, delete-orphan"
    )

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    bio: Mapped[Optional[str]] = mapped_column(Text)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))

    # One-to-one with user
    user: Mapped["User"] = relationship(back_populates="profile")

# Usage
with Session(engine) as session:
    user = User(username="alice")
    user.profile = UserProfile(bio="Python developer", avatar_url="https://...")
    session.add(user)
    session.commit()
```

## Query Optimization

### Eager Loading vs Lazy Loading
```python
from sqlalchemy.orm import joinedload, selectinload, subqueryload

# BAD: Lazy loading causes N+1 queries
with Session(engine) as session:
    users = session.query(User).all()
    for user in users:
        print(user.posts)  # Each access triggers new query!

# GOOD: Eager loading with joinedload (LEFT OUTER JOIN)
with Session(engine) as session:
    users = session.query(User).options(
        joinedload(User.posts)
    ).all()
    for user in users:
        print(user.posts)  # No additional queries

# GOOD: selectinload (separate SELECT IN query)
with Session(engine) as session:
    users = session.query(User).options(
        selectinload(User.posts)
    ).all()

# GOOD: subqueryload (uses subquery)
with Session(engine) as session:
    users = session.query(User).options(
        subqueryload(User.posts)
    ).all()

# Nested eager loading
with Session(engine) as session:
    posts = session.query(Post).options(
        joinedload(Post.author).joinedload(User.profile),
        selectinload(Post.tags)
    ).all()
```

### Select Only Needed Columns
```python
from sqlalchemy import select

# BAD: Loading all columns
with Session(engine) as session:
    users = session.query(User).all()

# GOOD: Load only needed columns
with Session(engine) as session:
    # Returns tuples
    results = session.query(User.id, User.username).all()

    # Or use select() for modern syntax
    stmt = select(User.id, User.username)
    results = session.execute(stmt).all()

# Load partial models with load_only
from sqlalchemy.orm import load_only

with Session(engine) as session:
    users = session.query(User).options(
        load_only(User.id, User.username)
    ).all()

# Defer heavy columns
from sqlalchemy.orm import defer

with Session(engine) as session:
    posts = session.query(Post).options(
        defer(Post.content)  # Don't load content initially
    ).all()
```

### Efficient Counting
```python
from sqlalchemy import func, select

# BAD: Loads all rows into memory
with Session(engine) as session:
    count = len(session.query(User).all())

# GOOD: Count in database
with Session(engine) as session:
    count = session.query(User).count()

    # Or modern syntax
    count = session.scalar(select(func.count()).select_from(User))

# Count with filter
with Session(engine) as session:
    active_count = session.query(User).filter(User.is_active == True).count()
```

## Connection Pooling

### Pool Configuration
```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool, NullPool, StaticPool

# Standard connection pool
engine = create_engine(
    "postgresql://user:pass@localhost/db",
    poolclass=QueuePool,
    pool_size=10,  # Maintain 10 connections
    max_overflow=20,  # Allow 20 additional connections
    pool_timeout=30,  # Wait 30s for connection
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_pre_ping=True  # Test connections before use
)

# No pooling (for serverless)
engine = create_engine(
    "postgresql://user:pass@localhost/db",
    poolclass=NullPool
)

# Static pool (for testing with SQLite)
engine = create_engine(
    "sqlite:///:memory:",
    poolclass=StaticPool
)

# Pool events for monitoring
from sqlalchemy import event

@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    print("New connection established")

@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_conn, connection_record, connection_proxy):
    print("Connection checked out from pool")

@event.listens_for(engine, "checkin")
def receive_checkin(dbapi_conn, connection_record):
    print("Connection returned to pool")
```

## Transaction Management

### Basic Transactions
```python
from sqlalchemy.exc import SQLAlchemyError

# Automatic commit/rollback with context manager
with Session(engine) as session:
    try:
        user = User(username="alice", email="alice@example.com")
        session.add(user)
        session.commit()
    except SQLAlchemyError as e:
        session.rollback()
        print(f"Error: {e}")
        raise

# Manual transaction control
session = Session(engine)
try:
    user = User(username="bob", email="bob@example.com")
    session.add(user)
    session.flush()  # Send to DB but don't commit

    # More operations...
    post = Post(title="Test", content="Content", author=user)
    session.add(post)

    session.commit()
except Exception:
    session.rollback()
    raise
finally:
    session.close()
```

### Nested Transactions (Savepoints)
```python
with Session(engine) as session:
    user = User(username="alice", email="alice@example.com")
    session.add(user)

    # Create savepoint
    savepoint = session.begin_nested()
    try:
        # This might fail
        duplicate = User(username="alice", email="other@example.com")
        session.add(duplicate)
        session.flush()
    except SQLAlchemyError:
        savepoint.rollback()
        print("Rolled back to savepoint")
    else:
        savepoint.commit()

    session.commit()
```

### Isolation Levels
```python
from sqlalchemy import create_engine

# Set isolation level
engine = create_engine(
    "postgresql://user:pass@localhost/db",
    isolation_level="REPEATABLE READ"
)

# Or per-connection
with engine.connect() as conn:
    conn.execution_options(isolation_level="SERIALIZABLE")
    # Execute queries...
```

## Alembic Migrations

### Initial Setup
```bash
# Install alembic
pip install alembic

# Initialize alembic
alembic init alembic

# Configure alembic.ini
# sqlalchemy.url = postgresql://user:pass@localhost/db
```

### Migration Configuration
```python
# alembic/env.py
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Import your Base and models
from app.models import Base
from app.config import settings

# Set target metadata
target_metadata = Base.metadata

def run_migrations_online():
    """Run migrations in 'online' mode."""
    # Get database URL from settings
    configuration = context.config.get_section(context.config.config_ini_section)
    configuration["sqlalchemy.url"] = settings.DATABASE_URL

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,  # Detect column type changes
            compare_server_default=True  # Detect default changes
        )

        with context.begin_transaction():
            context.run_migrations()
```

### Creating Migrations
```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "Add user profile table"

# Create empty migration
alembic revision -m "Custom migration"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# Show current version
alembic current

# Show migration history
alembic history
```

### Migration Example
```python
# alembic/versions/xxx_add_user_profile.py
from alembic import op
import sqlalchemy as sa

def upgrade():
    """Upgrade database schema."""
    # Create table
    op.create_table(
        'user_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )

    # Create index
    op.create_index('ix_user_profiles_user_id', 'user_profiles', ['user_id'])

    # Add column to existing table
    op.add_column('users', sa.Column('last_login', sa.DateTime(), nullable=True))

def downgrade():
    """Rollback database schema."""
    op.drop_index('ix_user_profiles_user_id', table_name='user_profiles')
    op.drop_table('user_profiles')
    op.drop_column('users', 'last_login')
```

## Database Indexing Strategies

### Basic Indexes
```python
from sqlalchemy import Index

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)

    # Composite index
    __table_args__ = (
        Index('ix_user_email_created', 'email', 'created_at'),
    )

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    published: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    # Partial index (PostgreSQL)
    __table_args__ = (
        Index(
            'ix_published_posts',
            'created_at',
            postgresql_where=(published == True)
        ),
    )
```

### Full-Text Search Index
```python
from sqlalchemy import Index, func
from sqlalchemy.dialects.postgresql import TSVECTOR

class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

    # PostgreSQL full-text search
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', title || ' ' || content)",
            persisted=True
        )
    )

    __table_args__ = (
        Index('ix_article_search', 'search_vector', postgresql_using='gin'),
    )

# Query with full-text search
with Session(engine) as session:
    query = "python web development"
    results = session.query(Article).filter(
        Article.search_vector.match(query)
    ).all()
```

## N+1 Query Problem Solutions

### Problem Example
```python
# BAD: N+1 query problem
with Session(engine) as session:
    posts = session.query(Post).all()  # 1 query

    for post in posts:
        print(f"{post.title} by {post.author.username}")  # N queries!
```

### Solution 1: Eager Loading
```python
# GOOD: Single query with JOIN
with Session(engine) as session:
    posts = session.query(Post).options(
        joinedload(Post.author)
    ).all()

    for post in posts:
        print(f"{post.title} by {post.author.username}")  # No additional queries
```

### Solution 2: Select IN Loading
```python
# GOOD: Two queries (better for large datasets)
with Session(engine) as session:
    posts = session.query(Post).options(
        selectinload(Post.author)
    ).all()

    for post in posts:
        print(f"{post.title} by {post.author.username}")
```

### Solution 3: Subquery Loading
```python
# GOOD: Uses subquery
with Session(engine) as session:
    posts = session.query(Post).options(
        subqueryload(Post.tags)
    ).all()

    for post in posts:
        print(f"{post.title}: {', '.join(t.name for t in post.tags)}")
```

## Raw SQL When Needed

### Executing Raw SQL
```python
from sqlalchemy import text

# Simple raw SQL
with Session(engine) as session:
    result = session.execute(
        text("SELECT * FROM users WHERE age > :age"),
        {"age": 25}
    )
    for row in result:
        print(row)

# Return ORM objects
with Session(engine) as session:
    users = session.query(User).from_statement(
        text("SELECT * FROM users WHERE age > :age")
    ).params(age=25).all()

# Complex aggregation query
with Session(engine) as session:
    result = session.execute(text("""
        SELECT
            u.username,
            COUNT(p.id) as post_count,
            AVG(LENGTH(p.content)) as avg_content_length
        FROM users u
        LEFT JOIN posts p ON p.author_id = u.id
        GROUP BY u.id, u.username
        HAVING COUNT(p.id) > :min_posts
        ORDER BY post_count DESC
    """), {"min_posts": 5})

    for row in result:
        print(f"{row.username}: {row.post_count} posts")
```

### Bulk Operations
```python
from sqlalchemy import insert, update, delete

# Bulk insert (fastest)
with Session(engine) as session:
    stmt = insert(User).values([
        {"username": "user1", "email": "user1@example.com"},
        {"username": "user2", "email": "user2@example.com"},
        {"username": "user3", "email": "user3@example.com"},
    ])
    session.execute(stmt)
    session.commit()

# Bulk update
with Session(engine) as session:
    stmt = (
        update(User)
        .where(User.created_at < datetime(2023, 1, 1))
        .values(is_active=False)
    )
    session.execute(stmt)
    session.commit()

# ORM bulk operations (slower but tracks objects)
with Session(engine) as session:
    users = [
        User(username=f"user{i}", email=f"user{i}@example.com")
        for i in range(1000)
    ]
    session.bulk_save_objects(users)
    session.commit()
```

## Async SQLAlchemy

### Async Models and Queries
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select

# Create async engine
async_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    echo=True
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Async queries
async def get_user(user_id: int) -> Optional[User]:
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

async def create_user(username: str, email: str) -> User:
    async with AsyncSessionLocal() as session:
        user = User(username=username, email=email)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

async def get_users_with_posts() -> List[User]:
    async with AsyncSessionLocal() as session:
        stmt = select(User).options(selectinload(User.posts))
        result = await session.execute(stmt)
        return result.scalars().all()

# Run async code
import asyncio
asyncio.run(get_user(1))
```

## Best Practices

### Good: Use Context Managers
```python
# GOOD
with Session(engine) as session:
    user = session.query(User).first()
    # Session automatically closed

# BAD
session = Session(engine)
user = session.query(User).first()
# Session not closed!
```

### Good: Use Type Hints
```python
from typing import List, Optional

# GOOD: Clear types
def get_active_users(session: Session) -> List[User]:
    return session.query(User).filter(User.is_active == True).all()

def get_user_by_id(session: Session, user_id: int) -> Optional[User]:
    return session.query(User).filter(User.id == user_id).first()
```

### Good: Separate Business Logic
```python
# GOOD: Repository pattern
class UserRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.session.query(User).filter(User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[User]:
        return self.session.query(User).filter(User.email == email).first()

    def create(self, username: str, email: str) -> User:
        user = User(username=username, email=email)
        self.session.add(user)
        self.session.flush()
        return user

    def get_with_posts(self, user_id: int) -> Optional[User]:
        return (
            self.session.query(User)
            .options(selectinload(User.posts))
            .filter(User.id == user_id)
            .first()
        )

# Usage
with Session(engine) as session:
    repo = UserRepository(session)
    user = repo.create("alice", "alice@example.com")
    session.commit()
```

### Good: Use Enums
```python
from enum import Enum
from sqlalchemy import Enum as SQLEnum

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50))
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.USER)
```

## Summary

1. **Use ORM for most cases**: Cleaner code, better maintainability
2. **Eager load relationships**: Prevent N+1 queries
3. **Index strategically**: Index columns used in WHERE, JOIN, ORDER BY
4. **Use connection pooling**: Better performance under load
5. **Handle transactions properly**: Use context managers, rollback on errors
6. **Use Alembic for migrations**: Version control for database schema
7. **Select only needed data**: Use `load_only()` and `defer()`
8. **Use bulk operations**: For inserting/updating many rows
9. **Raw SQL when needed**: Complex queries, aggregations, performance
10. **Separate concerns**: Repository pattern, type hints, clear interfaces

This guide provides comprehensive patterns for building robust database applications with SQLAlchemy.
