# Bostonia

AI-powered character chat platform built with modern web technologies.

## Tech Stack

### Backend (Node.js)
- **Express.js + TypeScript** - REST API framework
- **Prisma ORM** - Database access and migrations
- **Socket.io + Redis adapter** - Real-time WebSocket communication
- **Zod** - Runtime validation
- **Vitest** - Testing framework

### Backend (Python)
- **FastAPI** - High-performance API framework
- **Anthropic SDK** - Claude AI integration
- **Redis** - Caching and pub/sub
- **Pinecone** - Vector database for memories

### Frontend
- **Next.js 14** - React framework with App Router
- **Zustand** - State management
- **TanStack Query** - Server state management
- **Tailwind CSS** - Styling
- **Socket.io client** - Real-time communication

### Infrastructure
- **PostgreSQL 15** - Primary database
- **Redis 7** - Caching, sessions, pub/sub
- **Docker & Kubernetes** - Containerization
- **GitHub Actions** - CI/CD

## Project Structure

```
bostonia/
├── packages/
│   ├── shared/              # Shared types, validation (Zod)
│   └── database/            # Prisma schema & migrations
├── services/
│   ├── auth-service/        # Node.js - JWT, OAuth
│   ├── user-service/        # Node.js - Profiles, credits
│   ├── chat-service/        # Node.js + Socket.io
│   ├── character-service/   # Node.js - CRUD, search
│   ├── payment-service/     # Node.js - Stripe
│   ├── ai-orchestration/    # Python/FastAPI - Claude
│   ├── memory-service/      # Python/FastAPI - RAG
│   └── content-moderation/  # Python/FastAPI
├── apps/
│   └── web/                 # Next.js 14+ (App Router)
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
└── docs/
```

## Getting Started

### Prerequisites

- Node.js 20+
- PNPM 9+
- Python 3.11+
- Docker & Docker Compose

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository>
   cd bostonia
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start infrastructure (PostgreSQL, Redis)**
   ```bash
   pnpm docker:up
   ```

4. **Generate Prisma client and run migrations**
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

5. **Seed the database (optional)**
   ```bash
   pnpm --filter @bostonia/database seed
   ```

6. **Start development servers**
   ```bash
   pnpm dev
   ```

### Running Individual Services

```bash
# Node.js services
pnpm --filter @bostonia/auth-service dev
pnpm --filter @bostonia/user-service dev
pnpm --filter @bostonia/character-service dev
pnpm --filter @bostonia/chat-service dev
pnpm --filter @bostonia/payment-service dev

# Python services (from service directory)
cd services/ai-orchestration
poetry install
poetry run uvicorn src.main:app --reload --port 8001

# Frontend
pnpm --filter @bostonia/web dev
```

### Service Ports

| Service | Port |
|---------|------|
| Web (Next.js) | 3000 |
| Auth Service | 3001 |
| User Service | 3002 |
| Character Service | 3003 |
| Chat Service | 3004 |
| Payment Service | 3005 |
| AI Orchestration | 8001 |
| Memory Service | 8002 |
| Content Moderation | 8003 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Development

### Commands

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format code
pnpm format
```

### Database

```bash
# Generate Prisma client
pnpm db:generate

# Push schema changes
pnpm db:push

# Run migrations
pnpm db:migrate

# Open Prisma Studio
pnpm db:studio
```

### Docker

```bash
# Start infrastructure
pnpm docker:up

# Stop infrastructure
pnpm docker:down

# View logs
pnpm docker:logs

# Start with management tools (pgAdmin, Redis Commander)
docker-compose --profile tools up -d
```

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT tokens
- `ANTHROPIC_API_KEY` - Claude AI API key
- `STRIPE_SECRET_KEY` - Stripe payment processing

## License

Private - All rights reserved
