# Developer Guide

Welcome to the Agent Server project! This guide will help you understand the codebase, set up your development environment, and contribute to the project.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Debugging](#debugging)
- [Code Style & Best Practices](#code-style--best-practices)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

The MCP (Model Context Protocol) Server is an AI-powered backend service that:

- Provides a conversational interface for power flow analysis
- Uses OpenAI's function calling to interpret user requests
- Supports knowledge base retrieval (RAG) for enhanced context
- Executes tools directly via API-Server (not through frontend SDK)
- Manages document indexing and vector storage

### Technology Stack

- **Runtime**: Node.js (ES2022)
- **Language**: TypeScript
- **Framework**: Express.js
- **AI**: OpenAI API (GPT-4o, text-embedding-3-small)
- **Storage**: JSON-based vector storage (no external database)
- **File Watching**: Chokidar
- **Logging**: Winston

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18+ (recommended: v20+)
- **npm**: v9+ (comes with Node.js)
- **Git**: For version control
- **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/api-keys)

### Verify Installation

```bash
node --version  # Should be v18 or higher
npm --version   # Should be v9 or higher
git --version   # Any recent version
```

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/CypressEra/MCP-SERVER.git
cd agent-server
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- `openai` - OpenAI API client
- `express` - Web framework
- `chokidar` - File system watcher
- `pdf-parse` & `mammoth` - Document processors
- `winston` - Logging
- `tsx` - TypeScript execution (dev)
- `typescript` - TypeScript compiler

### 3. Configure Environment

The project will automatically create a `.env` file from `.env.example` if it doesn't exist. However, you should create it manually to ensure proper configuration:

```bash
# Create .env file
cat > .env << EOF
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4o

# Knowledge Base Configuration
KB_EMBEDDING_MODEL=text-embedding-3-small
KB_CHUNK_SIZE=800
KB_CHUNK_OVERLAP=150
KB_TOP_K=3
KB_BASE_PATH=../user-data/knowledge
KB_ENABLE_FILE_WATCHER=true

# Server Configuration
PORT=3001
APP_ENV=development

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=simple
ENABLE_REQUEST_LOGGING=true
EOF
```

**Important**: Replace `sk-your-actual-api-key-here` with your actual OpenAI API key.

### 4. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 5. Start Development Server

```bash
npm run dev
```

This starts the server with hot-reload using `tsx watch`. The server will:
- Start on `http://localhost:3001`
- Watch for file changes and automatically restart
- Show detailed debug logs

### 6. Verify Installation

In another terminal, test the health endpoint:

```bash
curl http://localhost:3001/health
```

You should see:
```json
{
  "status": "ok",
  "service": "agent-server",
  "version": "1.0.0",
  "environment": "development"
}
```

## Project Structure

```
agent-server/
├── src/
│   ├── app.ts                    # Bootstrap — plugin registration and DI wiring
│   ├── index.ts                  # Entry point
│   ├── server.ts                 # Express server setup
│   │
│   ├── core/                     # Infrastructure (cross-cutting)
│   │   ├── config/               # AppConfig, env loading
│   │   ├── di/                   # ServiceContainer, PluginModule interface
│   │   ├── middleware/           # Express middleware (errors, logging)
│   │   ├── types/                # Shared TypeScript types, LLMClient interface
│   │   └── utils/                # Logger, errors, math, toolExecutor, apiClient
│   │
│   ├── features/                 # Always-loaded business features
│   │   ├── chat/                 # ChatController, routes, SSE, prompts
│   │   └── knowledge-base/       # RAG: embedding, indexing, retrieval, file watcher
│   │
│   ├── modules/                  # Optional pluggable modules
│   │   └── brain/                # BrainEngine — dynamic tool loop
│   │       ├── engine/           # BrainEngine.ts, toolClassifier.ts
│   │       ├── prompts/          # coordinator.ts, powerflow.ts
│   │       ├── plugin.ts         # Registers BrainEngine in the container
│   │       ├── types.ts          # Brain interface, BrainSSEEvent, BrainRunOptions
│   │       └── index.ts
│   │
│   └── mcp/                      # LLM client and tool definitions
│       ├── openaiClient.ts       # OpenAIClient (implements LLMClient)
│       └── sdkFunctions.ts       # 22 SDK tool definitions for the model
│
├── docs/                         # Documentation
│   ├── DEVELOPER_GUIDE.md
│   ├── ARCHITECTURE.md
│   ├── API.md                    # SSE event reference, Brain Engine docs
│   └── sdk/                      # Per-tool parameter documentation
│
├── dist/                         # Compiled output (generated)
├── package.json
├── tsconfig.json                 # Includes @core/*, @features/*, @modules/* path aliases
└── README.md
```

### Key directories

#### `src/core/`
Infrastructure used everywhere: config loading, DI container, middleware, shared types, utility functions (logger, toolExecutor, apiClient). Import via `@core/*`.

#### `src/features/chat/`
`ChatController` receives requests, sets SSE headers, dispatches to BrainEngine (when enabled) or falls back to a direct 10-round tool loop. Import via `@features/*`.

#### `src/features/knowledge-base/`
RAG pipeline: document processing, chunking, embedding, JSON-file vector store, retrieval. Import via `@features/*`.

#### `src/modules/brain/`
`BrainEngine` implements the `Brain` interface — a dynamic tool loop where the model sees every tool result before deciding its next action. Registered via `BrainPlugin` when `ENABLE_BRAIN=true`. Import via `@modules/*`.

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev          # Start dev server with hot-reload
npm run build        # Compile TypeScript to JavaScript
npm start            # Run production build (4GB memory limit)
npm run start:memory # Run production build (8GB memory limit)
```

### Development Process

1. **Make Changes**: Edit files in `src/`
2. **Auto-Reload**: `npm run dev` automatically restarts on file changes
3. **Check Logs**: Watch the console for errors and debug information
4. **Test Endpoints**: Use `curl` or Postman to test API endpoints
5. **Build**: Run `npm run build` before committing

### Code Compilation

TypeScript is compiled to JavaScript in the `dist/` directory:

```bash
npm run build
```

The compiled output:
- Preserves directory structure
- Generates `.js`, `.d.ts`, and `.js.map` files
- Uses ES2022 modules (import/export)

## Architecture Deep Dive

### Request Flow

```
1. HTTP Request (POST /api/v1/chat)
   ↓
2. Middleware (CORS, JSON parsing, request logging)
   ↓
3. Route Handler (chat.controller.ts)
   ↓
4. Service Layer (OpenAIClient)
   ↓
5. OpenAI API (with function calling)
   ↓
6. Response (function calls or text)
   ↓
7. Error Handler (if error occurred)
```

### Dependency Injection

The project uses a simple dependency injection container located in `src/core/di/`. This allows:

- Loose coupling between components
- Easy testing (mock dependencies)
- Centralized service management

**Example Usage:**
```typescript
import { getContainer } from '@core/di/index.js';

const container = getContainer();
const chatController = container.get<ChatController>('chatController');
```

### Configuration Management

Configuration is loaded from environment variables via `src/core/config/index.ts`:

- Validates required variables
- Provides type-safe configuration object
- Auto-creates `.env` from example if missing
- Singleton pattern for configuration access

**Usage:**
```typescript
import { getConfig } from '@core/config/index.js';

const config = getConfig();
console.log(config.openaiApiKey); // Type-safe access
```

### Logging

Winston logger is configured in `src/core/utils/logger.ts`:

- Different log levels for dev/prod
- JSON format for production, simple for development
- Request logging middleware

**Usage:**
```typescript
import { logger } from '@core/utils/logger.js';

logger.info('Server started', { port: 3001 });
logger.error('Error occurred', error);
logger.debug('Debug information', { data });
```

### Knowledge Base (RAG) Flow

```
1. File Added/Modified (user-data/knowledge/{userId}/)
   ↓
2. File Watcher Detects Change
   ↓
3. Document Processor (extract text from PDF/DOCX/TXT)
   ↓
4. Chunking Service (split into chunks with overlap)
   ↓
5. Embedding Service (generate embeddings via OpenAI)
   ↓
6. Vector Store Repository (save to JSON files)
   ↓
7. Retrieval Service (cosine similarity search)
   ↓
8. Enhanced Prompt (context added to system prompt)
```

## Adding New Features

### Adding a New SDK Function

1. **Define the Function** in `src/mcp/sdkFunctions.ts`:

```typescript
{
  name: 'myNewFunction',
  description: 'Description of what this function does',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description'
      }
    },
    required: ['param1'],
    additionalProperties: false
  },
  strict: true
}
```

2. **Update Documentation** in `docs/sdk/` if needed

3. **Test** by sending a chat request that should trigger the function

### Adding a New API Endpoint

1. **Create Route Handler** in `src/chat/routes/`:

```typescript
// src/chat/routes/myFeature.ts
import { Router } from 'express';
import { MyFeatureController } from '../controllers/myFeature.controller.js';

export function createMyFeatureRoutes(controller: MyFeatureController) {
  const router = Router();
  
  router.post('/my-feature', async (req, res, next) => {
    try {
      const result = await controller.handleRequest(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}
```

2. **Create Controller** in `src/chat/controllers/`:

```typescript
// src/chat/controllers/myFeature.controller.ts
export class MyFeatureController {
  async handleRequest(data: any) {
    // Your logic here
    return { success: true };
  }
}
```

3. **Register Route** in `src/server.ts`:

```typescript
import { createMyFeatureRoutes } from './chat/routes/myFeature.js';

// In setupRoutes():
const myFeatureController = new MyFeatureController();
const myFeatureRoutes = createMyFeatureRoutes(myFeatureController);
this.app.use('/api/v1/my-feature', myFeatureRoutes);
```

### Adding a New Service

1. **Create Service File** in appropriate directory:

```typescript
// src/features/knowledge-base/services/myService.service.ts
export class MyService {
  async doSomething() {
    // Implementation
  }
}
```

2. **Export from index.ts**:

```typescript
// src/features/knowledge-base/services/index.ts
export { MyService } from './myService.service.js';
```

3. **Register in DI Container** (if needed):

```typescript
// src/core/di/container.ts
container.register('myService', () => new MyService());
```

### Adding Configuration

1. **Update Config Interface** in `src/core/config/index.ts`:

```typescript
export interface AppConfig {
  // ... existing config
  myNewConfig: string;
}
```

2. **Load from Environment**:

```typescript
const config: AppConfig = {
  // ... existing config
  myNewConfig: process.env.MY_NEW_CONFIG || 'default-value',
};
```

3. **Add to .env.example** (if applicable)

## Testing

### Manual Testing

**Test Chat Endpoint:**
```bash
curl -X POST http://localhost:3001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, can you help me?"
      }
    ],
    "context": {
      "userId": "test_user",
      "currentSession": "test_session",
      "useKnowledgeBase": false
    }
  }'
```

**Test Health Endpoint:**
```bash
curl http://localhost:3001/health
```

**Test Knowledge Base Indexing:**
```bash
# Add a file to user-data/knowledge/test_user/
# The file watcher should automatically index it
# Check logs for indexing status
```

### Unit Testing (Future)

When adding unit tests:

1. Create test files: `*.test.ts` or `*.spec.ts`
2. Use a testing framework (Jest, Mocha, etc.)
3. Mock dependencies using the DI container
4. Test in isolation

## Debugging

### Enable Debug Logging

Set in `.env`:
```env
LOG_LEVEL=debug
LOG_FORMAT=simple
ENABLE_REQUEST_LOGGING=true
```

### Common Debug Scenarios

**1. OpenAI API Issues**
- Check API key is correct
- Verify account has credits
- Check rate limits in logs
- Review OpenAI API status

**2. Knowledge Base Not Working**
- Verify `KB_BASE_PATH` is correct
- Check file permissions
- Ensure `KB_ENABLE_FILE_WATCHER=true`
- Check logs for indexing errors
- Verify files are in correct format (PDF/DOCX/TXT)

**3. Function Calls Not Triggering**
- Check SDK function definitions in `sdkFunctions.ts`
- Verify system prompt includes function descriptions
- Test with explicit function requests
- Check OpenAI response in logs

**4. Memory Issues**
- Use `npm run start:memory` for 8GB limit
- Check knowledge base size
- Monitor with `node --inspect`

### Using Node.js Debugger

```bash
# Start with debugger
node --inspect dist/index.js

# Or with tsx
tsx --inspect src/index.ts
```

Then connect Chrome DevTools at `chrome://inspect`

## Code Style & Best Practices

### TypeScript Guidelines

1. **Always use TypeScript types** - Avoid `any` when possible
2. **Use interfaces** for object shapes
3. **Export types** from `src/core/types/index.ts`
4. **Use ES modules** - Always use `.js` extension in imports

### Code Organization

1. **Single Responsibility** - Each file/class should do one thing
2. **Separation of Concerns** - Routes → Controllers → Services → Repositories
3. **Dependency Injection** - Use DI container for services
4. **Error Handling** - Use centralized error handler
5. **Logging** - Use logger utility, not `console.log`

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `chat.controller.ts`)
- **Classes**: `PascalCase` (e.g., `ChatController`)
- **Functions**: `camelCase` (e.g., `handleRequest`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Interfaces**: `PascalCase` (e.g., `AppConfig`)

### Import Organization

```typescript
// 1. External dependencies
import express from 'express';
import { OpenAI } from 'openai';

// 2. Internal modules (absolute paths from src/)
import { getConfig } from '@core/config/index.js';
import { logger } from '@core/utils/logger.js';

// 3. Relative imports
import { MyService } from './myService.js';
```

### Error Handling

Always use try-catch and pass errors to next middleware:

```typescript
router.post('/endpoint', async (req, res, next) => {
  try {
    const result = await service.doSomething();
    res.json(result);
  } catch (error) {
    next(error); // Pass to error handler
  }
});
```

## Troubleshooting

### Build Errors

**"Cannot find module"**
- Run `npm install` to ensure dependencies are installed
- Check import paths use `.js` extension
- Verify `tsconfig.json` settings

**Type Errors**
- Run `npm run build` to see all TypeScript errors
- Check type definitions in `src/core/types/`

### Runtime Errors

**"OPENAI_API_KEY is required"**
- Create `.env` file in project root
- Add `OPENAI_API_KEY=your-key-here`
- Restart server

**Port Already in Use**
- Change `PORT` in `.env`
- Or kill process using port: `lsof -ti:3001 | xargs kill`

**File Watcher Not Working**
- Check `KB_ENABLE_FILE_WATCHER=true` in `.env`
- Verify file permissions
- Check logs for errors

### Performance Issues

**Slow Knowledge Base Indexing**
- Reduce `KB_CHUNK_SIZE` for faster processing
- Process files in smaller batches
- Check OpenAI API rate limits

**High Memory Usage**
- Use `npm run start:memory` for 8GB limit
- Reduce knowledge base size
- Optimize chunking strategy

## Contributing

### Before You Start

1. **Read the Code** - Understand existing patterns
2. **Check Issues** - Look for existing issues/PRs
3. **Ask Questions** - Don't hesitate to ask for clarification

### Development Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**
   - Follow code style guidelines
   - Add comments for complex logic
   - Update documentation if needed

3. **Test Your Changes**
   - Test manually
   - Verify build succeeds
   - Check logs for errors

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Format

Use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### Code Review Checklist

- [ ] Code follows project style
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] No console.log statements (use logger)
- [ ] Error handling implemented
- [ ] Logging added for important operations

## Additional Resources

- [Main README](../README.md) - Project overview and quick start
- [Architecture Documentation](./ARCHITECTURE.md) - Detailed architecture
- [SDK Documentation](./sdk/) - SDK function reference
- [OpenAI API Docs](https://platform.openai.com/docs) - OpenAI API reference
- [Express.js Docs](https://expressjs.com/) - Express framework reference
- [TypeScript Docs](https://www.typescriptlang.org/docs/) - TypeScript reference

## Getting Help

If you encounter issues:

1. **Check Logs** - Server logs often contain helpful error messages
2. **Review Documentation** - Check this guide and other docs
3. **Search Issues** - Look for similar issues in the repository
4. **Ask Questions** - Create an issue with detailed information

## Next Steps

Now that you understand the project:

1. **Explore the Code** - Read through key files to understand implementation
2. **Run the Server** - Start development and test endpoints
3. **Make a Small Change** - Try adding a feature or fixing a bug
4. **Read SDK Docs** - Understand what functions are available
5. **Contribute** - Submit improvements and new features

Happy coding! 🚀

