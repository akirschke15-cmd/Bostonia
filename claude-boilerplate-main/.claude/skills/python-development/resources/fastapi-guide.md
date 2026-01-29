# FastAPI Framework Guide

## Overview
FastAPI is a modern, high-performance web framework for building APIs with Python 3.7+ based on standard Python type hints. It's one of the fastest Python frameworks available and provides automatic API documentation.

## Project Structure

```text
myapi/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── dependencies.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── endpoints/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── users.py
│   │   │   │   └── products.py
│   │   │   └── api.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── product.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── product.py
│   ├── crud/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── user.py
│   │   └── product.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── session.py
│   └── core/
│       ├── __init__.py
│       ├── security.py
│       └── config.py
├── tests/
├── alembic/
├── pyproject.toml
└── .env
```

## Dependencies

```toml
[project]
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "sqlalchemy>=2.0.0",
    "pydantic>=2.4.0",
    "pydantic-settings>=2.0.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "python-multipart>=0.0.6",
    "alembic>=1.12.0",
    "psycopg2-binary>=2.9.0",
]
```

## Main Application

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1.api import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include routers
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.on_event("startup")
async def startup_event():
    # Initialize connections, load ML models, etc.
    print("Application startup")

@app.on_event("shutdown")
async def shutdown_event():
    # Close connections, cleanup
    print("Application shutdown")
```

## Configuration with Pydantic Settings

```python
# app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    # API
    PROJECT_NAME: str = "My API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "API Description"
    API_V1_PREFIX: str = "/api/v1"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Database
    DATABASE_URL: str

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True
    )

settings = Settings()
```

## Pydantic Schemas

```python
# app/schemas/user.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from typing import Optional
import re

class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = None
    is_active: bool = True

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain digit')
        return v

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

class UserInDB(UserBase):
    id: int
    hashed_password: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class User(UserBase):
    """User response model (no password)."""
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class UserList(BaseModel):
    items: list[User]
    total: int
    page: int
    size: int
```

## SQLAlchemy Models

```python
# app/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

## CRUD Operations

```python
# app/crud/base.py
from typing import Generic, TypeVar, Type, Optional, List, Any, Dict
from pydantic import BaseModel
from sqlalchemy.orm import Session
from fastapi.encoders import jsonable_encoder

from app.db.base import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    def get(self, db: Session, id: Any) -> Optional[ModelType]:
        return db.query(self.model).filter(self.model.id == id).first()

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100
    ) -> List[ModelType]:
        return db.query(self.model).offset(skip).limit(limit).all()

    def create(self, db: Session, *, obj_in: CreateSchemaType) -> ModelType:
        obj_in_data = jsonable_encoder(obj_in)
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: ModelType,
        obj_in: UpdateSchemaType | Dict[str, Any]
    ) -> ModelType:
        # Get current object fields to iterate over valid model attributes
        obj_data = jsonable_encoder(db_obj)

        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        # Update only fields present in both the model and update data
        for field in obj_data:
            if field in update_data:
                setattr(db_obj, field, update_data[field])

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete(self, db: Session, *, id: int) -> ModelType:
        obj = db.query(self.model).get(id)
        db.delete(obj)
        db.commit()
        return obj

# app/crud/user.py
from typing import Optional
from sqlalchemy.orm import Session
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password

class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_username(self, db: Session, *, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        db_obj = User(
            email=obj_in.email,
            username=obj_in.username,
            full_name=obj_in.full_name,
            hashed_password=get_password_hash(obj_in.password),
            is_active=obj_in.is_active,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def authenticate(
        self, db: Session, *, email: str, password: str
    ) -> Optional[User]:
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser

user = CRUDUser(User)
```

## Security & Authentication

```python
# app/core/security.py
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# app/dependencies.py
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.crud.user import user as user_crud
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = user_crud.get(db, id=user_id)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not user_crud.is_active(current_user):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

async def get_current_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    if not user_crud.is_superuser(current_user):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )
    return current_user
```

## API Endpoints

```python
# app/api/v1/endpoints/users.py
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import schemas, models
from app.crud import user as user_crud
from app.dependencies import get_db, get_current_active_user, get_current_superuser

router = APIRouter()

@router.get("/", response_model=schemas.UserList)
def read_users(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: models.User = Depends(get_current_superuser),
) -> Any:
    """
    Retrieve users (admin only).
    """
    users = user_crud.get_multi(db, skip=skip, limit=limit)
    total = db.query(models.User).count()

    return {
        "items": users,
        "total": total,
        "page": skip // limit + 1,
        "size": limit
    }

@router.post("/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def create_user(
    *,
    db: Session = Depends(get_db),
    user_in: schemas.UserCreate,
) -> Any:
    """
    Create new user.
    """
    user = user_crud.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists",
        )

    user = user_crud.get_by_username(db, username=user_in.username)
    if user:
        raise HTTPException(
            status_code=400,
            detail="User with this username already exists",
        )

    user = user_crud.create(db, obj_in=user_in)
    return user

@router.get("/me", response_model=schemas.User)
def read_user_me(
    current_user: models.User = Depends(get_current_active_user),
) -> Any:
    """
    Get current user.
    """
    return current_user

@router.put("/me", response_model=schemas.User)
def update_user_me(
    *,
    db: Session = Depends(get_db),
    user_in: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
) -> Any:
    """
    Update current user.
    """
    user = user_crud.update(db, db_obj=current_user, obj_in=user_in)
    return user

@router.get("/{user_id}", response_model=schemas.User)
def read_user_by_id(
    user_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Get user by ID.
    """
    user = user_crud.get(db, id=user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Users can only see themselves unless they're superuser
    if user != current_user and not user_crud.is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    return user
```

## Background Tasks

```python
from fastapi import BackgroundTasks

def send_email(email: str, message: str):
    # Simulate sending email
    print(f"Sending email to {email}: {message}")

@router.post("/send-notification/")
async def send_notification(
    email: str,
    background_tasks: BackgroundTasks
):
    background_tasks.add_task(send_email, email, "Registration successful")
    return {"message": "Notification will be sent"}
```

## Dependency Injection Patterns

```python
# Reusable dependency for pagination
class Pagination:
    def __init__(
        self,
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100)
    ):
        self.skip = skip
        self.limit = limit

# Common query parameters
class CommonQueryParams:
    def __init__(
        self,
        q: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ):
        self.q = q
        self.skip = skip
        self.limit = limit

@router.get("/items/")
async def read_items(commons: CommonQueryParams = Depends()):
    return commons
```

## Exception Handling

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class CustomException(Exception):
    def __init__(self, name: str):
        self.name = name

@app.exception_handler(CustomException)
async def custom_exception_handler(request: Request, exc: CustomException):
    return JSONResponse(
        status_code=418,
        content={"message": f"Oops! {exc.name} did something wrong."}
    )
```

## Testing

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.dependencies import get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)

# tests/test_users.py
def test_create_user(client):
    response = client.post(
        "/api/v1/users/",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "TestPass123"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

def test_read_user(client):
    # Create user first
    create_response = client.post(
        "/api/v1/users/",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "TestPass123"
        }
    )
    user_id = create_response.json()["id"]

    # Read user
    response = client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
```

This guide provides a solid foundation for building production-ready FastAPI applications with proper structure, security, and testing.
