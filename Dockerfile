FROM node:24.19.0-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache g++ make python3
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.19.0-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.19.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 dailylog
COPY --from=builder --chown=dailylog:nodejs /app/.next/standalone ./
COPY --from=builder --chown=dailylog:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=dailylog:nodejs /app/assets ./assets
RUN mkdir -p /data && chown dailylog:nodejs /data
USER dailylog
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
