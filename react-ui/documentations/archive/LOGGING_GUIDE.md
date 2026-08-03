# XFlow SDK Logging System Guide

## Overview

The XFlow SDK now includes a comprehensive logging system that automatically logs all API requests/responses and allows manual logging throughout your application. The `CommandLogger` UI component listens to these log events and displays them in real-time.

## Features

✅ **Contextual Logging** - Meaningful, user-friendly messages at the SDK action level  
✅ **Automatic Operation Logging** - File ops, calculations, edits are automatically logged  
✅ **Manual Logging** - Use `xflow.log()` to log custom messages  
✅ **Event-Driven** - Uses pub-sub pattern for decoupled architecture  
✅ **Real-time UI Updates** - CommandLogger displays logs as they happen  
✅ **Multiple Log Levels** - `info`, `success`, `warning`, `error`  
✅ **Timestamp Formatting** - Automatic ISO timestamp conversion  
✅ **Console Logging** - Logs also appear in browser console  

---

## Architecture

### SDK Side

```
Xolution (Main SDK) 
    ↓
log() method → emits 'log' event
    ↓
HttpClient → auto-logs API requests → emits 'log' event
```

### UI Side

```
CommandLogger Component
    ↓
Subscribes to 'log' events
    ↓
Updates state with new logs
    ↓
Displays in UI with auto-scroll
```

---

## Usage

### 1. Basic Manual Logging

```javascript
// Import SDK
import { PowerFlowApp } from './sdk';

// Initialize SDK
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080'
});

// Log messages with different levels
PowerFlowApp.log('Starting analysis...', 'info');
PowerFlowApp.log('File uploaded successfully', 'success');
PowerFlowApp.log('Memory usage high', 'warning');
PowerFlowApp.log('Connection failed', 'error');
```

### 2. Automatic Contextual Logging

All SDK operations are automatically logged with contextual messages:

```javascript
// File operations
await PowerFlowApp.uploadUserFile(file);
// Logs: "Uploading file: case9.rawx"
// Logs: "Successfully uploaded file: case9.rawx"

// Calculations
await PowerFlowApp.calculate('dc', { tolerance: 1e-6 });
// Logs: "Starting DC Power Flow calculation..."
// Logs: "DC Power Flow completed successfully (5 iterations)"

// Edit operations
await PowerFlowApp.addElement('bus', busData);
// Logs: "Adding bus..."
// Logs: "Successfully added bus"
```

### 3. Using CommandLogger Component

```tsx
import { CommandLogger } from './components/features/CommandLogger';
import { usePowerFlowSDK } from './hooks/usePowerFlowSDK';

function MyApp() {
  const { sdk } = usePowerFlowSDK();
  
  return (
    <div>
      <CommandLogger 
        sdk={sdk}           // Pass SDK instance
        maxLogs={100}       // Optional: max logs to keep (default: 100)
      />
    </div>
  );
}
```

### 4. Custom Log Entries

You can also pass custom log entries directly to CommandLogger:

```tsx
const customLogs = [
  { timestamp: '12:30:45', level: 'info', message: 'Custom log entry' }
];

<CommandLogger logs={customLogs} sdk={sdk} />
```

---

## Log Levels

| Level | Icon | Use Case | Color |
|-------|------|----------|-------|
| `info` | → | General information, status updates | Blue/Gray |
| `success` | ✓ | Successful operations, confirmations | Green |
| `warning` | ⚠ | Warnings, potential issues | Yellow/Orange |
| `error` | ✗ | Errors, failures | Red |

---

## Examples

### Example 1: Workflow with Logging

```javascript
// Initialize SDK (automatic log)
await PowerFlowApp.initialize({ ... });
// Logs: "SDK initialized successfully"
// Logs: "Connected to backend: http://localhost:8080"

// Upload file (automatic contextual logs)
const result = await PowerFlowApp.uploadUserFile(file);
// Logs: "Uploading file: case9.rawx"
// Logs: "Successfully uploaded file: case9.rawx"

// Open file (automatic contextual logs)
await PowerFlowApp.createSessionFromFile(file.name);
// Logs: "Opening file: case9.rawx"
// Logs: "Successfully opened file: case9.rawx"

// Run calculation (automatic contextual logs with convergence status)
await PowerFlowApp.calculate('dc');
// Logs: "Starting DC Power Flow calculation..."
// Logs: "DC Power Flow completed successfully (5 iterations)"

// Custom log
PowerFlowApp.log('Analysis workflow completed!', 'success');
```

### Example 2: Error Handling with Logging

```javascript
try {
  PowerFlowApp.log('Starting calculation...', 'info');
  await PowerFlowApp.calculate('dc');
  PowerFlowApp.log('Calculation completed successfully', 'success');
} catch (error) {
  // Log error
  PowerFlowApp.log(`Calculation failed: ${error.message}`, 'error');
  
  // Handle error
  console.error(error);
}
```

### Example 3: Custom Workflow Tracking

```javascript
async function analyzeNetwork(file) {
  PowerFlowApp.log(`🔵 Starting analysis for ${file.name}...`, 'info');
  
  try {
    // Upload
    PowerFlowApp.log('Step 1/3: Uploading file...', 'info');
    await PowerFlowApp.uploadUserFile(file);
    PowerFlowApp.log('✓ Upload complete', 'success');
    
    // Create session
    PowerFlowApp.log('Step 2/3: Creating session...', 'info');
    await PowerFlowApp.createSessionFromFile(file.name);
    PowerFlowApp.log('✓ Session created', 'success');
    
    // Calculate
    PowerFlowApp.log('Step 3/3: Running power flow...', 'info');
    const result = await PowerFlowApp.calculate('dc');
    PowerFlowApp.log('✓ Analysis complete', 'success');
    
    PowerFlowApp.log(`🎉 All done! Converged in ${result.iterations} iterations`, 'success');
    
    return result;
  } catch (error) {
    PowerFlowApp.log(`❌ Analysis failed: ${error.message}`, 'error');
    throw error;
  }
}
```

---

## Technical Details

### Log Event Structure

```typescript
interface LogEntry {
  timestamp: string;  // ISO 8601 format
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
```

### Event Name

The SDK emits logs using the event name: `'log'` or `SDK_EVENTS.LOG`

### Subscription Example

```javascript
// Subscribe to log events manually
const unsubscribe = PowerFlowApp.on('log', (logEntry) => {
  console.log(`[${logEntry.level}] ${logEntry.message}`);
});

// Later, unsubscribe
unsubscribe();
```

---

## Configuration

### SDK Initialization

```javascript
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'DEBUG',  // Controls console logging verbosity
});
```

### Log Levels (Console)

- `NONE` - No console logs
- `ERROR` - Only errors
- `WARN` - Warnings and errors
- `INFO` - Info, warnings, and errors (default)
- `DEBUG` - All logs including debug info

**Note:** The `logLevel` config only affects console logging. UI logging (CommandLogger) shows all emitted logs regardless of this setting.

---

## Best Practices

### ✅ Do's

- Use `info` for general status updates
- Use `success` for completed operations
- Use `warning` for recoverable issues
- Use `error` for failures that need attention
- Keep messages concise and clear
- Include context in error messages

### ❌ Don'ts

- Don't log sensitive data (passwords, tokens)
- Don't spam logs with too many messages
- Don't use generic messages like "Error" - be specific
- Don't rely solely on logs for error handling

---

## Troubleshooting

### Logs not appearing in CommandLogger?

1. Verify SDK instance is passed to CommandLogger:
   ```tsx
   <CommandLogger sdk={sdk} />
   ```

2. Check that SDK is initialized:
   ```javascript
   console.log(PowerFlowApp.isConnected()); // Should be true
   ```

3. Verify event subscription:
   ```javascript
   console.log(PowerFlowApp.listenerCount('log')); // Should be > 0
   ```

### API requests not being logged?

The HttpClient automatically logs when it has a reference to the main SDK emitter. This is set up during SDK initialization, so make sure:

1. SDK is properly initialized
2. You're using SDK methods (not raw fetch)

---

## Future Enhancements

Potential improvements for the logging system:

- [ ] Log filtering by level in UI
- [ ] Log search functionality
- [ ] Export logs to file
- [ ] Log persistence (localStorage)
- [ ] Log grouping/categorization
- [ ] Performance metrics logging
- [ ] Remote log streaming

---

## Summary

The XFlow SDK logging system provides a powerful, flexible way to track what's happening in your application. It combines automatic contextual logging with manual logging capabilities, all displayed in a real-time UI component.

**Key Takeaways:**
- Use `xflow.log(message, level)` for manual logging
- All SDK operations are automatically logged with user-friendly messages
- File operations, calculations, and edits show contextual status
- Convergence status and iteration counts are automatically logged
- CommandLogger displays logs in real-time
- Event-driven architecture keeps SDK and UI decoupled
- Multiple log levels for different scenarios

Happy logging! 🚀

