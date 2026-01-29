# Django Framework Guide

## Overview
Django is a high-level Python web framework that encourages rapid development and clean, pragmatic design. It follows the "batteries-included" philosophy with built-in features for authentication, admin interface, ORM, and more.

## Project Structure

```text
myproject/
├── manage.py
├── myproject/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── users/
│   │   ├── migrations/
│   │   ├── __init__.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   └── products/
├── templates/
├── static/
├── media/
└── requirements.txt
```

## Modern Django Setup

### pyproject.toml
```toml
[project]
name = "myproject"
version = "1.0.0"
dependencies = [
    "django>=4.2",
    "djangorestframework>=3.14",
    "django-environ>=0.11",
    "psycopg2-binary>=2.9",
    "celery>=5.3",
    "redis>=5.0",
    "gunicorn>=21.2",
]

[project.optional-dependencies]
dev = [
    "django-debug-toolbar>=4.2",
    "pytest-django>=4.5",
    "factory-boy>=3.3",
    "black>=23.10",
    "ruff>=0.1",
]
```

## Models

### Best Practices
```python
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
import uuid

class TimeStampedModel(models.Model):
    """Abstract base class with created/modified timestamps."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class Product(TimeStampedModel):
    """Product model with best practices."""

    # Use UUID for public-facing IDs
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    name = models.CharField(
        _("product name"),
        max_length=200,
        db_index=True
    )

    slug = models.SlugField(
        unique=True,
        max_length=200
    )

    description = models.TextField(
        blank=True,
        default=""
    )

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    stock = models.PositiveIntegerField(
        default=0
    )

    is_active = models.BooleanField(
        default=True,
        db_index=True
    )

    category = models.ForeignKey(
        'Category',
        on_delete=models.PROTECT,
        related_name='products'
    )

    tags = models.ManyToManyField(
        'Tag',
        blank=True,
        related_name='products'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _("product")
        verbose_name_plural = _("products")
        indexes = [
            models.Index(fields=['is_active', '-created_at']),
            models.Index(fields=['category', 'is_active']),
        ]

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        from django.urls import reverse
        return reverse('product-detail', kwargs={'slug': self.slug})

    def save(self, *args, **kwargs):
        # Auto-generate slug if not provided
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    @property
    def is_in_stock(self):
        return self.stock > 0
```

### Manager and QuerySet
```python
from django.db import models
from django.db.models import Q, F

class ProductQuerySet(models.QuerySet):
    """Custom queryset for Product model."""

    def active(self):
        return self.filter(is_active=True)

    def in_stock(self):
        return self.filter(stock__gt=0)

    def by_category(self, category):
        return self.filter(category=category)

    def search(self, query):
        return self.filter(
            Q(name__icontains=query) |
            Q(description__icontains=query)
        )

    def low_stock(self, threshold=10):
        return self.filter(stock__lte=threshold, stock__gt=0)

class ProductManager(models.Manager):
    """Custom manager for Product model."""

    def get_queryset(self):
        return ProductQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def in_stock(self):
        return self.get_queryset().in_stock()

    def featured(self):
        return self.get_queryset().active().filter(is_featured=True)

# In model
class Product(TimeStampedModel):
    # ... fields ...

    objects = ProductManager()
```

## Django REST Framework

### Serializers
```python
from rest_framework import serializers
from .models import Product, Category

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']

class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    category = CategorySerializer(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'price',
            'is_in_stock', 'category', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer for detail views."""
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True
    )

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'description', 'price',
            'stock', 'is_active', 'is_in_stock', 'category',
            'category_id', 'tags', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be positive")
        return value

    def validate(self, attrs):
        # Cross-field validation
        if attrs.get('stock', 0) > 10000:
            raise serializers.ValidationError(
                "Stock quantity seems unrealistic"
            )
        return attrs
```

### ViewSets
```python
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend

class ProductViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Product CRUD operations.

    list: Return list of products (paginated)
    retrieve: Return product detail
    create: Create new product (admin only)
    update: Update product (admin only)
    partial_update: Partially update product (admin only)
    destroy: Delete product (admin only)
    """
    queryset = Product.objects.select_related('category').prefetch_related('tags')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'price', 'name']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductDetailSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Regular users only see active products
        if not self.request.user.is_staff:
            queryset = queryset.active()

        # Filter by price range
        min_price = self.request.query_params.get('min_price')
        max_price = self.request.query_params.get('max_price')

        if min_price:
            queryset = queryset.filter(price__gte=min_price)
        if max_price:
            queryset = queryset.filter(price__lte=max_price)

        return queryset

    @action(detail=False, methods=['get'])
    def featured(self, request):
        """Return featured products."""
        featured = self.get_queryset().filter(is_featured=True)
        serializer = self.get_serializer(featured, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def purchase(self, request, pk=None):
        """Handle product purchase."""
        from django.db.models import F

        # Use select_for_update to prevent race conditions
        product = Product.objects.select_for_update().get(pk=pk)
        quantity = request.data.get('quantity', 1)

        if product.stock < quantity:
            return Response(
                {'error': 'Insufficient stock'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Process purchase logic here - use F() for atomic update
        product.stock = F('stock') - quantity
        product.save()
        product.refresh_from_db()  # Get updated value

        return Response({'status': 'purchase successful'})
```

## Authentication & Permissions

### Custom User Model
```python
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=30)
    last_name = models.CharField(max_length=30)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    def __str__(self):
        return self.email

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}"
```

### Custom Permissions
```python
from rest_framework import permissions

class IsOwnerOrReadOnly(permissions.BasePermission):
    """Allow write access only to object owner."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.owner == request.user

class IsAdminOrReadOnly(permissions.BasePermission):
    """Allow write access only to admin users."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff
```

## Testing

### Model Tests
```python
import pytest
from django.core.exceptions import ValidationError
from apps.products.models import Product, Category

@pytest.mark.django_db
class TestProductModel:
    def test_create_product(self):
        category = Category.objects.create(name="Electronics")
        product = Product.objects.create(
            name="Laptop",
            price=999.99,
            stock=10,
            category=category
        )
        assert product.name == "Laptop"
        assert product.slug == "laptop"
        assert product.is_in_stock is True

    def test_product_slug_auto_generation(self):
        category = Category.objects.create(name="Electronics")
        product = Product.objects.create(
            name="Gaming Mouse",
            price=49.99,
            category=category
        )
        assert product.slug == "gaming-mouse"

    def test_product_out_of_stock(self):
        category = Category.objects.create(name="Electronics")
        product = Product.objects.create(
            name="Keyboard",
            price=79.99,
            stock=0,
            category=category
        )
        assert product.is_in_stock is False

    def test_product_ordering(self):
        category = Category.objects.create(name="Electronics")
        product1 = Product.objects.create(name="P1", price=10, category=category)
        product2 = Product.objects.create(name="P2", price=20, category=category)

        products = list(Product.objects.all())
        assert products[0] == product2  # Most recent first
```

### API Tests
```python
import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user():
    return User.objects.create_user(
        email='test@example.com',
        password='testpass123'
    )

@pytest.fixture
def admin_user():
    return User.objects.create_superuser(
        email='admin@example.com',
        password='adminpass123'
    )

@pytest.mark.django_db
class TestProductAPI:
    def test_list_products(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.get('/api/products/')
        assert response.status_code == 200

    def test_create_product_as_admin(self, api_client, admin_user):
        api_client.force_authenticate(user=admin_user)
        data = {
            'name': 'New Product',
            'price': 99.99,
            'stock': 50,
            'category_id': 1
        }
        response = api_client.post('/api/products/', data)
        assert response.status_code == 201

    def test_create_product_as_regular_user_fails(self, api_client, user):
        api_client.force_authenticate(user=user)
        data = {'name': 'Product', 'price': 99.99}
        response = api_client.post('/api/products/', data)
        assert response.status_code == 403
```

## Performance Optimization

### Database Query Optimization
```python
# Select related for foreign keys
products = Product.objects.select_related('category')

# Prefetch related for many-to-many
products = Product.objects.prefetch_related('tags')

# Only select needed fields
products = Product.objects.only('id', 'name', 'price')

# Defer heavy fields
products = Product.objects.defer('description')

# Bulk operations
Product.objects.bulk_create([
    Product(name='P1', price=10),
    Product(name='P2', price=20),
])

# Update in bulk
Product.objects.filter(category=old_cat).update(category=new_cat)
```

### Caching
```python
from django.core.cache import cache
from django.views.decorators.cache import cache_page

@cache_page(60 * 15)  # Cache for 15 minutes
def product_list(request):
    products = Product.objects.all()
    return render(request, 'products/list.html', {'products': products})

# Manual caching
def get_product(product_id):
    cache_key = f'product_{product_id}'
    product = cache.get(cache_key)

    if product is None:
        product = Product.objects.get(id=product_id)
        cache.set(cache_key, product, 60 * 15)

    return product
```

## Celery Tasks
```python
from celery import shared_task
from django.core.mail import send_mail

@shared_task
def send_welcome_email(user_id):
    from django.contrib.auth import get_user_model
    User = get_user_model()

    user = User.objects.get(id=user_id)
    send_mail(
        'Welcome!',
        f'Welcome to our site, {user.first_name}!',
        'noreply@example.com',
        [user.email],
    )

@shared_task
def update_product_prices():
    # Long-running task
    products = Product.objects.all()
    for product in products:
        # Update prices based on logic
        product.save()
```

## Settings Best Practices

```python
# settings/base.py
import environ

env = environ.Env()

SECRET_KEY = env('SECRET_KEY')
DEBUG = env.bool('DEBUG', default=False)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'django_filters',
    'corsheaders',

    # Local apps
    'apps.users',
    'apps.products',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT', default='5432'),
    }
}
```

## Common Patterns

### Signals
```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)
```

### Middleware
```python
class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Before view
        print(f"Request: {request.method} {request.path}")

        response = self.get_response(request)

        # After view
        print(f"Response: {response.status_code}")

        return response
```

This guide covers the most important Django patterns and best practices for building production-ready applications.
