# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Production stage
FROM node:22-alpine

# Add runtime dependencies
RUN apk add --no-cache tini

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy node modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Verify the bot is still writing its runtime heartbeat.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "const fs=require('fs');const p=process.env.HEALTHCHECK_HEARTBEAT_PATH||'/tmp/beatdock-alive';try{const s=fs.statSync(p);process.exit(Date.now()-s.mtimeMs<120000?0:1)}catch{process.exit(1)}"]

# Start the application
CMD ["node", "src/index.js"]
