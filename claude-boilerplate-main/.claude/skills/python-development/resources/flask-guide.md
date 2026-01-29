# Flask Development Guide

Comprehensive patterns for building Flask applications with best practices.

## Project Structure

```text
flask-project/
├── app/
│   ├── __init__.py          # Application factory
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── api.py
│   │   └── auth.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── user_service.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── user_schema.py
│   ├── extensions.py        # Flask extensions
│   └── config.py            # Configuration
├── migrations/              # Alembic migrations
├── tests/
│   ├── conftest.py
│   ├── test_api.py
│   └── test_auth.py
├── pyproject.toml
└── wsgi.py
```

## Application Factory Pattern

```python
# app/__init__.py
from flask import Flask
from app.extensions import db, migrate, jwt, cors, limiter
from app.config import Config

def create_app(config_class=Config):
    """Application factory pattern."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app)
    limiter.init_app(app)

    # Register blueprints
    from app.routes import api_bp, auth_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # Error handlers
    register_error_handlers(app)

    return app

def register_error_handlers(app):
    """Register custom error handlers."""
    from werkzeug.exceptions import HTTPException
    from flask import jsonify

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        return jsonify({
            'error': e.name,
            'message': e.description,
            'code': e.code
        }), e.code

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.error(f'Unhandled exception: {e}', exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred'
        }), 500
```

## Configuration

```python
# app/config.py
import os
from datetime import timedelta

class Config:
    """Base configuration."""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # Rate limiting
    RATELIMIT_STORAGE_URL = os.getenv('REDIS_URL', 'memory://')

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    SQLALCHEMY_ECHO = True

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    SQLALCHEMY_POOL_SIZE = 10
    SQLALCHEMY_MAX_OVERFLOW = 20

class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
```

## Extensions

```python
# app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)
```

## Models with SQLAlchemy

```python
# app/models/user.py
from app.extensions import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)

class User(db.Model, TimestampMixin):
    """User model."""
    __tablename__ = 'users'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    is_admin = db.Column(db.Boolean, default=False)

    # Relationships
    posts = db.relationship('Post', backref='author', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        """Hash and set password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check password against hash."""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<User {self.username}>'


class Post(db.Model, TimestampMixin):
    """Post model."""
    __tablename__ = 'posts'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'author': self.author.username,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
```

## Blueprints and Routes

```python
# app/routes/api.py
from flask import Blueprint, jsonify, request
from app.extensions import db, limiter
from app.models.user import Post
from flask_jwt_extended import jwt_required, get_jwt_identity

api_bp = Blueprint('api', __name__)

@api_bp.route('/posts', methods=['GET'])
@limiter.limit("100 per minute")
def get_posts():
    """Get all posts with pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    posts = Post.query.order_by(Post.created_at.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    return jsonify({
        'posts': [post.to_dict() for post in posts.items],
        'total': posts.total,
        'pages': posts.pages,
        'current_page': page
    })

@api_bp.route('/posts', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute")
def create_post():
    """Create a new post."""
    current_user_id = get_jwt_identity()
    data = request.get_json()

    # Validation
    if not data or not data.get('title') or not data.get('content'):
        return jsonify({'error': 'Title and content required'}), 400

    post = Post(
        title=data['title'],
        content=data['content'],
        user_id=current_user_id
    )

    db.session.add(post)
    db.session.commit()

    return jsonify(post.to_dict()), 201

@api_bp.route('/posts/<post_id>', methods=['GET'])
def get_post(post_id):
    """Get a single post."""
    post = Post.query.get_or_404(post_id)
    return jsonify(post.to_dict())

@api_bp.route('/posts/<post_id>', methods=['PUT'])
@jwt_required()
def update_post(post_id):
    """Update a post."""
    current_user_id = get_jwt_identity()
    post = Post.query.get_or_404(post_id)

    # Authorization check
    if post.user_id != current_user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    if 'title' in data:
        post.title = data['title']
    if 'content' in data:
        post.content = data['content']

    db.session.commit()
    return jsonify(post.to_dict())

@api_bp.route('/posts/<post_id>', methods=['DELETE'])
@jwt_required()
def delete_post(post_id):
    """Delete a post."""
    current_user_id = get_jwt_identity()
    post = Post.query.get_or_404(post_id)

    if post.user_id != current_user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    db.session.delete(post)
    db.session.commit()
    return '', 204
```

## Authentication with JWT

```python
# app/routes/auth.py
from flask import Blueprint, jsonify, request
from app.extensions import db
from app.models.user import User
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity
)

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()

    # Validation
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password required'}), 400

    # Check if user exists
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409

    # Create user
    user = User(
        email=data['email'],
        username=data.get('username', data['email'].split('@')[0])
    )
    user.set_password(data['password'])

    db.session.add(user)
    db.session.commit()

    return jsonify(user.to_dict()), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login and get tokens."""
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password required'}), 400

    user = User.query.filter_by(email=data['email']).first()

    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401

    if not user.is_active:
        return jsonify({'error': 'Account disabled'}), 403

    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': user.to_dict()
    })

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token."""
    current_user_id = get_jwt_identity()
    access_token = create_access_token(identity=current_user_id)
    return jsonify({'access_token': access_token})

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info."""
    current_user_id = get_jwt_identity()
    user = User.query.get_or_404(current_user_id)
    return jsonify(user.to_dict())
```

## Testing

```python
# tests/conftest.py
import pytest
from app import create_app
from app.extensions import db
from app.config import TestingConfig

@pytest.fixture
def app():
    """Create application for testing."""
    app = create_app(TestingConfig)

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()

@pytest.fixture
def runner(app):
    """Create test CLI runner."""
    return app.test_cli_runner()

# tests/test_api.py
def test_get_posts(client):
    """Test get posts endpoint."""
    response = client.get('/api/posts')
    assert response.status_code == 200
    data = response.get_json()
    assert 'posts' in data
    assert 'total' in data

def test_create_post_unauthorized(client):
    """Test creating post without auth."""
    response = client.post('/api/posts', json={
        'title': 'Test',
        'content': 'Content'
    })
    assert response.status_code == 401

# tests/test_auth.py
def test_register(client):
    """Test user registration."""
    response = client.post('/auth/register', json={
        'email': 'test@example.com',
        'password': 'password123',
        'username': 'testuser'
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data['email'] == 'test@example.com'
    assert 'password' not in data

def test_login(client, app):
    """Test user login."""
    # Create user
    with app.app_context():
        from app.models.user import User
        user = User(email='test@example.com', username='testuser')
        user.set_password('password123')
        db.session.add(user)
        db.session.commit()

    # Login
    response = client.post('/auth/login', json={
        'email': 'test@example.com',
        'password': 'password123'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'access_token' in data
    assert 'refresh_token' in data
```

## Best Practices

### 1. Use Application Factory
- Enables multiple app instances (testing, production)
- Separates configuration from code
- Allows extension initialization

### 2. Blueprint Organization
- Group related routes into blueprints
- Use URL prefixes for API versioning
- Keep blueprints focused and cohesive

### 3. Database Best Practices
- Use migrations (Flask-Migrate/Alembic)
- Add indexes to frequently queried columns
- Use relationship lazy loading strategically
- Implement soft deletes for important data

### 4. Security
- Always hash passwords (never store plaintext)
- Use JWT with short expiration times
- Implement rate limiting
- Validate all user input
- Use CORS properly
- Enable CSRF protection for web forms

### 5. Error Handling
- Use custom error handlers
- Return consistent JSON error responses
- Log errors with context
- Don't expose sensitive information in errors

### 6. Performance
- Use database connection pooling
- Implement caching (Flask-Caching)
- Paginate large result sets
- Use background tasks for heavy operations (Celery)

## Common Patterns

### Request Validation with Marshmallow

```python
from marshmallow import Schema, fields, ValidationError, validates

class UserSchema(Schema):
    email = fields.Email(required=True)
    username = fields.Str(required=True, validate=lambda x: len(x) >= 3)
    password = fields.Str(required=True, load_only=True, validate=lambda x: len(x) >= 8)

    @validates('username')
    def validate_username(self, value):
        if User.query.filter_by(username=value).first():
            raise ValidationError('Username already taken')

user_schema = UserSchema()

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = user_schema.load(request.get_json())
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    # Create user...
```

### Background Tasks with Celery

```python
from celery import Celery

celery = Celery(__name__)
celery.config_from_object('app.celeryconfig')

@celery.task
def send_email(to, subject, body):
    """Send email asynchronously."""
    # Email sending logic
    pass

# Usage
send_email.delay('user@example.com', 'Welcome', 'Welcome to our app!')
```

## Deployment

### WSGI Server (Gunicorn)

```python
# wsgi.py
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run()
```

```bash
# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 wsgi:app
```

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install poetry && poetry install --no-dev

COPY . .

EXPOSE 8000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "wsgi:app"]
```
