FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build


FROM node:20-alpine

WORKDIR /app

ENV APP_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Optional: keep example env for reference inside the image
COPY env.example ./env.example

# Default port for MCP server
EXPOSE 3001

CMD ["node", "dist/index.js"]

