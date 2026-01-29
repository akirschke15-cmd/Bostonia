# Bostonia API - Developer Getting Started Guide

Welcome to the Bostonia API! This guide will help you get started integrating with the Bostonia AI Character Chat Platform.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Quick Start](#quick-start)
4. [Rate Limiting](#rate-limiting)
5. [Error Handling](#error-handling)
6. [WebSocket Connection](#websocket-connection)
7. [Common Use Cases](#common-use-cases)

## Overview

The Bostonia platform provides a suite of microservices for building AI character chat applications:

| Service | Port | Description |
|---------|------|-------------|
| Auth Service | 3001 | Authentication, OAuth, JWT token management |
| User Service | 3002 | User profiles, preferences, favorites |
| Character Service | 3003 | Character CRUD, search, ratings |
| Chat Service | 3004 | Conversations, messages, real-time chat |
| Payment Service | 3005 | Subscriptions, credits, billing |

**Base URLs:**
- Development: `http://localhost:{port}`
- Production: `https://api.bostonia.ai/{service}`

## Authentication

Bostonia uses JWT (JSON Web Tokens) for API authentication. There are two token types:

### Access Token
- **Lifespan:** 15 minutes
- **Usage:** Include in `Authorization` header for API requests
- **Format:** `Authorization: Bearer <access_token>`

### Refresh Token
- **Lifespan:** 7 days
- **Usage:** Exchange for new access token when expired

### JWT Token Payload

```json
{
  "userId": "usr_abc123",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1706529600,
  "exp": 1706530500
}
```

### Authentication Flow

```
1. Login/Register --> Receive access_token + refresh_token
2. API Request    --> Include access_token in Authorization header
3. Token Expired  --> Use refresh_token to get new tokens
4. Logout         --> Revoke refresh_token
```

## Quick Start

### curl Examples

#### Register a New User

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "myusername",
    "displayName": "My Display Name",
    "password": "SecurePassword123!"
  }'
```

#### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

#### Get Current User

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

#### List Characters

```bash
curl "http://localhost:3003/api/characters?page=1&limit=20&category=Companion"
```

#### Create Conversation

```bash
curl -X POST http://localhost:3004/api/conversations \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "characterId": "char_abc123",
    "mode": "chat"
  }'
```

#### Send Message (REST)

```bash
curl -X POST http://localhost:3004/api/conversations/conv_abc123/messages \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello! How are you today?"
  }'
```

### JavaScript/TypeScript Examples

#### Authentication Module

```typescript
const API_BASE = 'http://localhost:3001';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

class BostoniaAuth {
  private tokens: AuthTokens | null = null;

  async login(email: string, password: string): Promise<User> {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error.message);
    }

    this.tokens = {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    };

    return data.data.user;
  }

  async refreshTokens(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error.message);
    }

    this.tokens = {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    };
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  async logout(): Promise<void> {
    if (!this.tokens) return;

    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
    });

    this.tokens = null;
  }
}

// Usage
const auth = new BostoniaAuth();
await auth.login('user@example.com', 'password');
```

#### Chat with Character

```typescript
import { io, Socket } from 'socket.io-client';

class BostoniaChat {
  private socket: Socket;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.socket = io('http://localhost:3004', {
      withCredentials: true,
    });
  }

  joinConversation(conversationId: string): void {
    this.socket.emit('join:conversation', conversationId);
  }

  sendMessage(conversationId: string, content: string, userId: string): void {
    this.socket.emit('chat:message', {
      conversationId,
      content,
      userId,
    });
  }

  onStreamChunk(callback: (chunk: { content: string }) => void): void {
    this.socket.on('chat:stream_chunk', callback);
  }

  onStreamEnd(callback: (data: { message: any }) => void): void {
    this.socket.on('chat:stream_end', callback);
  }

  onTyping(callback: (data: { isTyping: boolean }) => void): void {
    this.socket.on('chat:typing', callback);
  }

  onError(callback: (error: { message: string }) => void): void {
    this.socket.on('chat:error', callback);
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

// Usage
const chat = new BostoniaChat(accessToken);

chat.joinConversation('conv_abc123');

// Handle streaming response
let fullResponse = '';
chat.onStreamChunk(({ content }) => {
  fullResponse += content;
  console.log('Partial:', fullResponse);
});

chat.onStreamEnd(({ message }) => {
  console.log('Complete message:', message);
});

// Send a message
chat.sendMessage('conv_abc123', 'Hello!', 'usr_123');
```

### Python Examples

#### Authentication

```python
import requests
from dataclasses import dataclass
from typing import Optional

API_BASE = 'http://localhost:3001'

@dataclass
class AuthTokens:
    access_token: str
    refresh_token: str

class BostoniaAuth:
    def __init__(self):
        self.tokens: Optional[AuthTokens] = None

    def login(self, email: str, password: str) -> dict:
        response = requests.post(
            f'{API_BASE}/api/auth/login',
            json={'email': email, 'password': password}
        )
        data = response.json()

        if not data['success']:
            raise Exception(data['error']['message'])

        self.tokens = AuthTokens(
            access_token=data['data']['accessToken'],
            refresh_token=data['data']['refreshToken']
        )

        return data['data']['user']

    def get_headers(self) -> dict:
        if not self.tokens:
            raise Exception('Not authenticated')
        return {'Authorization': f'Bearer {self.tokens.access_token}'}

    def refresh(self) -> None:
        if not self.tokens:
            raise Exception('No refresh token')

        response = requests.post(
            f'{API_BASE}/api/auth/refresh',
            json={'refreshToken': self.tokens.refresh_token}
        )
        data = response.json()

        if not data['success']:
            raise Exception(data['error']['message'])

        self.tokens = AuthTokens(
            access_token=data['data']['accessToken'],
            refresh_token=data['data']['refreshToken']
        )

# Usage
auth = BostoniaAuth()
user = auth.login('user@example.com', 'password')
print(f'Logged in as {user["displayName"]}')

# Make authenticated request
response = requests.get(
    'http://localhost:3003/api/characters',
    headers=auth.get_headers()
)
characters = response.json()
```

#### Working with Characters

```python
import requests

CHARACTER_API = 'http://localhost:3003'

def search_characters(query: str = None, category: str = None, page: int = 1):
    params = {'page': page, 'limit': 20}
    if query:
        params['query'] = query
    if category:
        params['category'] = category

    response = requests.get(f'{CHARACTER_API}/api/characters', params=params)
    return response.json()

def get_character(character_id: str):
    response = requests.get(f'{CHARACTER_API}/api/characters/{character_id}')
    return response.json()

# Search for companion characters
results = search_characters(category='Companion')
for char in results['data']:
    print(f"{char['name']}: {char['tagline']}")
```

## Rate Limiting

API requests are subject to rate limiting to ensure fair usage:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Authentication | 10 requests | 1 minute |
| Read operations | 100 requests | 1 minute |
| Write operations | 30 requests | 1 minute |
| WebSocket messages | 60 messages | 1 minute |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706530500
```

### Handling Rate Limits

```typescript
async function fetchWithRetry(url: string, options: RequestInit) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const resetTime = parseInt(response.headers.get('X-RateLimit-Reset') || '0');
    const waitTime = (resetTime * 1000) - Date.now();

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return fetchWithRetry(url, options);
    }
  }

  return response;
}
```

## Error Handling

All API responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required or token invalid |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_TOKEN` | 401 | Token expired or malformed |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `ALREADY_EXISTS` | 409 | Resource already exists (e.g., email) |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `INVALID_INPUT` | 400 | Malformed request |
| `INSUFFICIENT_CREDITS` | 403 | Not enough credits |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Handling Example

```typescript
async function apiRequest(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!data.success) {
    const error = data.error;

    switch (error.code) {
      case 'UNAUTHORIZED':
      case 'INVALID_TOKEN':
        // Attempt token refresh
        await auth.refreshTokens();
        return apiRequest(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${auth.getAccessToken()}`,
          },
        });

      case 'VALIDATION_ERROR':
        // Handle field-level errors
        console.error('Validation errors:', error.details);
        break;

      case 'NOT_FOUND':
        console.error('Resource not found');
        break;

      default:
        console.error(`Error: ${error.message}`);
    }

    throw new Error(error.message);
  }

  return data;
}
```

## WebSocket Connection

For real-time chat functionality, connect to the Chat Service via Socket.IO:

### Connection Setup

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3004', {
  withCredentials: true,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected to chat service');
});

socket.on('disconnect', () => {
  console.log('Disconnected from chat service');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join:conversation` | Client -> Server | Join a conversation room |
| `leave:conversation` | Client -> Server | Leave a conversation room |
| `chat:message` | Bidirectional | Send/receive messages |
| `chat:typing` | Server -> Client | AI typing indicator |
| `chat:stream_chunk` | Server -> Client | Streaming response chunk |
| `chat:stream_end` | Server -> Client | Streaming complete |
| `chat:error` | Server -> Client | Error during processing |

### Complete Chat Example

```typescript
const socket = io('http://localhost:3004');

// Join conversation
socket.emit('join:conversation', 'conv_abc123');

// Track streaming response
let currentResponse = '';

socket.on('chat:typing', ({ isTyping }) => {
  if (isTyping) {
    showTypingIndicator();
  } else {
    hideTypingIndicator();
  }
});

socket.on('chat:stream_chunk', ({ content }) => {
  currentResponse += content;
  updateMessagePreview(currentResponse);
});

socket.on('chat:stream_end', ({ message }) => {
  currentResponse = '';
  addMessageToChat(message);
});

socket.on('chat:error', ({ message }) => {
  showError(message);
});

// Send message
function sendMessage(content: string, userId: string) {
  socket.emit('chat:message', {
    conversationId: 'conv_abc123',
    content,
    userId,
  });
}
```

## Common Use Cases

### 1. Browse and Search Characters

```typescript
// Get featured characters
const featured = await fetch('http://localhost:3003/api/characters/featured');

// Search by category
const companions = await fetch(
  'http://localhost:3003/api/characters?category=Companion&sortBy=rating&sortOrder=desc'
);

// Full-text search
const searchResults = await fetch(
  'http://localhost:3003/api/characters?query=friendly%20helper'
);
```

### 2. Start a Conversation

```typescript
// 1. Create conversation
const convResponse = await fetch('http://localhost:3004/api/conversations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    characterId: 'char_abc123',
    mode: 'chat',
  }),
});

const { data: conversation } = await convResponse.json();

// 2. Get initial messages (including greeting)
const messagesResponse = await fetch(
  `http://localhost:3004/api/conversations/${conversation.id}/messages`
);

// 3. Connect WebSocket and start chatting
socket.emit('join:conversation', conversation.id);
```

### 3. Manage Subscriptions

```typescript
// Get current subscription
const subscription = await fetch('http://localhost:3005/subscriptions/current', {
  headers: { 'Authorization': `Bearer ${accessToken}` },
});

// Create checkout for upgrade
const checkout = await fetch('http://localhost:3005/subscriptions/checkout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    planId: 'plan_pro',
    successUrl: 'https://myapp.com/success',
    cancelUrl: 'https://myapp.com/pricing',
  }),
});

// Redirect to checkout URL
window.location.href = checkout.data.checkoutUrl;
```

---

## Support

- **API Documentation:** See individual service YAML files in this directory
- **Issues:** Report issues on GitHub
- **Email:** api@bostonia.ai

Happy building!
