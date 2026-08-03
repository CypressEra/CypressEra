# MCP Client - Complete Documentation

Complete guide to the Model Context Protocol (MCP) client for AI-powered chat interactions with automatic SDK function execution.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [Basic Usage](#basic-usage)
- [React Hook: useMCP](#react-hook-usemcp)
- [MCPClient Class](#mcpclient-class)
- [Function Execution](#function-execution)
- [Context Management](#context-management)
- [Error Handling](#error-handling)
- [Complete Examples](#complete-examples)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

The MCP (Model Context Protocol) client enables AI-powered chat interactions that can automatically execute SDK functions based on user requests. It provides:

- **AI Chat Interface** - Natural language interaction with the AI assistant
- **Automatic Function Calling** - AI can call SDK functions automatically
- **Function Execution** - Executes SDK functions and returns results to AI
- **Context Awareness** - Provides session and user context to AI
- **Knowledge Base Integration** - Optional knowledge base support for enhanced responses

**Location:** `src/mcp-client/`  
**Main Files:**
- `client.ts` - MCPClient class and function execution
- `useMCP.ts` - React hook for easy integration
- `types.ts` - TypeScript type definitions

## Architecture

### Module Structure

```
src/mcp-client/
├── client.ts          # MCPClient class and executeSDKFunction
├── useMCP.ts          # React hook wrapper
└── types.ts           # TypeScript interfaces
```

### Data Flow

```
User Message
    ↓
useMCP.sendMessage()
    ↓
MCPClient.chat()
    ↓
Agent Server (AI)
    ↓
Response with Function Calls (if needed)
    ↓
executeSDKFunction() → PowerFlowApp
    ↓
SDK Function Execution
    ↓
Function Results
    ↓
MCPClient.continueChat()
    ↓
Agent Server (AI processes results)
    ↓
Final AI Response
    ↓
React Component (via useMCP hook)
```

### Component Interaction

```
┌─────────────────────────────────────────────────────────┐
│              React Component (AIAssistant)              │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │              useMCP Hook                          │ │
│  │  - Manages messages state                        │ │
│  │  - Handles function calling loop                 │ │
│  │  - Provides loading/error states                 │ │
│  └──────────────────────────────────────────────────┘ │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │              MCPClient                           │ │
│  │  - chat() - Send message to AI                   │ │
│  │  - continueChat() - Continue after functions     │ │
│  │  - healthCheck() - Check server health           │ │
│  │  - registerUser() - Register with knowledge base│ │
│  └──────────────────────────────────────────────────┘ │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │         executeSDKFunction()                     │ │
│  │  - Parses function call                          │ │
│  │  - Executes on PowerFlowApp                      │ │
│  │  - Returns sanitized results                     │ │
│  └──────────────────────────────────────────────────┘ │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │              PowerFlowApp (SDK)                  │ │
│  │  - calculate(), addElement(), etc.               │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Installation & Setup

The MCP client is already included in the project. No additional installation needed.

### Configuration

The MCP base URL is typically configured via environment variables and injected at runtime:

```typescript
// In server.js (EJS template)
window.MCP_BASE_URL = '<%= MCP_BASE_URL %>';

// In your component
const mcpBaseURL = window.MCP_BASE_URL || 'http://localhost:3001';
```

### Import Paths

```typescript
// React hook (recommended for components)
import { useMCP } from '@/mcp-client/useMCP';

// MCPClient class (for advanced usage)
import { MCPClient } from '@/mcp-client/client';

// Types
import { ChatMessage, ChatRequest, ChatResponse } from '@/mcp-client/types';
```

## Basic Usage

### Using the React Hook (Recommended)

The `useMCP` hook is the easiest way to integrate MCP chat functionality:

```typescript
import { useMCP } from '@/mcp-client/useMCP';

function MyComponent() {
  const {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    healthCheck
  } = useMCP({
    mcpBaseURL: 'http://localhost:3001'
  });
  
  const handleSend = async () => {
    await sendMessage('Run a DC power flow calculation');
  };
  
  return (
    <div>
      {messages.map((msg, idx) => (
        <div key={idx}>{msg.content}</div>
      ))}
      <button onClick={handleSend} disabled={loading}>
        Send
      </button>
    </div>
  );
}
```

### Using MCPClient Directly

For non-React usage or advanced scenarios:

```typescript
import { MCPClient } from '@/mcp-client/client';

const client = new MCPClient({
  baseURL: 'http://localhost:3001',
  timeout: 30000
});

// Send a chat message
const response = await client.chat({
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  context: {
    userId: 'user123',
    currentSession: 'session456'
  }
});

console.log('AI Response:', response.message);
```

## React Hook: useMCP

The `useMCP` hook provides a complete chat interface with automatic function execution.

### Hook Options

```typescript
interface UseMCPOptions {
  mcpBaseURL: string;              // MCP server URL (required)
  autoExecuteFunctions?: boolean;   // Auto-execute functions (default: true)
}
```

### Hook Return Value

```typescript
{
  // State
  messages: ChatMessage[];          // Conversation messages
  loading: boolean;                 // Request in progress
  error: string | null;             // Error message
  
  // Actions
  sendMessage: (message: string, context?: Context) => Promise<ChatResponse>;
  clearMessages: () => void;        // Clear conversation
  healthCheck: () => Promise<any>; // Check server health
  clearError: () => void;          // Clear error state
}
```

### Complete Example: AI Assistant Component

```typescript
import React, { useState } from 'react';
import { useMCP } from '@/mcp-client/useMCP';
import { PowerFlowApp } from '@/sdk';

function AIAssistant() {
  const [input, setInput] = useState('');
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  
  const {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages
  } = useMCP({
    mcpBaseURL: window.MCP_BASE_URL || 'http://localhost:3001'
  });
  
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userInput = input.trim();
    setInput('');
    
    // Get context from SDK
    const config = PowerFlowApp.getConfig();
    const userId = config?.userId;
    const context = {
      currentSession: PowerFlowApp.getSession() || undefined,
      userId,
      availableFiles: [], // Populate from your file list
      useKnowledgeBase
    };
    
    try {
      await sendMessage(userInput, context);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };
  
  return (
    <div>
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong> {msg.content}
            {msg.function_call && (
              <div className="function-call">
                Calling: {msg.function_call.name}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {error && <div className="error">{error}</div>}
      
      <div className="input-area">
        <label>
          <input
            type="checkbox"
            checked={useKnowledgeBase}
            onChange={(e) => setUseKnowledgeBase(e.target.checked)}
          />
          Use Knowledge Base
        </label>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask me anything about power flow analysis..."
        />
        
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
        
        <button onClick={clearMessages}>Clear</button>
      </div>
    </div>
  );
}
```

### Function Calling Flow

The hook automatically handles the complete function calling flow:

1. **User sends message** → `sendMessage()` called
2. **Message sent to MCP** → `client.chat()` called
3. **AI responds** → May include function calls
4. **Functions executed** → `executeSDKFunction()` called for each function
5. **Results sent back** → `client.continueChat()` called with results
6. **AI processes results** → Final response returned
7. **Loop continues** → If more function calls needed (max 10 iterations)

**Example Flow:**
```
User: "Run a DC power flow calculation"
  ↓
AI: "I'll run a DC calculation for you" [function_call: calculate]
  ↓
SDK: calculate('dc') executed
  ↓
Result: { converged: true, solution_time_ms: 45 }
  ↓
AI: "The DC power flow calculation completed successfully. 
     It converged in 45ms. The system is stable."
```

### Message Format

Messages follow the chat message format:

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;  // JSON string
  };
}
```

**Example Messages:**
```typescript
// User message
{
  role: 'user',
  content: 'Run a DC calculation'
}

// Assistant message with function call
{
  role: 'assistant',
  content: 'I will run a DC power flow calculation.',
  function_call: {
    name: 'calculate',
    arguments: '{"method":"dc"}'
  }
}

// Assistant message (final response)
{
  role: 'assistant',
  content: 'The calculation completed successfully. The system converged.'
}
```

## MCPClient Class

The `MCPClient` class provides low-level API access to the MCP server.

### Constructor

```typescript
const client = new MCPClient({
  baseURL: string;      // MCP server URL (required)
  timeout?: number;    // Request timeout in ms (default: 30000)
});
```

### Methods

#### `chat(request: ChatRequest): Promise<ChatResponse>`

Send a chat message to the MCP server.

**Parameters:**
```typescript
interface ChatRequest {
  messages: ChatMessage[];
  context?: {
    currentSession?: string;
    userId?: string;
    availableFiles?: string[];
    useKnowledgeBase?: boolean;
  };
}
```

**Returns:**
```typescript
interface ChatResponse {
  success: boolean;
  message?: string;
  functionCalls?: FunctionCall[];
  requiresFunctionExecution?: boolean;
  error?: string;
}
```

**Example:**
```typescript
const response = await client.chat({
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  context: {
    userId: 'user123',
    currentSession: 'session456',
    useKnowledgeBase: true
  }
});

if (response.success) {
  console.log('AI Response:', response.message);
  
  if (response.requiresFunctionExecution && response.functionCalls) {
    console.log('Function calls needed:', response.functionCalls);
  }
}
```

#### `continueChat(request: FunctionResultRequest): Promise<ChatResponse>`

Continue chat after function execution.

**Parameters:**
```typescript
interface FunctionResultRequest {
  messages: ChatMessage[];
  functionResults: FunctionResult[];
  context?: ChatRequest['context'];
}

interface FunctionResult {
  call_id: string;
  result: any;
  error?: string;
}
```

**Example:**
```typescript
// After executing functions
const functionResults: FunctionResult[] = [
  {
    call_id: 'call123',
    result: { converged: true, solution_time_ms: 45 }
  }
];

const response = await client.continueChat({
  messages: currentMessages,
  functionResults,
  context: requestContext
});

console.log('AI Response:', response.message);
```

#### `healthCheck(): Promise<any>`

Check MCP server health.

**Example:**
```typescript
try {
  const health = await client.healthCheck();
  console.log('Agent Server is healthy:', health);
} catch (error) {
  console.error('Agent Server is down:', error);
}
```

#### `registerUser(userId: string): Promise<{success: boolean, message: string}>`

Register a user with the knowledge base. Ensures file watcher is active for the user's directory.

**Example:**
```typescript
try {
  const result = await client.registerUser('user123');
  console.log('User registered:', result.message);
} catch (error) {
  console.error('Registration failed:', error);
}
```

**When to use:**
- When component mounts
- When user logs in
- Before using knowledge base features

## Function Execution

### Automatic Function Execution

The `useMCP` hook automatically executes SDK functions when the AI requests them. The `executeSDKFunction` utility handles the execution.

### Supported SDK Functions

The following SDK functions can be called automatically:

- `calculate(method, options)` / `solve(method, options)`
- `addElement(elementType, data, options)`
- `modifyElement(elementType, identifier, data, options)`
- `deleteElement(elementType, identifier, options)`
- `createSessionFromFile(fileName, userId)`
- `getNetwork(sessionId)`
- `getSessionInfo(sessionId)`
- `uploadUserFile(file, fileType)`
- And other SDK methods

### Function Call Format

Functions are called with this format:

```typescript
interface FunctionCall {
  id: string;
  call_id: string;
  name: string;           // SDK function name
  arguments: string;      // JSON string of arguments
}
```

**Example Function Calls:**
```json
{
  "name": "calculate",
  "arguments": "{\"method\":\"dc\",\"options\":{}}"
}

{
  "name": "addElement",
  "arguments": "{\"elementType\":\"bus\",\"data\":{\"ibus\":99999,\"name\":\"NEW_BUS\",\"baskv\":230.0}}"
}

{
  "name": "modifyElement",
  "arguments": "{\"elementType\":\"bus\",\"identifier\":{\"ibus\":101},\"data\":{\"vm\":1.05}}"
}
```

### Manual Function Execution

You can also execute SDK functions manually:

```typescript
import { executeSDKFunction } from '@/mcp-client/client';
import { PowerFlowApp } from '@/sdk';

const functionCall = {
  name: 'calculate',
  arguments: JSON.stringify({ method: 'dc' })
};

try {
  const result = await executeSDKFunction(PowerFlowApp, functionCall);
  console.log('Function result:', result);
} catch (error) {
  console.error('Function execution failed:', error);
}
```

### Result Sanitization

Function results are automatically sanitized before being sent back to the AI:

- **Large strings** (>1000 chars) are excluded
- **Large arrays** (>50 items) are excluded
- **Large objects** (>8000 chars JSON) are excluded

This prevents overwhelming the AI with too much data while preserving important information.

**Example:**
```typescript
// Original result
{
  results: {
    converged: true,
    bus_results: [/* 1000+ bus results */],  // Excluded (too large)
    solution_time_ms: 45
  }
}

// Sanitized result sent to AI
{
  results: {
    converged: true,
    solution_time_ms: 45
    // bus_results excluded
  }
}
```

## Context Management

### Context Fields

The context object provides information to the AI about the current state:

```typescript
interface Context {
  currentSession?: string;    // Current session ID
  userId?: string;           // User identifier
  availableFiles?: string[]; // List of available files
  useKnowledgeBase?: boolean; // Enable knowledge base
}
```

### Automatic Context

The `useMCP` hook automatically populates context from the SDK:

```typescript
// Context is automatically merged from:
const config = PowerFlowApp.getConfig();
const userId = config?.userId;
const currentSession = PowerFlowApp.getSession();

// You can override or add to it:
await sendMessage('Hello', {
  currentSession: 'custom-session',
  availableFiles: ['case9.rawx', 'case14.rawx'],
  useKnowledgeBase: true
});
```

### Context Best Practices

1. **Always provide currentSession** - Helps AI understand what file is open
2. **Include userId** - Required for file operations
3. **List availableFiles** - Helps AI suggest files
4. **Enable useKnowledgeBase** - For enhanced responses with knowledge base

**Example:**
```typescript
const context = {
  currentSession: PowerFlowApp.getSession(),
  userId: PowerFlowApp.getConfig()?.userId,
  availableFiles: userFiles.map(f => f.name),
  useKnowledgeBase: true
};

await sendMessage('What files do I have?', context);
```

## Error Handling

### Error Types

Errors can occur at different stages:

1. **Network Errors** - MCP server unreachable
2. **API Errors** - Invalid request/response
3. **Function Execution Errors** - SDK function fails
4. **Timeout Errors** - Request takes too long

### Error Handling in useMCP Hook

The hook automatically handles errors:

```typescript
const { error, loading } = useMCP({ mcpBaseURL: '...' });

// Error state is automatically set on failure
if (error) {
  console.error('MCP Error:', error);
  // Display error to user
}
```

### Manual Error Handling

```typescript
try {
  await sendMessage('Run calculation');
} catch (err: any) {
  if (err.message.includes('timeout')) {
    console.error('Request timed out');
  } else if (err.message.includes('network')) {
    console.error('Network error');
  } else {
    console.error('Unknown error:', err);
  }
}
```

### Function Execution Errors

When a function execution fails, the error is sent back to the AI:

```typescript
// Function execution fails
const result = {
  status: 'error',
  message: 'No session ID. Create a session first.',
  error: 'NO_SESSION'
};

// AI receives error and can explain it to user
// AI Response: "I need you to open a file first before I can run calculations."
```

## Complete Examples

### Example 1: Simple Chat Component

```typescript
import React, { useState } from 'react';
import { useMCP } from '@/mcp-client/useMCP';

function SimpleChat() {
  const [input, setInput] = useState('');
  const { messages, loading, sendMessage } = useMCP({
    mcpBaseURL: 'http://localhost:3001'
  });
  
  const handleSend = async () => {
    if (!input.trim()) return;
    await sendMessage(input);
    setInput('');
  };
  
  return (
    <div>
      <div className="chat">
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
      />
      <button onClick={handleSend} disabled={loading}>
        Send
      </button>
    </div>
  );
}
```

### Example 2: AI Assistant with Context

```typescript
import React, { useState, useEffect } from 'react';
import { useMCP } from '@/mcp-client/useMCP';
import { MCPClient } from '@/mcp-client/client';
import { PowerFlowApp } from '@/sdk';

function AIAssistantWithContext() {
  const [input, setInput] = useState('');
  const [useKB, setUseKB] = useState(true);
  const [files, setFiles] = useState<string[]>([]);
  
  const { messages, loading, sendMessage } = useMCP({
    mcpBaseURL: window.MCP_BASE_URL || 'http://localhost:3001'
  });
  
  // Register user on mount
  useEffect(() => {
    const register = async () => {
      const client = new MCPClient({
        baseURL: window.MCP_BASE_URL || 'http://localhost:3001'
      });
      const config = PowerFlowApp.getConfig();
      const userId = config?.userId || 'demo_user';
      await client.registerUser(userId);
    };
    register();
  }, []);
  
  // Load files
  useEffect(() => {
    const loadFiles = async () => {
      try {
        const response = await PowerFlowApp.getUserFiles('models');
        setFiles(response.files || []);
      } catch (error) {
        console.error('Failed to load files:', error);
      }
    };
    loadFiles();
  }, []);
  
  const handleSend = async () => {
    if (!input.trim()) return;
    
    const config = PowerFlowApp.getConfig();
    const context = {
      currentSession: PowerFlowApp.getSession(),
      userId: config?.userId,
      availableFiles: files,
      useKnowledgeBase: useKB
    };
    
    await sendMessage(input, context);
    setInput('');
  };
  
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={useKB}
          onChange={(e) => setUseKB(e.target.checked)}
        />
        Use Knowledge Base
      </label>
      
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`msg ${msg.role}`}>
            {msg.content}
            {msg.function_call && (
              <div className="tool-call">
                🔧 {msg.function_call.name}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about power flow analysis..."
      />
      <button onClick={handleSend} disabled={loading || !input.trim()}>
        {loading ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}
```

### Example 3: Direct MCPClient Usage

```typescript
import { MCPClient } from '@/mcp-client/client';
import { PowerFlowApp } from '@/sdk';

async function directMCPUsage() {
  const client = new MCPClient({
    baseURL: 'http://localhost:3001',
    timeout: 30000
  });
  
  // Check health
  const health = await client.healthCheck();
  console.log('Server health:', health);
  
  // Register user
  await client.registerUser('user123');
  
  // Send chat
  const response = await client.chat({
    messages: [
      { role: 'user', content: 'Run a DC calculation' }
    ],
    context: {
      userId: 'user123',
      currentSession: PowerFlowApp.getSession(),
      useKnowledgeBase: true
    }
  });
  
  if (response.requiresFunctionExecution && response.functionCalls) {
    // Execute functions manually
    for (const funcCall of response.functionCalls) {
      const result = await executeSDKFunction(PowerFlowApp, funcCall);
      console.log('Function result:', result);
    }
    
    // Continue chat
    const continueResponse = await client.continueChat({
      messages: response.messages || [],
      functionResults: [/* results */],
      context: { userId: 'user123' }
    });
    
    console.log('Final response:', continueResponse.message);
  }
}
```

## API Reference

### useMCP Hook

```typescript
function useMCP(options: UseMCPOptions): {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (message: string, context?: Context) => Promise<ChatResponse>;
  clearMessages: () => void;
  healthCheck: () => Promise<any>;
  clearError: () => void;
}
```

### MCPClient Class

```typescript
class MCPClient {
  constructor(config: MCPClientConfig);
  
  chat(request: ChatRequest): Promise<ChatResponse>;
  continueChat(request: FunctionResultRequest): Promise<ChatResponse>;
  healthCheck(): Promise<any>;
  registerUser(userId: string): Promise<{success: boolean, message: string}>;
}
```

### Types

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface ChatRequest {
  messages: ChatMessage[];
  context?: {
    currentSession?: string;
    userId?: string;
    availableFiles?: string[];
    useKnowledgeBase?: boolean;
  };
}

interface ChatResponse {
  success: boolean;
  message?: string;
  functionCalls?: FunctionCall[];
  requiresFunctionExecution?: boolean;
  error?: string;
}

interface FunctionCall {
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

interface FunctionResult {
  call_id: string;
  result: any;
  error?: string;
}
```

## Troubleshooting

### Agent Server Not Responding

```typescript
// Check server health
const { healthCheck } = useMCP({ mcpBaseURL: '...' });

try {
  const health = await healthCheck();
  console.log('Server is up:', health);
} catch (error) {
  console.error('Server is down:', error);
  // Show error to user, suggest checking server
}
```

### Function Execution Fails

```typescript
// Check if SDK is initialized
if (!PowerFlowApp.isConnected()) {
  await PowerFlowApp.initialize({ userId: 'user123' });
}

// Check if session exists (for calculations)
const sessionId = PowerFlowApp.getSession();
if (!sessionId) {
  // Open a file first
  await PowerFlowApp.createSessionFromFile('case9.rawx');
}
```

### Timeout Errors

```typescript
// Increase timeout
const client = new MCPClient({
  baseURL: 'http://localhost:3001',
  timeout: 60000  // 60 seconds
});
```

### Function Results Too Large

The hook automatically sanitizes large results. If you need to customize this:

```typescript
// Modify sanitization thresholds in useMCP.ts
const MAX_STRING_LENGTH_FOR_AI = 2000;  // Increase limit
const MAX_ARRAY_ITEMS_FOR_AI = 100;     // Increase limit
```

### Infinite Function Calling Loop

The hook has a built-in limit (10 iterations). If you hit this:

```typescript
// Check logs for "Reached maximum iterations"
// This usually means:
// 1. Function keeps failing
// 2. AI keeps requesting the same function
// 3. Check function execution errors
```

## Best Practices

1. **Always provide context** - Include session, userId, and availableFiles
2. **Register user on mount** - Call `registerUser()` when component mounts
3. **Handle errors gracefully** - Show user-friendly error messages
4. **Use knowledge base** - Enable `useKnowledgeBase` for better responses
5. **Monitor function calls** - Log function executions for debugging
6. **Clear messages when needed** - Use `clearMessages()` to reset conversation
7. **Check server health** - Verify MCP server is running before use

## See Also

- [SDK.md](./SDK.md) - SDK documentation (functions that can be called)
- [SETUP.md](./SETUP.md) - Environment configuration
- MCP Client source: `src/mcp-client/`
- AI Assistant component: `src/components/features/AIAssistant/`

