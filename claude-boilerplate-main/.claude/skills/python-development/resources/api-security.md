# API Security Patterns

## Overview
API security is critical for protecting user data and preventing attacks. This guide covers authentication, authorization, input validation, common vulnerabilities, and security best practices for building secure Python APIs.

## Authentication

### JWT (JSON Web Tokens)
```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuration
SECRET_KEY = "your-secret-key-min-32-chars-long-use-env-var"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class TokenData(BaseModel):
    user_id: int
    username: str
    exp: datetime

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Verify token type
        if payload.get("type") != token_type:
            return None

        # Check expiration
        exp = payload.get("exp")
        if exp is None or datetime.fromtimestamp(exp) < datetime.utcnow():
            return None

        return payload
    except JWTError:
        return None

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return pwd_context.verify(plain_password, hashed_password)
```

### FastAPI JWT Authentication
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user."""
    token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Verify token
    payload = verify_token(token, token_type="access")
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user

# Login endpoint
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """Authenticate user and return tokens."""
    # Find user
    user = db.query(User).filter(User.username == login_data.username).first()

    # Verify credentials
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create tokens
    token_data = {"sub": user.id, "username": user.username}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token."""
    refresh_token = credentials.credentials

    # Verify refresh token
    payload = verify_token(refresh_token, token_type="refresh")
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )

    # Create new tokens
    token_data = {"sub": user.id, "username": user.username}
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token
    }
```

### OAuth2 with FastAPI
```python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 compatible token login."""
    user = authenticate_user(db, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username})

    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Get current user information."""
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    username = payload.get("sub")
    user = db.query(User).filter(User.username == username).first()

    return user
```

### API Keys
```python
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader
from typing import Optional

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)

class APIKey:
    """API Key model."""
    def __init__(self, key: str, name: str, is_active: bool = True):
        self.key = key
        self.name = name
        self.is_active = is_active

# In production, store in database
VALID_API_KEYS = {
    "sk_test_abc123": APIKey("sk_test_abc123", "Test Key"),
    "sk_live_xyz789": APIKey("sk_live_xyz789", "Production Key"),
}

async def verify_api_key(
    api_key: Optional[str] = Security(API_KEY_HEADER)
) -> APIKey:
    """Verify API key from header."""
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key"
        )

    key_data = VALID_API_KEYS.get(api_key)

    if key_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )

    if not key_data.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API Key is disabled"
        )

    return key_data

# Protected endpoint
@app.get("/api/data")
async def get_data(api_key: APIKey = Depends(verify_api_key)):
    """Endpoint protected by API key."""
    return {"message": f"Hello {api_key.name}"}
```

## Authorization and Permissions

### Role-Based Access Control (RBAC)
```python
from enum import Enum
from typing import List
from fastapi import Depends, HTTPException, status

class UserRole(str, Enum):
    ADMIN = "admin"
    MODERATOR = "moderator"
    USER = "user"
    GUEST = "guest"

class Permission(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"

# Role permissions mapping
ROLE_PERMISSIONS = {
    UserRole.ADMIN: [Permission.READ, Permission.WRITE, Permission.DELETE, Permission.ADMIN],
    UserRole.MODERATOR: [Permission.READ, Permission.WRITE, Permission.DELETE],
    UserRole.USER: [Permission.READ, Permission.WRITE],
    UserRole.GUEST: [Permission.READ],
}

def has_permission(user: User, permission: Permission) -> bool:
    """Check if user has permission."""
    user_permissions = ROLE_PERMISSIONS.get(user.role, [])
    return permission in user_permissions

def require_permissions(required_permissions: List[Permission]):
    """Dependency to require specific permissions."""
    def permission_checker(current_user: User = Depends(get_current_user)):
        for permission in required_permissions:
            if not has_permission(current_user, permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permission: {permission}"
                )
        return current_user

    return permission_checker

# Usage
@app.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(require_permissions([Permission.DELETE])),
    db: Session = Depends(get_db)
):
    """Delete post (requires DELETE permission)."""
    post = db.query(Post).filter(Post.id == post_id).first()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    db.delete(post)
    db.commit()

    return {"message": "Post deleted"}
```

### Resource-Based Authorization
```python
from fastapi import Depends, HTTPException, status

async def verify_post_owner(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Post:
    """Verify user owns the post."""
    post = db.query(Post).filter(Post.id == post_id).first()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check ownership
    if post.author_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this resource"
        )

    return post

@app.put("/posts/{post_id}")
async def update_post(
    post_id: int,
    post_update: PostUpdate,
    post: Post = Depends(verify_post_owner)
):
    """Update post (only owner or admin)."""
    post.title = post_update.title
    post.content = post_update.content
    db.commit()

    return post
```

## Rate Limiting

### Simple Rate Limiter
```python
from fastapi import Request, HTTPException, status
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Tuple
import asyncio

class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, requests: int, window: int):
        """
        Args:
            requests: Number of allowed requests
            window: Time window in seconds
        """
        self.requests = requests
        self.window = window
        self.clients: Dict[str, List[datetime]] = defaultdict(list)
        self.lock = asyncio.Lock()

    async def is_allowed(self, client_id: str) -> Tuple[bool, Dict[str, int]]:
        """Check if client is allowed to make request."""
        async with self.lock:
            now = datetime.utcnow()
            window_start = now - timedelta(seconds=self.window)

            # Remove old requests
            self.clients[client_id] = [
                req_time for req_time in self.clients[client_id]
                if req_time > window_start
            ]

            # Check rate limit
            if len(self.clients[client_id]) >= self.requests:
                oldest_request = self.clients[client_id][0]
                retry_after = int((oldest_request + timedelta(seconds=self.window) - now).total_seconds())

                return False, {
                    "X-RateLimit-Limit": self.requests,
                    "X-RateLimit-Remaining": 0,
                    "X-RateLimit-Reset": int((oldest_request + timedelta(seconds=self.window)).timestamp()),
                    "Retry-After": retry_after
                }

            # Add current request
            self.clients[client_id].append(now)

            return True, {
                "X-RateLimit-Limit": self.requests,
                "X-RateLimit-Remaining": self.requests - len(self.clients[client_id]),
                "X-RateLimit-Reset": int((now + timedelta(seconds=self.window)).timestamp())
            }

# Global rate limiters
rate_limiter_strict = RateLimiter(requests=10, window=60)  # 10 requests per minute
rate_limiter_normal = RateLimiter(requests=100, window=60)  # 100 requests per minute

async def rate_limit(
    request: Request,
    limiter: RateLimiter = rate_limiter_normal
):
    """Rate limiting dependency."""
    # Use IP address as client identifier
    client_id = request.client.host

    allowed, headers = await limiter.is_allowed(client_id)

    # Add rate limit headers to response
    for header, value in headers.items():
        request.state.rate_limit_headers = headers

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers=headers
        )

# Usage
@app.get("/api/data", dependencies=[Depends(rate_limit)])
async def get_data():
    """Rate limited endpoint."""
    return {"data": "value"}

@app.get("/api/sensitive", dependencies=[Depends(lambda r: rate_limit(r, rate_limiter_strict))])
async def sensitive_operation():
    """Endpoint with stricter rate limit."""
    return {"message": "Sensitive operation"}
```

### Redis-Based Rate Limiter
```python
from redis import Redis
from fastapi import Request, HTTPException, status

class RedisRateLimiter:
    """Redis-based rate limiter for distributed systems."""

    def __init__(self, redis_client: Redis, requests: int, window: int):
        self.redis = redis_client
        self.requests = requests
        self.window = window

    async def is_allowed(self, client_id: str) -> bool:
        """Check if request is allowed using Redis."""
        key = f"rate_limit:{client_id}"

        # Increment counter
        current = self.redis.incr(key)

        # Set expiry on first request
        if current == 1:
            self.redis.expire(key, self.window)

        # Check limit
        return current <= self.requests

# Initialize Redis connection
redis_client = Redis(host='localhost', port=6379, db=0)
redis_limiter = RedisRateLimiter(redis_client, requests=100, window=60)

async def redis_rate_limit(request: Request):
    """Rate limiting with Redis."""
    client_id = request.client.host

    if not await redis_limiter.is_allowed(client_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
```

## CORS Configuration

### FastAPI CORS Setup
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Development CORS (permissive)
if settings.ENVIRONMENT == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Production CORS (restrictive)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://example.com",
            "https://www.example.com",
            "https://app.example.com"
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )
```

### Django CORS
```python
# settings.py
INSTALLED_APPS = [
    # ...
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    # ...
]

# Development
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    # Production
    CORS_ALLOWED_ORIGINS = [
        "https://example.com",
        "https://www.example.com",
    ]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]
```

## Input Validation

### Pydantic Validation
```python
from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional
import re

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    age: Optional[int] = Field(None, ge=0, le=150)

    @validator('username')
    def validate_username(cls, v):
        """Validate username format."""
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must contain only letters, numbers, and underscores')
        return v

    @validator('password')
    def validate_password(cls, v):
        """Validate password strength."""
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

    @validator('age')
    def validate_age(cls, v):
        """Validate age is reasonable."""
        if v is not None and v < 13:
            raise ValueError('Users must be at least 13 years old')
        return v

# Usage in FastAPI
@app.post("/users/")
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    """Create new user with validation."""
    # Validation happens automatically
    # If validation fails, FastAPI returns 422 with detailed error

    hashed_password = hash_password(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        age=user.age
    )
    db.add(db_user)
    db.commit()

    return {"message": "User created successfully"}
```

### Custom Validators
```python
from pydantic import BaseModel, validator
from typing import List

class PostCreate(BaseModel):
    title: str
    content: str
    tags: List[str]

    @validator('title')
    def title_not_empty(cls, v):
        """Ensure title is not empty or whitespace."""
        if not v or not v.strip():
            raise ValueError('Title cannot be empty')
        return v.strip()

    @validator('content')
    def content_length(cls, v):
        """Validate content length."""
        if len(v) < 10:
            raise ValueError('Content must be at least 10 characters')
        if len(v) > 10000:
            raise ValueError('Content too long (max 10000 characters)')
        return v

    @validator('tags')
    def validate_tags(cls, v):
        """Validate tags."""
        if len(v) > 10:
            raise ValueError('Maximum 10 tags allowed')

        # Remove duplicates
        unique_tags = list(set(v))

        # Validate each tag
        for tag in unique_tags:
            if not re.match(r'^[a-zA-Z0-9-]+$', tag):
                raise ValueError(f'Invalid tag format: {tag}')

        return unique_tags
```

## SQL Injection Prevention

### Good: Use ORMs and Parameterized Queries
```python
from sqlalchemy.orm import Session
from sqlalchemy import text

# GOOD: ORM (parameterized automatically)
def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

# GOOD: Parameterized raw SQL
def get_user_by_id(db: Session, user_id: int):
    result = db.execute(
        text("SELECT * FROM users WHERE id = :user_id"),
        {"user_id": user_id}
    )
    return result.first()

# BAD: String concatenation (vulnerable to SQL injection!)
def get_user_bad(db: Session, username: str):
    # NEVER DO THIS
    query = f"SELECT * FROM users WHERE username = '{username}'"
    result = db.execute(text(query))
    return result.first()
```

### Django ORM Protection
```python
from django.db.models import Q

# GOOD: Django ORM (safe by default)
def search_users(search_term: str):
    return User.objects.filter(
        Q(username__icontains=search_term) |
        Q(email__icontains=search_term)
    )

# GOOD: Parameterized raw SQL
from django.db import connection

def get_user_stats(user_id: int):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) FROM posts WHERE author_id = %s",
            [user_id]
        )
        return cursor.fetchone()[0]

# BAD: Never use raw SQL with string formatting
def bad_query(username: str):
    # NEVER DO THIS
    query = f"SELECT * FROM users WHERE username = '{username}'"
    # Vulnerable to: admin' OR '1'='1
```

## XSS Prevention

### Escape Output
```python
from html import escape
from markupsafe import Markup

def sanitize_html(content: str) -> str:
    """Escape HTML to prevent XSS."""
    return escape(content)

# In templates (Jinja2 auto-escapes by default)
@app.get("/post/{post_id}")
async def get_post(post_id: int):
    post = get_post_from_db(post_id)

    # Content will be auto-escaped in Jinja2 template
    return templates.TemplateResponse(
        "post.html",
        {"request": request, "post": post}
    )

# If returning HTML in JSON, sanitize it
from bleach import clean

ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'a']
ALLOWED_ATTRIBUTES = {'a': ['href', 'title']}

def sanitize_user_html(content: str) -> str:
    """Allow safe HTML tags only."""
    return clean(
        content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )

@app.post("/posts/")
async def create_post(post: PostCreate):
    """Create post with sanitized content."""
    sanitized_content = sanitize_user_html(post.content)

    # Save to database
    # ...

    return {"message": "Post created"}
```

### Content Security Policy
```python
from fastapi import Response
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.example.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.example.com; "
            "img-src 'self' data: https:; "
            "font-src 'self' https://cdn.example.com; "
            "connect-src 'self' https://api.example.com; "
            "frame-ancestors 'none';"
        )

        # Other security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response

app.add_middleware(SecurityHeadersMiddleware)
```

## CSRF Protection

### Django CSRF
```python
# Django includes CSRF protection by default
# settings.py
MIDDLEWARE = [
    # ...
    'django.middleware.csrf.CsrfViewMiddleware',
    # ...
]

# In templates
# {% csrf_token %}

# For AJAX requests
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse

@ensure_csrf_cookie
def get_csrf_token(request):
    """Endpoint to get CSRF token for AJAX."""
    return JsonResponse({'success': True})

# JavaScript
# Include X-CSRFToken header in AJAX requests
```

### FastAPI CSRF Protection
```python
from fastapi import Request, HTTPException, status
from fastapi.responses import Response
import secrets
from typing import Optional

class CSRFProtection:
    """CSRF protection middleware."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def generate_token(self) -> str:
        """Generate CSRF token."""
        return secrets.token_urlsafe(32)

    def verify_token(self, request: Request, token: str) -> bool:
        """Verify CSRF token."""
        session_token = request.cookies.get("csrf_token")
        return session_token == token

csrf_protection = CSRFProtection(SECRET_KEY)

async def verify_csrf(request: Request):
    """Verify CSRF token for state-changing operations."""
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        token = request.headers.get("X-CSRF-Token")

        if not token or not csrf_protection.verify_token(request, token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing or invalid"
            )

@app.get("/csrf-token")
async def get_csrf_token(response: Response):
    """Get CSRF token."""
    token = csrf_protection.generate_token()
    response.set_cookie(
        key="csrf_token",
        value=token,
        httponly=True,
        samesite="strict",
        secure=True  # Use in production with HTTPS
    )
    return {"csrf_token": token}

@app.post("/api/data", dependencies=[Depends(verify_csrf)])
async def create_data(data: DataCreate):
    """CSRF protected endpoint."""
    # Process data
    return {"message": "Data created"}
```

## Secrets Management

### Environment Variables
```python
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings from environment."""

    # Database
    DATABASE_URL: str

    # Security
    SECRET_KEY: str
    JWT_SECRET: str

    # API Keys
    STRIPE_API_KEY: Optional[str] = None
    SENDGRID_API_KEY: Optional[str] = None

    # AWS
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Usage
DATABASE_URL = settings.DATABASE_URL
```

### Using HashiCorp Vault
```python
import hvac
from typing import Dict, Any

class VaultClient:
    """HashiCorp Vault client for secrets."""

    def __init__(self, url: str, token: str):
        self.client = hvac.Client(url=url, token=token)

    def get_secret(self, path: str) -> Dict[str, Any]:
        """Retrieve secret from Vault."""
        try:
            response = self.client.secrets.kv.v2.read_secret_version(path=path)
            return response['data']['data']
        except Exception as e:
            print(f"Error retrieving secret: {e}")
            return {}

# Initialize
vault = VaultClient(
    url="https://vault.example.com",
    token=os.getenv("VAULT_TOKEN")
)

# Get secrets
db_secrets = vault.get_secret("database/credentials")
DATABASE_URL = db_secrets.get("url")
```

## Security Headers

### Comprehensive Security Headers
```python
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add comprehensive security headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # XSS Protection (legacy, but still useful)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Force HTTPS
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions Policy (formerly Feature-Policy)
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )

        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

        return response

app.add_middleware(SecurityHeadersMiddleware)
```

## OWASP Top 10 for APIs

### 1. Broken Object Level Authorization
```python
# BAD: No authorization check
@app.get("/api/orders/{order_id}")
async def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    return order  # Any authenticated user can access any order!

# GOOD: Check resource ownership
@app.get("/api/orders/{order_id}")
async def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verify ownership
    if order.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")

    return order
```

### 2. Broken Authentication
```python
# Implement proper authentication (see JWT section above)
# - Use strong password hashing (bcrypt)
# - Implement token expiration
# - Use refresh tokens
# - Implement account lockout after failed attempts

from datetime import datetime, timedelta

class LoginAttemptTracker:
    """Track failed login attempts."""

    def __init__(self):
        self.attempts: Dict[str, List[datetime]] = {}

    def record_attempt(self, identifier: str) -> bool:
        """Record failed attempt. Returns True if locked out."""
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=15)

        # Clean old attempts
        if identifier in self.attempts:
            self.attempts[identifier] = [
                t for t in self.attempts[identifier] if t > window_start
            ]
        else:
            self.attempts[identifier] = []

        self.attempts[identifier].append(now)

        # Lock out after 5 failed attempts in 15 minutes
        return len(self.attempts[identifier]) >= 5

    def reset(self, identifier: str):
        """Reset attempts after successful login."""
        self.attempts.pop(identifier, None)

login_tracker = LoginAttemptTracker()
```

### 3. Excessive Data Exposure
```python
# BAD: Returning sensitive data
@app.get("/api/users/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    return user  # Includes password hash, tokens, etc.!

# GOOD: Use response models to control exposed data
class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True

@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    return user  # Only fields in UserResponse are returned
```

### 4. Lack of Resources & Rate Limiting
```python
# See Rate Limiting section above
# Implement per-endpoint and per-user rate limits
# Use distributed rate limiting (Redis) for production
```

### 5. Broken Function Level Authorization
```python
# BAD: No role check
@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    # Any authenticated user can delete any user!
    pass

# GOOD: Check user role
@app.delete("/api/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only admins can delete users
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Additional check: can't delete yourself
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        db.delete(user)
        db.commit()

    return {"message": "User deleted"}
```

## Best Practices

1. **Always use HTTPS**: Never transmit sensitive data over HTTP
2. **Hash passwords properly**: Use bcrypt, scrypt, or Argon2
3. **Implement JWT correctly**: Use short expiry, refresh tokens, blacklist
4. **Validate all input**: Use Pydantic models with custom validators
5. **Use parameterized queries**: Prevent SQL injection
6. **Implement rate limiting**: Protect against brute force and DoS
7. **Check authorization**: Verify both authentication and resource access
8. **Sanitize output**: Prevent XSS attacks
9. **Set security headers**: Use CSP, HSTS, X-Frame-Options, etc.
10. **Store secrets securely**: Use environment variables or secret managers
11. **Log security events**: Monitor failed logins, access attempts
12. **Keep dependencies updated**: Regularly update packages for security fixes
13. **Implement CSRF protection**: For state-changing operations
14. **Use CORS properly**: Don't allow all origins in production
15. **Principle of least privilege**: Give minimal permissions needed

This guide provides comprehensive security patterns for building secure Python APIs. Always stay updated with the latest security best practices and vulnerabilities.
