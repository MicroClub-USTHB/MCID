# Build from the repository root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
#     -t mcid-web .
FROM node:24-alpine AS base

WORKDIR /usr/src/app

RUN corepack enable

ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1

# ── pruner: a minimal monorepo containing only @mcid/web and the workspace
#    packages it depends on, with a matching lockfile ─────────────────────────
FROM base AS pruner

ARG TURBO_VERSION=2.11.5
RUN npm install -g turbo@${TURBO_VERSION}

COPY . .

RUN turbo prune @mcid/web --docker

# ── builder: install (cached until a manifest changes), then build ───────────
FROM base AS builder

COPY --from=pruner /usr/src/app/out/json/ .

RUN pnpm install --frozen-lockfile

COPY --from=pruner /usr/src/app/out/full/ .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so they must be passed as build args (setting them at runtime has no effect).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NODE_ENV=production

RUN pnpm turbo run build --filter=@mcid/web

# ── production: only the standalone server, static assets and public files ──
FROM node:24-alpine AS production

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3002

WORKDIR /usr/src/app

USER node

# outputFileTracingRoot is the monorepo root, so server.js lands in apps/web/
COPY --from=builder --chown=node:node /usr/src/app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /usr/src/app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /usr/src/app/apps/web/public ./apps/web/public

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/ > /dev/null || exit 1

CMD ["node", "apps/web/server.js"]
