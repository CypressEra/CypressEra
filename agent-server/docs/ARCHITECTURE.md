# Agent Server Architecture

## Project Structure

```
agent-server/
├── src/
│   ├── config/            # Configuration management
│   │   └── index.ts       # Environment variable loading and validation
│   ├── services/          # Business logic services
│   │   ├── openaiClient.ts # OpenAI API client
│   │   └── index.ts      # Services module exports
│   ├── routes/            # API route handlers
│   │   ├── chat.ts        # Chat-related endpoints
│   │   └── index.ts       # Routes module exports
│   ├── middleware/        # Express middleware
│   │   └── index.ts       # Error handling, logging, etc.
│   ├── prompts/           # AI prompts and system messages
│   │   ├── system.ts      # System prompt builder
│   │   └── index.ts      # Prompts module exports
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts       # All type definitions
│   ├── utils/             # Utility functions (future)
│   ├── server.ts          # Express server setup
│   ├── sdkFunctions.ts    # SDK function definitions
│   └── index.ts           # Application entry point
├── docs/
│   ├── sdk/               # SDK usage documentation
│   │   ├── README.md
│   │   ├── session-management.md
│   │   ├── network-operations.md
│   │   ├── analysis.md
│   │   └── element-types.md
│   └── ARCHITECTURE.md    # This file
├── package.json
├── tsconfig.json
└── README.md
```

## Key Components

### Configuration (`src/config/`)

**Purpose**: Centralized configuration management
- Loads and validates environment variables
- Provides type-safe configuration object
- Handles `.env` file creation from `env.example`
- Singleton pattern for configuration access

**Usage:**
```typescript
import { getConfig } from './config/index.js';
const config = getConfig(); // Returns AppConfig
```

**Configuration Interface:**
```typescript
interface AppConfig {
  port: number;
  openaiApiKey: string;
  openaiModel: string;
  logLevel: string;
  appEnv: 'development' | 'production' | 'test';
}
```

### Services (`src/services/`)

**Purpose**: Business logic and external API clients
- **OpenAIClient**: Handles all OpenAI API communication
  - Chat requests with function calling
  - Continuing conversations after function execution
  - Message format conversion

**Usage:**
```typescript
import { OpenAIClient } from './services/index.js';
const client = new OpenAIClient(apiKey, model);
```

### Routes (`src/routes/`)

**Purpose**: API endpoint handlers
- **chat.ts**: Chat-related endpoints
  - `POST /api/v1/chat` - Initial chat request
  - `POST /api/v1/chat/continue` - Continue after function execution
- Routes are modular and can be easily extended

**Usage:**
```typescript
import { createChatRoutes } from './routes/index.js';
const chatRoutes = createChatRoutes(openaiClient);
app.use(chatRoutes);
```

### Middleware (`src/middleware/`)

**Purpose**: Express middleware for cross-cutting concerns
- **requestLogger**: Logs HTTP requests (development only)
- **errorHandler**: Centralized error handling

**Usage:**
```typescript
import { requestLogger, errorHandler } from './middleware/index.js';
app.use(requestLogger);
app.use(errorHandler); // Must be last
```

### Prompts (`src/prompts/`)

**Purpose**: AI prompts and system messages
- **system.ts**: System prompt builder with context support
- Centralized location for all AI instructions

**Usage:**
```typescript
import { buildSystemPrompt } from './prompts/index.js';
const prompt = buildSystemPrompt({ currentSession: 'id', userId: 'user' });
```

### Types (`src/types/`)

**Purpose**: TypeScript type definitions
- All interfaces and types in one place
- Exported from `index.ts` for easy imports

**Usage:**
```typescript
import { ChatRequest, ChatResponse, FunctionCall } from './types/index.js';
```

### Server (`src/server.ts`)

**Purpose**: Express server setup and orchestration
- Creates Express app
- Configures middleware
- Registers routes
- Starts HTTP server

**Usage:**
```typescript
import { MCPServer } from './server.js';
const server = new MCPServer(config);
server.start();
```

## Design Principles

1. **Separation of Concerns**: Each directory has a single, clear responsibility
2. **Modularity**: Components are loosely coupled and can be tested independently
3. **Scalability**: Easy to add new routes, services, middleware, or prompts
4. **Type Safety**: Full TypeScript support with proper type definitions
5. **Configuration Management**: Centralized, validated configuration
6. **Error Handling**: Centralized error handling middleware

## Request Flow

```
1. HTTP Request
   ↓
2. Middleware (CORS, JSON parsing, logging)
   ↓
3. Route Handler (routes/chat.ts)
   ↓
4. Service Layer (services/openaiClient.ts)
   ↓
5. OpenAI API
   ↓
6. Response
   ↓
7. Error Handler (if error occurred)
```

## Adding New Features

### Adding a New Route

1. Create a new file in `src/routes/` (e.g., `admin.ts`)
2. Export a function that creates the router
3. Import and use in `server.ts`:
```typescript
import { createAdminRoutes } from './routes/admin.js';
const adminRoutes = createAdminRoutes();
this.app.use('/api/v1/admin', adminRoutes);
```

### Adding a New Service

1. Create a new file in `src/services/` (e.g., `cacheService.ts`)
2. Export the service class/function
3. Add to `src/services/index.ts`
4. Use in routes or other services

### Adding a New Middleware

1. Add function to `src/middleware/index.ts`
2. Import and use in `server.ts`:
```typescript
import { newMiddleware } from './middleware/index.js';
this.app.use(newMiddleware);
```

### Adding Configuration

1. Add to `AppConfig` interface in `src/config/index.ts`
2. Load from environment in `loadConfig()`
3. Validate if needed
4. Use via `getConfig()`

## Future Enhancements

- **Utils Directory**: Common utility functions
- **Validation**: Request validation middleware
- **Authentication**: Auth middleware and services
- **Rate Limiting**: Rate limiting middleware
- **Caching**: Caching service for OpenAI responses
- **Logging**: Structured logging service
- **Testing**: Unit and integration tests
