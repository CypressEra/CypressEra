# How MCP Returned Data Updates React UI Components

There are **two main paths**: (1) **chat / message UI** and (2) **side-effect data** (network, session, power flow) that other components (e.g. NetworkDataTable) show.

---

## 1. Chat / message UI (AIAssistant)

**Path: MCP response → useMCP state → AIAssistant**

```
Agent Server (chat / continueChat)
    ↓ returns { success, message?, functionCalls?, requiresFunctionExecution? }
MCPClient.chat() or MCPClient.continueChat()
    ↓
useMCP.sendMessage() / loop
    ↓
setMessages(currentMessages)   ← state in useMCP
    ↓
messages (aka mcpMessages)      ← from useMCP: { messages, sendMessage, loading, error }
    ↓
AIAssistant uses: messages: mcpMessages
    ↓
useMemo([mcpMessages, t])      ← converts ChatMessage[] → Message[] (welcome + conversation)
    ↓
messages.map(message => …)     ← rendered in .messages-container
```

**When does `messages` change?**

- **User sends message**: `sendMessage(userText)` appends a user `ChatMessage`, then calls `client.chat(request)`.
- **AI returns text**: `response.message` is appended as assistant `ChatMessage`; `setMessages(currentMessages)` runs.
- **AI returns tool calls**: An assistant message with `function_call` is appended; `setMessages(currentMessages)` runs; after execution, `client.continueChat(...)` is called.
- **After continueChat**: If `response.message` exists, it’s appended as assistant `ChatMessage` and `setMessages(currentMessages)` runs again.

So all **chat content** (user, assistant, tool-call placeholders) lives in `useMCP`’s `messages` state. **AIAssistant** reads `mcpMessages` from `useMCP`, turns it into its own `Message[]`, and renders that. Every `setMessages(...)` in useMCP triggers a re-render and updates the chat UI.

---

## 2. Side-effect data (network, session, power flow) → NetworkDataTable etc.

**Path: MCP function calls → PowerFlowApp (SDK) → events → usePowerFlowSDK state → App → child components**

```
User message in AI Assistant
    ↓
MCP returns functionCalls (e.g. getNetwork, createSessionFromFile, modifyElement, solveFlow, getPowerFlowData)
    ↓
useMCP loop: executeSDKFunction(PowerFlowApp, functionCall)
    ↓
PowerFlowApp.getNetwork() / createSessionFromFile() / modifyElement() / solveFlow() / getPowerFlowData()
    ↓
SDK (Xolution, EditService, SessionService, etc.) calls backend API, updates its cache, emits events
    ↓
PowerFlowApp.emit(SDK_EVENTS.NETWORK_UPDATED | SESSION_CREATED | SESSION_CHANGED | EDIT_COMPLETE | SOLVE_FLOW_COMPLETE | …)
    ↓
usePowerFlowSDK subscribes: PowerFlowApp.on(SDK_EVENTS.…, handler)
    ↓
handler calls setState({ networkData, powerFlowData, sessionId, … })
    ↓
usePowerFlowSDK returns { networkData, powerFlowData, sessionId, … }
    ↓
App.tsx uses usePowerFlowSDK() and passes networkData, powerFlowData, etc. as props (e.g. to layout / GridLayout)
    ↓
Components that receive networkData/powerFlowData (e.g. NetworkDataTable) re-render with new data
```

**Important detail for “network table not updating after MCP edit”**

- **EDIT_COMPLETE**: `usePowerFlowSDK`’s `handleEditComplete` calls `PowerFlowApp.getNetwork()` and then `setState({ networkData: freshNetwork, … })`. So after MCP-driven `modifyElement` / `addElement` / `deleteElement`, the UI gets new network data from the backend and the table updates.
- **NETWORK_UPDATED**: Fired when the SDK’s network cache changes (e.g. after `getNetwork()` in Xolution). `handleNetworkUpdated` updates state from `PowerFlowApp.getCachedNetwork()`, so any path that updates the cache and emits this event will refresh the UI.
- **SESSION_CREATED / SESSION_CHANGED**: Drive `sessionId` and related state so the rest of the app (and subsequent MCP tool calls) use the right session.

So **MCP “returned data”** for network/session/power flow doesn’t go back through the MCP HTTP response into React. It goes through **executeSDKFunction → PowerFlowApp → SDK events → usePowerFlowSDK state → props**. The MCP response is only used inside useMCP to decide what to run and when to append chat messages; the actual network/session/power-flow updates are done by the SDK and its listeners.

---

## 3. Where it lives in the repo

| What updates | Where it’s updated | Where it’s consumed in UI |
|-------------|--------------------|---------------------------|
| Chat messages | `useMCP`: `setMessages(...)` | AIAssistant: `messages` from `useMCP`, then `mcpMessages` → `Message[]` → `.messages-container` |
| Network / session / power flow | `usePowerFlowSDK`: `setState({ networkData, powerFlowData, sessionId, … })` in event handlers | App → layout → e.g. NetworkDataTable via `networkData`, `powerFlowData` props |

So: **MCP “returned data” that is chat** updates the React UI through **useMCP `messages` and AIAssistant**. **MCP “returned data” that is network/session/power flow** updates the React UI through **PowerFlowApp → SDK events → usePowerFlowSDK state → props to components like NetworkDataTable**.

---

## 4. Reducing repeated function calls (tool result standardization)

To make the model stop chaining and avoid calling the same function repeatedly:

**Standardized tool result shape** (sent to the model in tool message content): `status` ("success" | "error"), `message` (short summary), `next_action` ("reply" | "optional"). When `next_action` is "reply", the model MUST respond with text only and must not call another function.

**Terminal functions** (getUserFiles, createSessionFromFile, getSessionInfo, getNetwork, solveFlow, getPowerFlowData, addElement, modifyElement, deleteElement, uploadUserFile, saveSessionToUserFile, saveSessionAsUserFile) get `next_action: "reply"` on success. After any error, the result also gets `next_action: "reply"`.

**Client (useMCP):** Builds each function result with status, message, and next_action. Sends `context.forceTextResponse: true` when iteration count ≥ 5 or when all results in this round are success with `next_action: "reply"`, so the backend uses `tool_choice: 'none'`.

**Server (system prompt):** Instructs the model to obey next_action "reply", not call the same function with the same arguments twice in one turn, and not repeatedly call getUserFiles or createSessionFromFile.

**API return (continueChat):** The MCP server response includes `forceTextApplied?: boolean`. When true, the server used `tool_choice: 'none'` for that turn, so the model was forced to respond with text only.

**API server (cloud power flow backend):** All JSON responses are standardized so the SDK (and thus MCP tool results) get a clear shape: success responses include `status: "success"` and a `message` where applicable; error responses include `status: "error"`, `error`, and `message`. This makes it straightforward to build tool results (status, message, next_action) from the API return without guessing.
