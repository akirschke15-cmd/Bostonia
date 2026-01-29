# Bostonia API Versioning Policy

This document outlines the API versioning strategy, deprecation policy, and breaking change guidelines for the Bostonia platform.

## Table of Contents

1. [Versioning Strategy](#versioning-strategy)
2. [Version Format](#version-format)
3. [Deprecation Policy](#deprecation-policy)
4. [Breaking Changes](#breaking-changes)
5. [Migration Guidelines](#migration-guidelines)
6. [Version Lifecycle](#version-lifecycle)

## Versioning Strategy

Bostonia uses **URL path versioning** for all API endpoints. The version is specified as a prefix in the URL path.

### URL Format

```
https://api.bostonia.ai/{service}/v{major}/{endpoint}
```

### Examples

```
# v1 endpoints (current)
https://api.bostonia.ai/auth/v1/login
https://api.bostonia.ai/characters/v1/characters
https://api.bostonia.ai/chat/v1/conversations

# v2 endpoints (future)
https://api.bostonia.ai/auth/v2/login
https://api.bostonia.ai/characters/v2/characters
```

### Development URLs

In development, the port identifies the service and version is included in the path:

```
http://localhost:3001/api/auth/v1/login
http://localhost:3003/api/characters/v1/characters
http://localhost:3004/api/conversations/v1/conversations
```

### Current Version

| Service | Current Version | Status |
|---------|-----------------|--------|
| Auth Service | v1 | Stable |
| User Service | v1 | Stable |
| Character Service | v1 | Stable |
| Chat Service | v1 | Stable |
| Payment Service | v1 | Stable |

## Version Format

We follow [Semantic Versioning](https://semver.org/) principles:

### Major Version (v1, v2, v3)

- **URL Path Component:** Included in the API URL
- **Changes:** Breaking changes that require client updates
- **Example:** `v1` -> `v2` when response format changes

### Minor Version (1.1, 1.2)

- **Header:** Returned in `X-API-Version` response header
- **Changes:** New features, backward-compatible additions
- **Example:** New optional query parameters, new response fields

### Patch Version (1.1.1, 1.1.2)

- **Header:** Returned in `X-API-Version` response header
- **Changes:** Bug fixes, performance improvements
- **Example:** Fixed validation, improved error messages

### Version Headers

All API responses include version information:

```
HTTP/1.1 200 OK
X-API-Version: 1.2.3
X-API-Deprecated: false
```

For deprecated endpoints:

```
HTTP/1.1 200 OK
X-API-Version: 1.2.3
X-API-Deprecated: true
X-API-Sunset-Date: 2026-06-01
X-API-Deprecation-Notice: Use /v2/characters instead
```

## Deprecation Policy

### Timeline

When a new major version is released:

| Phase | Duration | Description |
|-------|----------|-------------|
| **Announcement** | Day 0 | New version released, old version marked deprecated |
| **Migration Period** | 6 months | Both versions available, deprecation warnings active |
| **Sunset Warning** | Month 5 | Email notifications, dashboard warnings |
| **Sunset** | Month 6 | Old version disabled, returns 410 Gone |

### Deprecation Notices

1. **Documentation:** Deprecated endpoints are marked in API docs
2. **Response Headers:** `X-API-Deprecated: true` header on all responses
3. **Dashboard:** Warning banner in developer portal
4. **Email:** Monthly deprecation reminders to API consumers
5. **Changelog:** Detailed migration guides published

### Example Deprecation Timeline

```
2026-01-01: v2 released, v1 deprecated
2026-01-01 - 2026-06-30: Migration period
2026-06-01: Final warning emails sent
2026-07-01: v1 sunset, returns 410 Gone
```

## Breaking Changes

### What Constitutes a Breaking Change

Breaking changes require a new major version:

| Change Type | Breaking? | Action Required |
|-------------|-----------|-----------------|
| Removing an endpoint | Yes | New major version |
| Removing a response field | Yes | New major version |
| Renaming a response field | Yes | New major version |
| Changing field type | Yes | New major version |
| Changing authentication method | Yes | New major version |
| Making optional field required | Yes | New major version |
| Changing error response format | Yes | New major version |
| Adding new endpoint | No | Minor version |
| Adding optional request parameter | No | Minor version |
| Adding response field | No | Minor version |
| Fixing a bug | No | Patch version |
| Performance improvement | No | Patch version |

### Non-Breaking Changes

These changes can be released without version bump:

- Adding new optional fields to responses
- Adding new optional query parameters
- Adding new endpoints
- Relaxing validation (making required fields optional)
- Adding new enum values (when client handles unknown values)
- Improving error messages
- Performance optimizations

### Handling Breaking Changes

When we must introduce breaking changes:

1. **New Major Version:** Create `/v2/` endpoints
2. **Documentation:** Provide migration guide
3. **Parallel Support:** Run both versions during migration
4. **Feature Parity:** Ensure v2 has all v1 functionality
5. **Testing Tools:** Provide compatibility checkers

## Migration Guidelines

### Checking Your API Version

```bash
# Check current version via response headers
curl -I https://api.bostonia.ai/auth/v1/health

# Response includes:
# X-API-Version: 1.2.3
# X-API-Deprecated: false
```

### Migration Steps

1. **Review Changelog:** Read the breaking changes list
2. **Update Base URL:** Change `/v1/` to `/v2/` in your code
3. **Update Request Format:** Modify request bodies as needed
4. **Update Response Handling:** Adjust for new response format
5. **Test Thoroughly:** Use staging environment
6. **Deploy Gradually:** Use feature flags if possible

### Migration Example: v1 to v2

**v1 Request:**
```json
POST /v1/auth/register
{
  "email": "user@example.com",
  "password": "secret123",
  "name": "John Doe"
}
```

**v2 Request:**
```json
POST /v2/auth/register
{
  "email": "user@example.com",
  "password": "secret123",
  "profile": {
    "displayName": "John Doe",
    "username": "johndoe"
  }
}
```

### Compatibility Layers

For easier migration, we may provide compatibility options:

```bash
# Use compatibility mode header
curl -X POST https://api.bostonia.ai/auth/v2/register \
  -H "X-API-Compat: v1" \
  -d '{"name": "John Doe", ...}'
```

## Version Lifecycle

### Version States

```
┌──────────┐    ┌────────┐    ┌────────────┐    ┌────────┐
│  Alpha   │ -> │  Beta  │ -> │   Stable   │ -> │ Sunset │
└──────────┘    └────────┘    └────────────┘    └────────┘
```

| State | Description | Support Level |
|-------|-------------|---------------|
| **Alpha** | Early preview, may change significantly | No support |
| **Beta** | Feature complete, may have bugs | Limited support |
| **Stable** | Production ready | Full support |
| **Deprecated** | Superseded, still functional | Security fixes only |
| **Sunset** | Disabled, returns 410 | No support |

### Version Support Matrix

| Version | Release Date | Status | Support Until |
|---------|--------------|--------|---------------|
| v1 | 2025-06-01 | Stable | Current |
| v2 | TBD | Planned | - |

### Long-Term Support (LTS)

Major versions receive:
- **Active Support:** 12 months of new features and bug fixes
- **Security Support:** Additional 6 months of security fixes only
- **Total Lifespan:** Minimum 18 months from release

## API Changelog

### v1.2.0 (2026-01-15)
- Added: `tags` filter to character search
- Added: `minRating` filter to character search
- Added: Conversation export in txt format
- Fixed: Pagination off-by-one error

### v1.1.0 (2025-11-01)
- Added: Character favorites endpoint
- Added: Creator payout endpoints
- Added: WebSocket streaming for chat
- Improved: Token refresh mechanism

### v1.0.0 (2025-06-01)
- Initial stable release
- Authentication: Email/password, Google OAuth
- Characters: CRUD, search, ratings
- Chat: Conversations, messages, WebSocket
- Payments: Subscriptions, credits

## Contact

For questions about versioning or migration:

- **Developer Support:** api-support@bostonia.ai
- **Security Issues:** security@bostonia.ai
- **Feature Requests:** GitHub Issues

---

*Last updated: January 2026*
