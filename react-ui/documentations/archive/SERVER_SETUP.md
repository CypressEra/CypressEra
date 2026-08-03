# Server Setup with EJS Template

This project uses EJS templating to inject environment variables (like `API_BASE_URL`) into the React application at runtime.

## Overview

The setup includes:
- **EJS Template**: `public/index.html.ejs` - Template file with environment variable placeholders
- **Express Server**: `server.js` - Node.js server that renders the EJS template and serves the React app
- **TypeScript Declarations**: `src/global.d.ts` - Type definitions for `window.API_BASE_URL`

## Configuration

### Environment Variables

Create a `.env` file in the project root (see `.env.example` for reference):

```bash
# Server Configuration
PORT=3000

# API Configuration
API_BASE_URL=http://localhost:8080
```

### Default Values

If environment variables are not set, the following defaults are used:
- `PORT`: 3000
- `API_BASE_URL`: http://localhost:8080

## Usage

### Development Mode

For development with hot reloading:

```bash
npm start
```

This runs the React development server (without EJS rendering). To test with the server:

```bash
npm run build
npm run serve
```

### Production Mode

Build and serve the app:

```bash
npm run start:prod
```

Or separately:

```bash
# Build the React app
npm run build

# Start the Express server
npm run serve
```

### Custom Configuration

Set environment variables when running the server:

```bash
# On macOS/Linux
API_BASE_URL=http://api.example.com:8080 PORT=8000 npm run serve

# Or export them first
export API_BASE_URL=http://api.example.com:8080
export PORT=8000
npm run serve
```

## Accessing API_BASE_URL in Your Code

The `API_BASE_URL` is injected into the global `window` object and can be accessed anywhere in your React components:

```typescript
// Example usage in a component
const apiUrl = window.API_BASE_URL;

fetch(`${window.API_BASE_URL}/api/users`)
  .then(response => response.json())
  .then(data => console.log(data));
```

### Creating an API Helper

It's recommended to create a centralized API configuration:

```typescript
// src/config/api.ts
export const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8080';

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

## Deployment

### Docker Deployment

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

Build and run:

```bash
docker build -t react-ui .
docker run -p 3000:3000 -e API_BASE_URL=http://api.example.com:8080 react-ui
```

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start the server
pm2 start server.js --name react-ui

# With environment variables
pm2 start server.js --name react-ui --env production \
  --update-env \
  -- PORT=3000 API_BASE_URL=http://api.example.com:8080
```

## File Structure

```
react-ui/
├── server.js                  # Express server with EJS rendering
├── public/
│   └── index.html.ejs        # EJS template (source)
├── build/                     # Production build output
├── src/
│   ├── global.d.ts           # TypeScript declarations
│   └── ...                   # Your React components
└── .env                      # Environment variables (gitignored)
```

## Troubleshooting

### `window.API_BASE_URL` is undefined

Make sure you're:
1. Running the app through `server.js` (not just opening the HTML file)
2. The EJS template is being rendered correctly
3. Check browser console for any errors

### Port already in use

Change the port:

```bash
PORT=8000 npm run serve
```

### Build files not found

Make sure to build the React app first:

```bash
npm run build
```