# ==============================================================================
# Production Multi-Stage Dockerfile (Size & Security Optimized)
# - Multi-stage build (reduces final image from ~1.2GB to < 180MB)
# - Non-root execution using unprivileged 'node' user (Prevents container breakout)
# - Dumb-init for proper PID 1 signal handling (SIGTERM / graceful shutdown)
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/

# Compile TypeScript to JavaScript
RUN npm run build

# Prune devDependencies to keep only production packages
RUN npm prune --production

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init for PID 1 signal forwarding
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=4000

# Copy node_modules and built artifacts from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY src/scripts ./src/scripts

# Run as non-root user (CWE-250 security remediation)
USER node

EXPOSE 4000

# Dumb-init handles SIGTERM/SIGINT and reaps zombie processes
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/server.js"]
