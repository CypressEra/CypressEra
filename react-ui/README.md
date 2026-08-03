# CypressEra React UI

**AI-Powered Power Flow Analysis Software | Cloud Native**

A React-based frontend for power flow analysis, featuring AI assistance, network visualization, and comprehensive data management.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`

## 📋 Prerequisites

- **Node.js 16+** and npm
- **Backend API Server** running on `http://localhost:8080`
- **Agent Server** running on `http://localhost:3001` (for AI Assistant)

## 🛠️ Available Scripts

```bash
# Development
npm start              # Start dev server with hot reload

# Production
npm run build          # Build for production (with obfuscation)
npm run serve          # Serve production build
npm run start:prod     # Build and serve together

# Testing
npm test               # Run tests
```

## ⚙️ Configuration

### Environment Variables

Set API and MCP URLs via environment variables:

```bash
# Development
API_BASE_URL=http://localhost:8080 MCP_BASE_URL=http://localhost:3001 npm start

# Production
API_BASE_URL=https://api.example.com MCP_BASE_URL=https://mcp.example.com npm run start:prod
```

### Runtime Configuration

The app uses EJS templating to inject environment variables at runtime. Configuration is handled in:
- `server.js` - Express server
- `public/index.template.ejs` - HTML template
- `src/config/api.ts` - API client configuration

### Authentication & User Identity

- **Login flow** is handled entirely in the React app via the `AuthProvider` (`src/auth/AuthProvider.tsx`), which:
  - Calls `POST /api/v1/auth/login` on the Go API server.
  - Stores the returned JWT access token in memory/localStorage.
  - Decodes the token to infer the backend `user_id` from the `uid` / `sub` claims.
- The **XFlow SDK** (`PowerFlowApp`) does **not** require you to pass a `userId` from React:
  - React only passes the `accessToken` into the SDK (via `usePowerFlowSDK` and `AuthProvider`).
  - The SDK's `HttpClient` automatically adds `Authorization: Bearer <token>` to all API calls.
  - The SDK infers its own `userId` from the JWT and uses it for user-scoped operations (files, sessions, etc.).
- **File lists** (`/user/files`) are automatically loaded once after a successful login (see `App.tsx`), not on initial page load.
- The **AI Assistant / MCP client** uses the same JWT and resolved `userId` when registering with the knowledge base and making MCP calls.

### Google OAuth Authentication

The app supports Google OAuth login alongside email/password authentication.

**How it works:**
1. User clicks "Sign in with Google" button in the login modal
2. App calls `GET /api/v1/auth/google/url` to get the OAuth authorization URL
3. A popup opens to Google's OAuth consent screen
4. After user authorizes, Google redirects to `/auth/google/callback?code=...`
5. The `GoogleCallbackPage` component sends the code to the backend
6. Backend exchanges the code for user info and returns a JWT
7. The popup sends the JWT to the opener window via `postMessage`
8. The login modal receives the JWT and completes authentication

**Configuration:**
- Google OAuth credentials must be configured in the backend API server
- The callback route `/auth/google/callback` is handled by `GoogleCallbackPage.tsx`
- The login modal (`LoginModal.tsx`) handles the OAuth popup flow

## 🐳 Docker

```bash
# Build image
docker build -t cypressera-ui .

# Run container
docker run -p 3000:3000 \
  -e API_BASE_URL=http://api.example.com:8080 \
  -e MCP_BASE_URL=http://mcp.example.com:3001 \
  cypressera-ui

# Or use docker-compose
docker-compose up
```

## 📚 Documentation

**For new developers:** Start with the comprehensive guide:

👉 **[documentations/README.md](./documentations/README.md)** - Complete developer guide

### Documentation Index

| Document | Description |
|----------|-------------|
| [SETUP.md](./documentations/SETUP.md) | Installation, configuration, deployment |
| [ARCHITECTURE.md](./documentations/ARCHITECTURE.md) | Project structure and patterns |
| [SDK.md](./documentations/SDK.md) | XFlow SDK usage guide |
| [I18N.md](./documentations/I18N.md) | Internationalization guide |
| [LOGGING.md](./documentations/LOGGING.md) | Logging system |
| [API.md](./documentations/API.md) | Network and API docs |
| [CODE_PROTECTION_GUIDE.md](./documentations/CODE_PROTECTION_GUIDE.md) | Code obfuscation setup |
| [SEO_SETUP.md](./documentations/SEO_SETUP.md) | SEO configuration for production |

## 🏗️ Project Structure

```
src/
├── components/
│   ├── common/          # Reusable UI components
│   ├── features/        # Feature modules (main work area)
│   ├── layout/          # Layout components
│   └── ui/              # UI context providers
├── hooks/               # Custom React hooks
├── sdk/                 # XFlow SDK (PowerFlowApp)
├── i18n/                # Internationalization
└── config/              # Configuration
```

## 🎯 Key Features

- ✅ **Power Flow Analysis** - DC and AC calculations
- ✅ **Network Visualization** - Interactive diagrams
- ✅ **AI Assistant** - Intelligent help with analysis
- ✅ **Multi-language** - English, Chinese, Spanish
- ✅ **File Management** - Upload, view, edit network files
- ✅ **Real-time Logging** - Command logger with SDK integration
- ✅ **Google OAuth** - Sign in with Google account

## 🔧 Tech Stack

- React 19 + TypeScript
- Tailwind CSS
- react-i18next
- Express + EJS
- XFlow SDK
- CRACO (webpack config)

## 🆘 Troubleshooting

### Backend Connection Issues

```bash
# Check backend is running
curl http://localhost:8080/health

# Verify environment variables
echo $API_BASE_URL
```

### Build Issues

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node version (need 16+)
node --version
```

### Translation Issues

```bash
# Clear localStorage
# In browser console:
localStorage.clear()
```

## 📖 For More Help

- **New to the project?** Read [documentations/README.md](./documentations/README.md)
- **Setting up?** See [documentations/SETUP.md](./documentations/SETUP.md)
- **Building features?** Check [documentations/ARCHITECTURE.md](./documentations/ARCHITECTURE.md)
- **Using the SDK?** See [documentations/SDK.md](./documentations/SDK.md)

## 📝 License

[Your License Here]

---

**Need help?** Check the [documentation](./documentations/) folder for detailed guides.
