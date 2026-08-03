# EJS Setup Complete ✓

## What Was Set Up

The project now uses **Express + EJS** to inject the `API_BASE_URL` environment variable into your React application at runtime.

### Files Created/Modified

1. **`server.js`** - Express server that serves the React app and injects `API_BASE_URL`
2. **`public/index.template.ejs`** - EJS template (fallback for development)
3. **`src/config/api.ts`** - Helper module for making API calls
4. **`src/global.d.ts`** - TypeScript declarations for `window.API_BASE_URL`
5. **`package.json`** - Added `express` and `ejs` dependencies, new `serve` script
6. **`SERVER_SETUP.md`** - Complete documentation for the setup

## Quick Start

### 1. Build the React app
```bash
npm run build
```

### 2. Start the server (default: localhost:8080)
```bash
npm run serve
```

The server will run on port 3000 and `API_BASE_URL` will be `http://localhost:8080`

### 3. Custom API URL
```bash
API_BASE_URL=http://your-api.com:8080 npm run serve
```

### 4. Custom Port
```bash
PORT=8000 API_BASE_URL=http://your-api.com:8080 npm run serve
```

## Using API_BASE_URL in Your Code

### Direct Usage
```typescript
const apiUrl = window.API_BASE_URL;
fetch(`${window.API_BASE_URL}/api/data`)
  .then(res => res.json())
  .then(data => console.log(data));
```

### Using the API Helper
```typescript
import { apiClient, API_BASE_URL } from './config/api';

// GET request
const users = await apiClient.get('/api/users');

// POST request
const newUser = await apiClient.post('/api/users', {
  name: 'John Doe',
  email: 'john@example.com'
});
```

## Deployment

### Docker Example
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t react-ui .
docker run -p 3000:3000 -e API_BASE_URL=http://api.example.com:8080 react-ui
```

## Verification

The setup was tested and verified:
- ✓ Build completes successfully
- ✓ Server starts without errors
- ✓ `API_BASE_URL` is injected into HTML at runtime
- ✓ Custom environment variables work correctly

## Next Steps

1. Update your API calls to use `window.API_BASE_URL` or the `apiClient` helper
2. Set up your production environment variables
3. Deploy using your preferred method (Docker, PM2, etc.)

For more detailed information, see `SERVER_SETUP.md`.