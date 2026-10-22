# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/

RUN npm run build && npm prune --omit=dev

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# dumb-init for PID 1 signals; bash, procps, iproute2 for live-troubleshoot.sh
RUN apk add --no-cache dumb-init bash procps iproute2

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node src/scripts ./src/scripts

USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]
