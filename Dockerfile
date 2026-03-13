# AlliGo - Production Dockerfile
# Build: docker build -t alligo .
# Run: docker run -p 3399:3399 -v alligo-data:/app/data alligo

FROM oven/bun:1 AS base
WORKDIR /app

# AlliGo uses Bun's built-in APIs, no external dependencies needed
# Production image
FROM base AS release
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/alligo.db

# Expose port
EXPOSE 3399

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3399/health || exit 1

# Run the server
CMD ["bun", "run", "src/api/server.ts"]
