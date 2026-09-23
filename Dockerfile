# app8n ships as one image running two processes: the Next server and the
# scheduler worker (see docker-compose.yml, which runs the same image twice
# with different commands). Node 22 matches the better-sqlite3 prebuilds.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# python3/make/g++ are here for better-sqlite3, which compiles from source when
# no prebuild matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build must not need real credentials: mock mode keeps the Google clients
# off the network while pages are prerendered.
ENV APP8N_MOCK_GOOGLE=1
RUN npm run build
# The scheduler ships as one bundled file rather than as TypeScript plus a
# runtime: `next build` traces only what the server imports, so running the
# worker from source in the image would need a second, full node_modules.
# better-sqlite3 stays external because it is a native addon.
RUN npm run build:worker

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# `file:` URLs resolve against the working directory; /app/data is the volume.
ENV DATABASE_URL=file:./data/app8n.db

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home app8n

# The standalone server, its static assets, the migrations both processes
# apply at boot, and the bundled scheduler.
COPY --from=builder --chown=app8n:app8n /app/.next/standalone ./
COPY --from=builder --chown=app8n:app8n /app/.next/static ./.next/static
COPY --from=builder --chown=app8n:app8n /app/public ./public
COPY --from=builder --chown=app8n:app8n /app/drizzle ./drizzle
COPY --from=builder --chown=app8n:app8n /app/dist ./dist

RUN mkdir -p /app/data && chown app8n:app8n /app/data
VOLUME ["/app/data"]
USER app8n
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
