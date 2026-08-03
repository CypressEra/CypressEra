# XFlow SDK Quick Reference

One-page cheat sheet for the XFlow Power Flow Analysis SDK.

## Import

```javascript
import { PowerFlowApp } from '@/sdk';
```

## Initialize (Once at App Start)

```javascript
await PowerFlowApp.initialize({ userId: 'demo_user' });
```

## Basic Operations

### Upload File
```javascript
const sessionId = await PowerFlowApp.upload(file);
```

### Run Analysis
```javascript
const results = await PowerFlowApp.solve('dc');
// or 'ac' or 'fast_decoupled'
```

### Upload + Solve
```javascript
const results = await PowerFlowApp.uploadAndSolve(file, 'dc');
```

### Get Cached Results
```javascript
const results = await PowerFlowApp.getResults();
```

## Session Management

```javascript
// Get current session
const sessionId = PowerFlowApp.getSession();

// Set session
PowerFlowApp.setSession('session-id');

// Clear session
PowerFlowApp.clearSession();
```

## Status Checks

```javascript
// Connection status
PowerFlowApp.isConnected() // true/false

// Backend health
await PowerFlowApp.checkHealth()

// API URL
PowerFlowApp.getBaseURL()
```

## Events

```javascript
// Listen to events
const unsubscribe = PowerFlowApp.on('solve:complete', (data) => {
  console.log('Done!', data.results);
});

// Cleanup
unsubscribe();
```

**Available Events:**
- `initialized`, `upload:start`, `upload:complete`, `upload:error`
- `solve:start`, `solve:complete`, `solve:error`
- `session:cleared`, `session:changed`, `reset`, `error`

## React Hook Example

```jsx
function MyComponent() {
  const [results, setResults] = useState(null);

  const handleAnalysis = async (file) => {
    try {
      const data = await PowerFlowApp.uploadAndSolve(file, 'dc');
      setResults(data);
    } catch (error) {
      console.error(error);
    }
  };

  return <input type="file" onChange={(e) => 
    handleAnalysis(e.target.files[0])
  } />;
}
```

## Results Structure

```javascript
{
  converged: true,
  solution_time_ms: 45.2,
  bus_results: [...],      // Voltage, angle, injections
  branch_results: [...],   // Power flows, losses
  system_summary: {
    total_load_mw: 500,
    total_generation_mw: 510,
    total_losses_mw: 10,
    efficiency_percent: 98.0
  }
}
```

## Error Handling

```javascript
try {
  const results = await PowerFlowApp.solve('dc');
} catch (error) {
  console.error('Failed:', error.message);
}
```

## Advanced

### Batch Solve
```javascript
const results = await PowerFlowApp.batchSolve(['dc', 'ac']);
// Returns: { dc: {...}, ac: {...} }
```

### Custom Options
```javascript
await PowerFlowApp.solve('ac', {
  tolerance: 1e-6,
  max_iterations: 100
});
```

## Complete Example

```javascript
// 1. Initialize
await PowerFlowApp.initialize({ userId: 'user123' });

// 2. Upload
await PowerFlowApp.upload(file);

// 3. Solve
const results = await PowerFlowApp.solve('dc');

// 4. Use results
console.log('Converged:', results.converged);
console.log('Load:', results.system_summary.total_load_mw);
```

---

**Full Documentation:** See [XFLOW_SDK_GUIDE.md](./XFLOW_SDK_GUIDE.md)