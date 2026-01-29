FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY services/auth-service/package.json services/auth-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY services/auth-service services/auth-service

# Generate Prisma client
RUN pnpm --filter @bostonia/database generate

# Build packages
RUN pnpm --filter @bostonia/auth-service build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bostonia

# Copy built files
COPY --from=builder --chown=bostonia:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=bostonia:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=bostonia:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=bostonia:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=bostonia:nodejs /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=bostonia:nodejs /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=bostonia:nodejs /app/services/auth-service/dist ./services/auth-service/dist
COPY --from=builder --chown=bostonia:nodejs /app/services/auth-service/package.json ./services/auth-service/

USER bostonia

EXPOSE 3001

CMD ["node", "services/auth-service/dist/index.js"]
