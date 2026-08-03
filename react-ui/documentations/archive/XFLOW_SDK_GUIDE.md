# XFlow SDK Guide

Complete guide to using the XFlow Power Flow Analysis SDK.

## Overview

The XFlow SDK (`xflow.js`) provides a clean, centralized API for all power flow operations. Instead of making raw API calls throughout your app, you use a single `PowerFlowApp` object.

## Quick Example

```javascript
import { PowerFlowApp } from '@/services/xflow';

// 1. Initialize (in App.tsx)
await PowerFlowApp.initialize({ userId: 'demo_user' });

// 2. Upload a file
const sessionId = await PowerFlowApp.upload(file);

// 3. Solve
const results = await PowerFlowApp.solve('dc');

// Done! Results contain the analysis data
console.log(results.converged); // true/false
console.log(results.bus_results); // bus data
```

## Setup

### 1. Initialize in Your App

```jsx
// src/App.tsx
import React, { useEffect, useState } from 'react';
import { PowerFlowApp } from '@/services/xflow';

function App() {
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    const initializeSDK = async () => {
      const connected = await PowerFlowApp.initialize({
        userId: 'demo_user'
      });
      setSdkReady(connected);
      
      if (connected) {
        console.log('XFlow SDK ready!');
      } else {
        console.error('Failed to connect to backend');
      }
    };

    initializeSDK();
  }, []);

  if (!sdkReady) {
    return <div>Connecting to backend...</div>;
  }

  return (
    <div className="app">
      {/* Your app components */}
    </div>
  );
}
```

### 2. Use Throughout Your App

```jsx
// Any component
import { PowerFlowApp } from '@/services/xflow';

function MyComponent() {
  const handleAnalysis = async () => {
    const results = await PowerFlowApp.solve('dc');
    // Use results
  };

  return <button onClick={handleAnalysis}>Run Analysis</button>;
}
```

## Complete API Reference

### Initialization

#### `PowerFlowApp.initialize(config)`

Initialize the SDK when your app starts.

```javascript
await PowerFlowApp.initialize({
  userId: 'user123',              // Required: User identifier
  apiBaseURL: 'http://...'        // Optional: Override API URL
});
```

**Returns**: `Promise<boolean>` - `true` if connected successfully

### File Upload

#### `PowerFlowApp.upload(file)`

Upload a power flow data file to the backend.

```javascript
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const sessionId = await PowerFlowApp.upload(file);
console.log('Session ID:', sessionId);
```

**Parameters**:
- `file` (File): File object from input

**Returns**: `Promise<string>` - Session ID

**Notes**:
- Session ID is automatically stored
- Triggers `upload:start` and `upload:complete` events

### Analysis

#### `PowerFlowApp.solve(method, options)`

Run power flow analysis.

```javascript
// Simple usage
const results = await PowerFlowApp.solve('dc');

// With options
const results = await PowerFlowApp.solve('ac', {
  sessionId: 'custom-session-id',  // Optional: override current session
  tolerance: 1e-6,                  // Optional: convergence tolerance
  max_iterations: 100               // Optional: max iterations
});
```

**Parameters**:
- `method` (string): Analysis method
  - `'dc'` - DC power flow (fast, linear)
  - `'ac'` - AC power flow (accurate, nonlinear)
  - `'fast_decoupled'` - Fast decoupled method
- `options` (object): Optional settings

**Returns**: `Promise<PowerFlowResult>` - Analysis results

**Result Structure**:
```javascript
{
  converged: true,              // Did the analysis converge?
  solution_time_ms: 45.2,       // Time taken in milliseconds
  bus_results: [                // Results for each bus
    {
      bus_number: 1,
      voltage_mag: 1.05,
      voltage_angle_deg: 0,
      net_p_injection: 100,
      net_q_injection: 50
    },
    // ... more buses
  ],
  branch_results: [             // Results for each branch
    {
      from_bus: 1,
      to_bus: 2,
      id: "1",
      p_flow: 75.5,
      q_flow: 30.2,
      s_flow: 81.3,
      power_loss: 2.1
    },
    // ... more branches
  ],
  system_summary: {
    total_load_mw: 500,
    total_generation_mw: 510,
    total_losses_mw: 10,
    efficiency_percent: 98.0
  }
}
```

### Results Retrieval

#### `PowerFlowApp.getResults(sessionId)`

Get cached results for a session.

```javascript
// Get results for current session
const results = await PowerFlowApp.getResults();

// Get results for specific session
const results = await PowerFlowApp.getResults('session-id-123');
```

**Returns**: `Promise<PowerFlowResult | null>` - Results or null if not found

### Advanced Methods

#### `PowerFlowApp.uploadAndSolve(file, method)`

Upload and solve in one operation.

```javascript
const results = await PowerFlowApp.uploadAndSolve(file, 'dc');
// Automatically uploads, waits for completion, then solves
```

#### `PowerFlowApp.batchSolve(methods, sessionId)`

Run multiple analysis methods.

```javascript
const results = await PowerFlowApp.batchSolve(['dc', 'ac', 'fast_decoupled']);

// Results:
// {
//   dc: { converged: true, ... },
//   ac: { converged: true, ... },
//   fast_decoupled: { converged: true, ... }
// }
```

### Session Management

#### `PowerFlowApp.getSession()`

Get current session ID.

```javascript
const sessionId = PowerFlowApp.getSession();
console.log('Current session:', sessionId);
```

#### `PowerFlowApp.setSession(sessionId)`

Set session ID manually.

```javascript
PowerFlowApp.setSession('existing-session-id');
```

#### `PowerFlowApp.clearSession()`

Clear current session.

```javascript
PowerFlowApp.clearSession();
```

### Status & Health

#### `PowerFlowApp.isConnected()`

Check if SDK is connected.

```javascript
if (PowerFlowApp.isConnected()) {
  console.log('Ready to use');
}
```

#### `PowerFlowApp.checkHealth()`

Check backend health.

```javascript
const health = await PowerFlowApp.checkHealth();
console.log('Backend status:', health.status);
```

#### `PowerFlowApp.getBaseURL()`

Get current API base URL.

```javascript
const url = PowerFlowApp.getBaseURL();
console.log('API URL:', url);
```

## Event System

The SDK emits events for all major operations.

### Subscribe to Events

```javascript
const unsubscribe = PowerFlowApp.on('event-name', (data) => {
  console.log('Event fired:', data);
});

// Later, unsubscribe
unsubscribe();
```

### Available Events

| Event | When | Data |
|-------|------|------|
| `initialized` | SDK initialized | `{ connected: boolean }` |
| `upload:start` | Upload started | `{ fileName: string }` |
| `upload:complete` | Upload finished | `{ sessionId: string, fileName: string }` |
| `upload:error` | Upload failed | `{ error: Error }` |
| `solve:start` | Analysis started | `{ method: string, sessionId: string }` |
| `solve:complete` | Analysis finished | `{ results: object, method: string }` |
| `solve:error` | Analysis failed | `{ error: Error, method: string }` |
| `session:cleared` | Session cleared | `{}` |
| `session:changed` | Session changed | `{ sessionId: string }` |
| `reset` | SDK reset | `{}` |
| `error` | General error | `{ type: string, error: Error }` |

### Example: Progress Tracking

```jsx
import { useEffect, useState } from 'react';
import { PowerFlowApp } from '@/services/xflow';

function ProgressTracker() {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const unsubscribeUpload = PowerFlowApp.on('upload:start', () => {
      setStatus('Uploading file...');
    });

    const unsubscribeSolve = PowerFlowApp.on('solve:start', () => {
      setStatus('Running analysis...');
    });

    const unsubscribeComplete = PowerFlowApp.on('solve:complete', () => {
      setStatus('Complete!');
    });

    return () => {
      unsubscribeUpload();
      unsubscribeSolve();
      unsubscribeComplete();
    };
  }, []);

  return <div>Status: {status}</div>;
}
```

## React Integration Patterns

### Pattern 1: Custom Hook

```jsx
// hooks/usePowerFlow.ts
import { useState, useCallback } from 'react';
import { PowerFlowApp } from '@/services/xflow';

export const usePowerFlow = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const uploadAndSolve = useCallback(async (file, method = 'dc') => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await PowerFlowApp.uploadAndSolve(file, method);
      setResults(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { uploadAndSolve, loading, error, results };
};

// Usage in component
function MyComponent() {
  const { uploadAndSolve, loading, results } = usePowerFlow();

  const handleFile = (file) => {
    uploadAndSolve(file, 'dc');
  };

  return <div>{loading ? 'Loading...' : JSON.stringify(results)}</div>;
}
```

### Pattern 2: Direct Usage

```jsx
function MyComponent() {
  const [results, setResults] = useState(null);

  const handleAnalysis = async () => {
    try {
      const data = await PowerFlowApp.solve('dc');
      setResults(data);
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  };

  return (
    <button onClick={handleAnalysis}>
      Run Analysis
    </button>
  );
}
```

### Pattern 3: With Event Listeners

```jsx
function LiveUpdates() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const addLog = (message) => {
      setLogs(prev => [...prev, { time: new Date(), message }]);
    };

    const unsubs = [
      PowerFlowApp.on('upload:complete', (d) => 
        addLog(`Upload complete: ${d.sessionId}`)
      ),
      PowerFlowApp.on('solve:complete', (d) => 
        addLog(`Analysis complete: ${d.results.converged ? 'converged' : 'failed'}`)
      ),
    ];

    return () => unsubs.forEach(fn => fn());
  }, []);

  return (
    <div>
      {logs.map((log, i) => (
        <div key={i}>{log.time.toLocaleTimeString()}: {log.message}</div>
      ))}
    </div>
  );
}
```

## Error Handling

Always wrap SDK calls in try-catch:

```javascript
try {
  const results = await PowerFlowApp.solve('dc');
  // Handle success
} catch (error) {
  // Handle error
  console.error('Operation failed:', error.message);
  
  // Show user-friendly message
  alert(`Analysis failed: ${error.message}`);
}
```

## Common Patterns

### Full Workflow

```javascript
// 1. Initialize SDK
await PowerFlowApp.initialize({ userId: 'user123' });

// 2. Upload file
const fileInput = document.querySelector('#file-input');
await PowerFlowApp.upload(fileInput.files[0]);

// 3. Run analysis
const dcResults = await PowerFlowApp.solve('dc');
console.log('DC Analysis:', dcResults);

// 4. Try different method
const acResults = await PowerFlowApp.solve('ac');
console.log('AC Analysis:', acResults);

// 5. Get cached results later
const cached = await PowerFlowApp.getResults();
```

### Compare Multiple Methods

```javascript
const comparison = await PowerFlowApp.batchSolve(['dc', 'ac', 'fast_decoupled']);

console.log('DC converged:', comparison.dc.converged);
console.log('AC converged:', comparison.ac.converged);
console.log('Fast Decoupled converged:', comparison.fast_decoupled.converged);
```

## TypeScript Support

The SDK includes TypeScript declarations:

```typescript
import { PowerFlowApp, PowerFlowResult, AnalysisMethod } from '@/services/xflow';

const method: AnalysisMethod = 'dc';
const results: PowerFlowResult = await PowerFlowApp.solve(method);

// TypeScript knows the structure
console.log(results.converged); // boolean
console.log(results.bus_results); // Array<BusResult>
```

## Migration from Direct API Calls

### Before (Direct fetch)

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('user_id', userId);

const uploadRes = await fetch(`${API_BASE_URL}/upload`, {
  method: 'POST',
  body: formData
});
const { session_id } = await uploadRes.json();

const solveRes = await fetch(`${API_BASE_URL}/solve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id, method: 'dc', user_id: userId })
});
const results = await solveRes.json();
```

### After (With SDK)

```javascript
const sessionId = await PowerFlowApp.upload(file);
const results = await PowerFlowApp.solve('dc');

// Or even simpler:
const results = await PowerFlowApp.uploadAndSolve(file, 'dc');
```

## Best Practices

1. ✅ **Initialize once** - Call `initialize()` when app starts
2. ✅ **Use events** - Listen to events for UI updates
3. ✅ **Error handling** - Always use try-catch
4. ✅ **Session management** - Let SDK handle sessions automatically
5. ✅ **TypeScript** - Use types for better DX
6. ✅ **Custom hooks** - Create hooks for common patterns

## Troubleshooting

### "SDK not initialized"
```javascript
// Make sure to call initialize first
await PowerFlowApp.initialize({ userId: 'user123' });
```

### "No session ID"
```javascript
// Upload a file first, or set session manually
await PowerFlowApp.upload(file);
// or
PowerFlowApp.setSession('existing-session-id');
```

### Connection failed
```javascript
// Check backend is running and API_BASE_URL is correct
const health = await PowerFlowApp.checkHealth();
console.log('Backend status:', health);
```

## Next Steps

1. Initialize SDK in your App.tsx
2. Create custom hooks for common operations
3. Use events for real-time updates
4. Build your UI components using the SDK

Check `src/services/README.md` for more examples!