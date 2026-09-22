FROM node:20-alpine AS base

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build tools after native compilation
RUN apk del python3 make g++

# Copy source
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY .env.example ./.env.example

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
