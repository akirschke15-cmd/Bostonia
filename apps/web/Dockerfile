FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bostonia/web build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
