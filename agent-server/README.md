# Agent Server

AI orchestration server for XFlow. Accepts chat messages from the frontend, runs a dynamic tool loop (BrainEngine), and streams results back via SSE. All tool execution happens server-side — the frontend never needs to call back with results.

## Architecture

```
Frontend (chat)
    ↓  POST /api/v1/chat/stream
Agent Server
  ├── BrainEngine (dynamic tool loop)
  │     ├── reads: parallel (getNetwork, getPowerFlowData, …)
  │     └── writes: sequential (solveFlow, modifyElement, …)
  └── KnowledgeBase (RAG, optional)
    ↓
Go API Server → Rust Solver
    ↓
SSE events → Frontend
```

### Directory structure

```
src/
  core/              # Infrastructure (config, DI, middleware, types, utils)
  features/
    chat/            # ChatController, routes, prompts, SSE
    knowledge-base/  # Embedding, indexing, retrieval (RAG)
  modules/
    brain/           # BrainEngine plugin — the main execution path
      engine/        # BrainEngine.ts, toolClassifier.ts
      prompts/       # coordinator.ts, powerflow.ts
      plugin.ts      # Registers BrainEngine in the DI container
  mcp/               # OpenAIClient, sdkFunctions (tool definitions)
  app.ts             # Bootstrap — registers all plugins
  server.ts          # Express server
  index.ts           # Entry point
```

## Quick Start

```bash
cd agent-server
npm install
cp env.example .env   # add your API key
npm run dev
curl http://localhost:3001/health
```

## Environment Variables

### Model

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | API key (OpenAI, OpenRouter, Tencent Coding, etc.) |
| `OPENAI_MODEL` | | `gpt-4o` | Model name |
| `OPENAI_BASE_URL` | | — | Override base URL for non-OpenAI providers |

### Brain

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_BRAIN` | `true` | Route all requests through BrainEngine |
| `BRAIN_MAX_ROUNDS` | `50` | Max tool-call rounds before forced stop |
| `BRAIN_MAX_TOKENS` | `100000` | Approximate token budget guard |

### Knowledge Base (RAG)

| Variable | Default | Description |
|----------|---------|-------------|
| `KB_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `KB_EMBEDDING_API_KEY` | — | Separate key for embeddings (falls back to `OPENAI_API_KEY`) |
| `KB_EMBEDDING_BASE_URL` | `https://api.openai.com/v1` | Base URL for embedding API |
| `KB_BASE_PATH` | `../user-data/knowledge` | Knowledge base storage path |
| `KB_CHUNK_SIZE` | `800` | Tokens per chunk (100–2000) |
| `KB_CHUNK_OVERLAP` | `150` | Overlap between chunks |
| `KB_TOP_K` | `3` | Chunks to retrieve per query |
| `KB_ENABLE_FILE_WATCHER` | `true` | Auto-index on file change |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `APP_ENV` | `development` | `development` / `production` |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Log verbosity |
| `LOG_FORMAT` | `json` (prod) / `simple` (dev) | Log format |
| `AUTH_JWT_SECRET` | — | Must match api-server |
| `SERVICE_AUTH_ENABLED` | `true` | Enable service-to-service auth |
| `SERVICE_AUTH_SECRET` | — | Shared secret with api-server |
| `API_SERVER_URL` | `http://localhost:8080` | Go API server URL |

## Brain Module

BrainEngine runs a dynamic tool loop — no pre-planning, the model sees every result before its next action.

**Execution phases (defined in coordinator prompt):**

| Phase | Tools | Rule |
|-------|-------|------|
| DIAGNOSE | `solveFlow`, `getPowerFlowData` | Always first — establish baseline |
| ANALYZE | `getNetwork`, `getElementSchema` | When topology details are needed |
| FIX | `addElement`, `modifyElement`, `deleteElement` | Only after DIAGNOSE confirms a problem |
| VERIFY | `solveFlow`, `getPowerFlowData` | Always after any FIX |
| MANAGE | session/file tools | Session and file lifecycle |

**Write serialisation:** `modifyElement`, `addElement`, `deleteElement`, `solveFlow`, and session/file mutation tools are run sequentially within each round. Read-only tools run in parallel.

## Knowledge Base (RAG)

Place documents in `user-data/knowledge/{userId}/`. Supported: `.pdf`, `.docx`, `.txt`. Files are indexed automatically on add/change.

Enable in chat requests with `"useKnowledgeBase": true` in `context`.

Storage: JSON files at `user-data/knowledge/{userId}/.index/` — no external database required.

## API

See [docs/API.md](docs/API.md) for the full SSE event reference and tool list.

See [docs/sdk/](docs/sdk/) for per-tool parameter documentation.

## Development

```bash
npm run dev      # tsx watch
npm run build    # tsc + tsc-alias
npm test         # jest
```
