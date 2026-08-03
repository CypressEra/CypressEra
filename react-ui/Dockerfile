# Multi-stage build for React application

# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and npm config (for legacy peer deps, etc.)
COPY package*.json .npmrc ./

# Install dependencies (respects .npmrc, including legacy-peer-deps)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN CI=false npm run build

# Stage 2: Production server
FROM node:18-alpine

WORKDIR /app

# Copy package files and npm config
COPY package*.json .npmrc ./

# Install only production dependencies (respects .npmrc)
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Copy server file and template
COPY server.js ./
COPY public/index.template.ejs ./public/

# Expose port
EXPOSE 3000

# Set default environment variables
ENV PORT=3000
ENV API_BASE_URL=http://localhost:8080
ENV AGENT_BASE_URL=http://localhost:3001

# Start the server
CMD ["node", "server.js"]

