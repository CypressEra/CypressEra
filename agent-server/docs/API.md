# Agent Server API Reference

## Chat Streaming Endpoint

### POST `/api/v1/chat/stream`

Send a chat message. The server streams SSE events and executes all tools internally — the frontend never needs to call back with tool results.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Run a power flow analysis on Bench_Case.rawx" }
  ],
  "context": {
    "currentSession": "session-uuid",
    "userId": "user-uuid",
    "availableFiles": ["Bench_Case.rawx"],
    "useKnowledgeBase": false
  }
}
```

**SSE Event Stream:**

| Event type | Shape | Description |
|------------|-------|-------------|
| `start` | `{ type: "start" }` | Connection confirmed |
| `function_call` | `{ type, call_id, name, arguments }` | Model is calling a tool |
| `tool_execution` | `{ type, tools: [{name, call_id}], round }` | Tool execution starting |
| `tool_results` | `{ type, results: [{call_id, name, success, error?, result?}] }` | Tool results received |
| `chunk` | `{ type, content, delta }` | Streaming text token |
| `complete` | `{ type, message }` | Final text response |
| `warning` | `{ type, code: "max_rounds_reached", roundsExecuted }` | Round limit hit |
| `error` | `{ type, error }` | Fatal error |
| `done` | `{ type: "done" }` | Stream closed |

**Example stream for "run a power flow analysis":**
```
data: {"type":"start"}
data: {"type":"function_call","call_id":"call_abc","name":"createSessionFromFile","arguments":"{\"fileName\":\"Bench_Case.rawx\"}"}
data: {"type":"tool_execution","tools":[{"name":"createSessionFromFile","call_id":"call_abc"}],"round":1}
data: {"type":"tool_results","results":[{"call_id":"call_abc","name":"createSessionFromFile","success":true,"result":{"session_id":"..."}}]}
data: {"type":"function_call","call_id":"call_def","name":"solveFlow","arguments":"{\"method\":\"fnsl\"}"}
data: {"type":"tool_execution","tools":[{"name":"solveFlow","call_id":"call_def"}],"round":2}
data: {"type":"tool_results","results":[{"call_id":"call_def","name":"solveFlow","success":true,"result":{...}}]}
data: {"type":"chunk","content":"The power flow converged","delta":"The power flow converged"}
data: {"type":"complete","message":"The power flow converged with 0 violations."}
data: {"type":"done"}
```

---

## Health Endpoint

### GET `/health`

```json
{ "status": "ok", "service": "agent-server", "version": "1.0.0", "environment": "development" }
```

---

## Brain Engine

`BrainEngine` implements a dynamic tool loop: the model sees every tool result before deciding its next action. There is no pre-planning step.

### Loop behaviour

1. Call `llmClient.chat(messages)` with all 22 SDK tools available
2. If the model returns tool calls → execute them (reads in parallel, writes sequentially) → append results → go to step 1
3. If the model returns text only → emit `chunk` + `complete` → end
4. If `rounds >= maxRounds` → emit `warning`, request a final summary, end

### Write serialisation

API-server has no per-session file mutex. The engine splits tool calls each round:

- **Reads** (parallel): `getNetwork`, `getPowerFlowData`, `getSessionInfo`, `getUserFiles`, `getElementSchema`
- **Writes** (sequential): `addElement`, `modifyElement`, `deleteElement`, `solveFlow`, `createSessionFromFile`, `saveSessionToUserFile`, `saveSessionAsUserFile`, `uploadUserFile`

### Session ID tracking

When `createSessionFromFile` or `createSession` returns a `session_id`, the engine automatically injects it into the `toolContext` for all subsequent tool calls in the same conversation.

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `ENABLE_BRAIN` | `true` | Enable Brain routing for all requests |
| `BRAIN_MAX_ROUNDS` | `50` | Hard stop to prevent infinite loops |
| `BRAIN_MAX_TOKENS` | `100000` | Approximate token budget guard |

---

## Available Tools

| Tool | Phase | R/W |
|------|-------|-----|
| `solveFlow` | DIAGNOSE / VERIFY | write |
| `getPowerFlowData` | DIAGNOSE / VERIFY | read |
| `getNetwork` | ANALYZE | read |
| `getElementSchema` | ANALYZE | read |
| `addElement` | FIX | write |
| `modifyElement` | FIX | write |
| `deleteElement` | FIX | write |
| `getSessionInfo` | MANAGE | read |
| `getUserFiles` | MANAGE | read |
| `createSessionFromFile` | MANAGE | write |
| `saveSessionToUserFile` | MANAGE | write |
| `saveSessionAsUserFile` | MANAGE | write |
| `uploadUserFile` | MANAGE | write |

See [docs/sdk/](sdk/) for full parameter reference for each tool.
