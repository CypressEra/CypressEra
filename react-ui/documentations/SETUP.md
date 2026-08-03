# Setup & Deployment Guide

Complete guide for setting up, configuring, and deploying the CypressEra React application.

## Table of Contents

- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Production Build](#production-build)
- [Server Setup](#server-setup)
- [Docker Deployment](#docker-deployment)
- [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- Node.js 16+ and npm
- Power Flow Analysis API server (default: `http://localhost:8080`)
- MCP server (default: `http://localhost:3001`)

### Install Dependencies

```bash
npm install
```

## Environment Configuration

### Environment Variables

The application uses environment variables for runtime configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `API_BASE_URL` | `http://localhost:8080` | Backend API URL |
| `MCP_BASE_URL` | `http://localhost:3001` | MCP server URL |

### Setting Environment Variables

**Development:**
```bash
API_BASE_URL=http://localhost:8080 MCP_BASE_URL=http://localhost:3001 npm start
```

**Production:**
```bash
API_BASE_URL=https://api.example.com MCP_BASE_URL=https://mcp.example.com npm run serve
```

## Development

### Start Development Server

```bash
npm start
```

The app will open at `http://localhost:3000` with hot reload enabled.

### Development Features

- ✅ Hot module replacement
- ✅ Fast refresh
- ✅ Source maps for debugging
- ✅ ESLint warnings in console

## Production Build

### Build the Application

```bash
npm run build
```

This creates an optimized production build in the `build/` directory:
- Minified JavaScript
- Optimized CSS
- Code splitting
- Code obfuscation (configured in `craco.config.js`)

### Build Output

```
build/
├── static/
│   ├── css/          # Minified CSS
│   ├── js/           # Obfuscated JavaScript
│   └── media/        # Optimized assets
├── index.html        # Production HTML
└── ...
```

## Server Setup

### Express Server with EJS

The project uses Express with EJS templating to inject environment variables at runtime.

**Key Files:**
- `server.js` - Express server
- `public/index.template.ejs` - EJS template
- `src/global.d.ts` - TypeScript declarations

### Running the Server

```bash
# Build first
npm run build

# Start server
npm run serve

# Or combined
npm run start:prod
```

### Accessing Environment Variables in Code

```typescript
// Direct access
const apiUrl = window.API_BASE_URL;
const mcpUrl = window.MCP_BASE_URL;

// Using config helper
import { API_BASE_URL, MCP_BASE_URL } from '@/config/api';
```

### API Configuration Helper

```typescript
// src/config/api.ts
export const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8080';
export const MCP_BASE_URL = window.MCP_BASE_URL || 'http://localhost:3001';

export const apiClient = {
  get: (endpoint: string) => 
    fetch(`${API_BASE_URL}${endpoint}`).then(res => res.json()),
  
  post: (endpoint: string, data: any) =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => res.json()),
};
```

## Docker Deployment

### Dockerfile

The project includes a multi-stage Dockerfile:

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/build ./build
COPY server.js ./
COPY public/index.template.ejs ./public/
EXPOSE 3000
CMD ["node", "server.js"]
```

### Build and Run

```bash
# Build image
docker build -t cypressera-ui .

# Run container
docker run -p 3000:3000 \
  -e API_BASE_URL=http://api.example.com:8080 \
  -e MCP_BASE_URL=http://mcp.example.com:3001 \
  cypressera-ui
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  react-ui:
    build: .
    ports:
      - "3000:3000"
    environment:
      - API_BASE_URL=http://api:8080
      - MCP_BASE_URL=http://mcp:3001
```

```bash
docker-compose up
```

## Deployment Options

### PM2

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start server.js --name cypressera-ui

# With environment variables
pm2 start server.js --name cypressera-ui \
  --env production \
  --update-env \
  -- PORT=3000 API_BASE_URL=http://api.example.com:8080
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### `window.API_BASE_URL` is undefined

**Solution:**
1. Ensure you're running through `server.js` (not opening HTML directly)
2. Check EJS template is being rendered
3. Verify environment variables are set
4. Check browser console for errors

### Port already in use

```bash
# Use different port
PORT=8000 npm run serve
```

### Build files not found

```bash
# Rebuild
npm run build
```

### Code obfuscation issues

See [CODE_PROTECTION_GUIDE.md](./CODE_PROTECTION_GUIDE.md) for details.

### Environment variables not working

1. Check `.env` file exists (if using)
2. Verify variables are exported before running
3. For Docker, use `-e` flag or environment section
4. Restart server after changing variables

## Next Steps

- See [ARCHITECTURE.md](./ARCHITECTURE.md) for project structure
- See [SDK.md](./SDK.md) for SDK integration
- See [I18N.md](./I18N.md) for internationalization setup

