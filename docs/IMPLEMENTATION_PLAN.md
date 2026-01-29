# Bostonia MVP Implementation Plan

## Overview
- **Timeline**: 12 weeks (backend-first approach)
- **Stack**: Hybrid (Node.js/TypeScript + Python/FastAPI)
- **Structure**: Monorepo with Turborepo + PNPM

---

## Phase 1: Foundation (Weeks 1-4)

### Week 1: Project Setup ✅ COMPLETED
| Task | Agent | Description | Status |
|------|-------|-------------|--------|
| 1.1 | devops-engineer | Initialize monorepo (Turborepo + PNPM) | ✅ |
| 1.2 | typescript-expert | Create shared packages (types, Zod schemas) | ✅ |
| 1.3 | backend-engineer | Create Prisma schema from TECHNICAL_ARCHITECTURE.md | ✅ |
| 1.4 | devops-engineer | Docker Compose (PostgreSQL, Redis) | ✅ |
| 1.5 | devops-engineer | CI/CD pipelines (GitHub Actions) | ✅ |

**Checkpoint**: `pnpm install && pnpm build` works ✅, Docker starts DBs

### Week 2: Auth & User Services
| Task | Agent | Description |
|------|-------|-------------|
| 2.1 | api-designer | Design Auth/User API specs (OpenAPI) |
| 2.2 | typescript-expert | Auth Service - JWT, email/password, OAuth |
| 2.3 | typescript-expert | User Service - Profile, preferences, credits |
| 2.4 | qa-engineer | Unit + integration tests |

**Checkpoint**: Register, login, OAuth, profile CRUD working

### Week 3: Character Service
| Task | Agent | Description |
|------|-------|-------------|
| 3.1 | api-designer | Design Character API spec |
| 3.2 | typescript-expert | Character CRUD, search, ratings |
| 3.3 | backend-engineer | Seed 200+ characters |
| 3.4 | security-auditor | Security review |

**Checkpoint**: Character browse, search, rate working

### Week 4: AI & Memory Services (Python)
| Task | Agent | Description |
|------|-------|-------------|
| 4.1 | api-designer | Design AI/Memory API specs |
| 4.2 | python-expert | AI Orchestration - Claude integration, streaming |
| 4.3 | python-expert | Memory Service - Short-term (Redis), context |
| 4.4 | qa-engineer | Integration test: full chat flow |

**Checkpoint**: Send message, receive streamed AI response

---

## Phase 2: Chat System (Weeks 5-8)

### Week 5: Chat Service & WebSocket
| Task | Agent | Description |
|------|-------|-------------|
| 5.1 | api-designer | Design Chat API (REST + WebSocket) |
| 5.2 | typescript-expert | Chat Service - Socket.io, streaming |
| 5.3 | typescript-expert | Redis pub/sub for scaling |
| 5.4 | qa-engineer | WebSocket integration tests |

**Checkpoint**: Real-time chat works with reconnection

### Week 6: Chat Features & Moderation
| Task | Agent | Description |
|------|-------|-------------|
| 6.1 | typescript-expert | Conversation branching, export |
| 6.2 | python-expert | Content Moderation - classification, filtering |
| 6.3 | backend-engineer | Integrate moderation with chat |

**Checkpoint**: Branching, export, content filtering working

### Week 7: Frontend Foundation
| Task | Agent | Description |
|------|-------|-------------|
| 7.1 | frontend-engineer | Next.js 14 setup, design system (Tailwind) |
| 7.2 | frontend-engineer | Auth pages (login, register, OAuth) |
| 7.3 | frontend-engineer | Character browse, search, detail pages |
| 7.4 | frontend-engineer | API client (TanStack Query), state (Zustand) |

**Checkpoint**: Auth flow + character browsing end-to-end

### Week 8: Chat Interface
| Task | Agent | Description |
|------|-------|-------------|
| 8.1 | frontend-engineer | WebSocket client hook |
| 8.2 | frontend-engineer | Chat UI - messages, streaming, actions |
| 8.3 | frontend-engineer | Conversation sidebar |
| 8.4 | qa-engineer | E2E tests for chat flow |

**Checkpoint**: Complete chat experience working

---

## Phase 3: Polish & Launch (Weeks 9-12)

### Week 9: Profile & Settings
| Task | Agent | Description |
|------|-------|-------------|
| 9.1 | frontend-engineer | Profile page, settings, favorites |
| 9.2 | frontend-engineer | Conversation history dashboard |

### Week 10: Payment Integration
| Task | Agent | Description |
|------|-------|-------------|
| 10.1 | api-designer | Design Payment API spec |
| 10.2 | typescript-expert | Payment Service - Stripe subscriptions, credits |
| 10.3 | frontend-engineer | Pricing page, checkout, billing UI |
| 10.4 | qa-engineer | Payment E2E tests |

**Checkpoint**: Subscriptions and credit purchases working

### Week 11: Character Creation
| Task | Agent | Description |
|------|-------|-------------|
| 11.1 | frontend-engineer | Character Creation Studio |
| 11.2 | frontend-engineer | Personality builder, testing sandbox |
| 11.3 | frontend-engineer | Memory viewer UI |
| 11.4 | qa-engineer | Accessibility audit |

### Week 12: Launch Prep
| Task | Agent | Description |
|------|-------|-------------|
| 12.1 | backend-engineer | Performance optimization |
| 12.2 | security-auditor | Full security audit |
| 12.3 | qa-engineer | Load testing (1000 concurrent users) |
| 12.4 | devops-engineer | Production infrastructure (EKS) |
| 12.5 | devops-engineer | Monitoring, alerting, logging |
| 12.6 | technical-writer | API + user documentation |

---

## Service Ports

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

---

## Verification (MVP Launch Criteria)

- [ ] All services deployed and healthy
- [ ] 99.9% uptime for 2 weeks
- [ ] <2s response time (P95) for chat
- [ ] 200+ characters available
- [ ] Payment flow working (Stripe test mode)
- [ ] Content moderation active
- [ ] Mobile-responsive web app
- [ ] Load test passed (1000 concurrent)
- [ ] Security audit passed
- [ ] Documentation complete
