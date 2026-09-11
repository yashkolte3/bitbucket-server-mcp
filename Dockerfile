FROM node:20-alpine AS builder

WORKDIR /app

# Copy source files and configuration
COPY src /app/src
COPY package.json package-lock.json tsconfig.json /app/

# Install all dependencies (including devDependencies for tsc) and build the project
RUN npm ci && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy compiled artifacts and package definitions from builder
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package-lock.json /app/

# Install only production dependencies without triggering prepare/build scripts
RUN npm ci --omit=dev --ignore-scripts

# Default configuration (provide BITBUCKET_URL and optional BITBUCKET_TOKEN at runtime via -e)
ENV MCP_TRANSPORT=stdio
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["node", "build/index.js"]
