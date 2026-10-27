FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS dependencies
WORKDIR /app
RUN apk add --no-cache g++ make python3
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runner
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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /data /app/.next/cache && chown dailylog:nodejs /data /app/.next/cache
USER dailylog
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
