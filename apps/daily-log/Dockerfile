FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS dependencies
# Build from the repository root: the lockfile and pnpm-workspace.yaml live there.
WORKDIR /app
RUN apk add --no-cache g++ make python3
RUN npm install --global pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/daily-log/package.json apps/daily-log/
RUN pnpm install --frozen-lockfile --filter dailylog

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/daily-log apps/daily-log
WORKDIR /app/apps/daily-log
RUN pnpm run build

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 dailylog
# The app stays root-owned so the server can't rewrite its own code; only the
# database and Next's cache are writable.
COPY --from=builder /app/apps/daily-log/.next/standalone ./
COPY --from=builder /app/apps/daily-log/.next/static ./apps/daily-log/.next/static
RUN mkdir -p /data /app/apps/daily-log/.next/cache && chown dailylog:nodejs /data /app/apps/daily-log/.next/cache
WORKDIR /app/apps/daily-log
USER dailylog
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
