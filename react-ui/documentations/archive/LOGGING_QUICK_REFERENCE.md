# XFlow SDK Logging - Quick Reference

## 🚀 Quick Start

### 1. Basic Usage

```javascript
import { PowerFlowApp } from './sdk';

// Manual logging
PowerFlowApp.log('Your message here', 'info');      // ℹ️ Info
PowerFlowApp.log('Success message', 'success');     // ✓ Success
PowerFlowApp.log('Warning message', 'warning');     // ⚠ Warning
PowerFlowApp.log('Error message', 'error');         // ✗ Error
```

### 2. In React Component

```tsx
import { CommandLogger } from './components/features/CommandLogger';
import { usePowerFlowSDK } from './hooks/usePowerFlowSDK';

function App() {
  const { sdk } = usePowerFlowSDK();
  
  return <CommandLogger sdk={sdk} />;
}
```

### 3. Subscribe to Logs

```javascript
// Subscribe
const unsubscribe = PowerFlowApp.on('log', (log) => {
  console.log(log.message);
});

// Unsubscribe
unsubscribe();
```

---

## 📋 API Reference

### `log(message, level)`

Log a message with specified level.

```javascript
PowerFlowApp.log(message: string, level?: string): LogEntry
```

**Parameters:**
- `message` (string) - The log message
- `level` (string) - Log level: `'info'`, `'success'`, `'warning'`, `'error'` (default: `'info'`)

**Returns:** LogEntry object with timestamp, level, and message

**Example:**
```javascript
PowerFlowApp.log('Analysis started', 'info');
PowerFlowApp.log('File uploaded', 'success');
```

---

### `on('log', callback)`

Subscribe to log events.

```javascript
PowerFlowApp.on(event: 'log', callback: (log: LogEntry) => void): Function
```

**Parameters:**
- `event` - Event name (use `'log'`)
- `callback` - Function to call when log event occurs

**Returns:** Unsubscribe function

**Example:**
```javascript
const unsubscribe = PowerFlowApp.on('log', (log) => {
  console.log(`[${log.level}] ${log.message}`);
});

// Later...
unsubscribe();
```

---

### `<CommandLogger />`

React component to display logs.

```tsx
<CommandLogger 
  sdk={sdkInstance}      // Required: XFlow SDK instance
  logs={customLogs}      // Optional: Custom log entries
  maxLogs={100}          // Optional: Max logs to keep (default: 100)
/>
```

**Props:**
- `sdk` (required) - XFlow SDK instance
- `logs` (optional) - Array of custom LogEntry objects
- `maxLogs` (optional) - Maximum number of logs to keep

---

## 📝 Log Entry Format

```typescript
interface LogEntry {
  timestamp: string;  // ISO 8601: "2025-10-08T14:30:45.123Z"
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
```

---

## 🎨 Log Levels

| Level | Icon | Color | Use For |
|-------|------|-------|---------|
| `info` | → | Blue/Gray | Status updates, information |
| `success` | ✓ | Green | Successful operations |
| `warning` | ⚠ | Orange | Warnings, potential issues |
| `error` | ✗ | Red | Errors, failures |

---

## 🔄 What Gets Logged Automatically

### ✅ SDK Initialization
```
✓ SDK initialized successfully
→ Connected to backend: http://localhost:8080
```

### ✅ File Operations
```
→ Uploading file: case9.rawx
✓ Successfully uploaded file: case9.rawx

→ Opening file: case9.rawx
✓ Successfully opened file: case9.rawx

→ Saving file...
✓ File saved successfully
```

### ✅ Calculation Operations
```
→ Starting DC Power Flow calculation...
✓ DC Power Flow completed successfully (5 iterations)

→ Starting AC Power Flow calculation...
⚠ AC Power Flow completed but did not converge (100 iterations)
```

### ✅ Edit Operations
```
→ Adding bus...
✓ Successfully added bus

→ Modifying acline...
✓ Successfully modified acline
```

---

## 💡 Common Patterns

### Pattern 1: Workflow Tracking
```javascript
PowerFlowApp.log('Starting workflow...', 'info');

try {
  await PowerFlowApp.uploadUserFile(file);
  PowerFlowApp.log('✓ File uploaded', 'success');
  
  await PowerFlowApp.calculate('dc');
  PowerFlowApp.log('✓ Calculation complete', 'success');
  
  PowerFlowApp.log('Workflow finished!', 'success');
} catch (error) {
  PowerFlowApp.log(`Workflow failed: ${error.message}`, 'error');
}
```

### Pattern 2: Progress Updates
```javascript
PowerFlowApp.log('Step 1/3: Uploading...', 'info');
await upload();

PowerFlowApp.log('Step 2/3: Processing...', 'info');
await process();

PowerFlowApp.log('Step 3/3: Finalizing...', 'info');
await finalize();

PowerFlowApp.log('All done!', 'success');
```

### Pattern 3: Error Recovery
```javascript
try {
  await riskyOperation();
} catch (error) {
  PowerFlowApp.log(`Error: ${error.message}`, 'error');
  PowerFlowApp.log('Attempting recovery...', 'warning');
  await fallbackOperation();
  PowerFlowApp.log('Recovered successfully', 'success');
}
```

### Pattern 4: Performance Tracking
```javascript
const start = Date.now();
PowerFlowApp.log('Starting calculation...', 'info');

await PowerFlowApp.calculate('dc');

const duration = Date.now() - start;
PowerFlowApp.log(`Calculation took ${duration}ms`, 'info');
```

---

## ⚙️ Configuration

### Console Log Level

Controls console verbosity (doesn't affect UI logs):

```javascript
await PowerFlowApp.initialize({
  userId: 'user123',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'DEBUG'  // NONE, ERROR, WARN, INFO, DEBUG
});
```

### Log Buffer Size

Limit number of logs kept in memory:

```tsx
<CommandLogger sdk={sdk} maxLogs={50} />
```

---

## 🐛 Troubleshooting

### Logs not showing?

1. ✅ Check SDK is passed to CommandLogger:
   ```tsx
   <CommandLogger sdk={sdk} />
   ```

2. ✅ Verify SDK is initialized:
   ```javascript
   console.log(PowerFlowApp.isConnected());
   ```

3. ✅ Check browser console for errors

### Logs showing in console but not UI?

Ensure you're using the SDK instance from `usePowerFlowSDK`:
```javascript
const { sdk } = usePowerFlowSDK();
// Pass this sdk to CommandLogger
```

---

## 📚 See Also

- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** - Complete guide with detailed examples
- **[LOGGING_IMPLEMENTATION.md](./LOGGING_IMPLEMENTATION.md)** - Implementation details
- **[examples/logging-example.js](../src/sdk/examples/logging-example.js)** - 7 practical examples

---

## 🎯 Cheat Sheet

```javascript
// ===== LOGGING =====
PowerFlowApp.log('message', 'info');     // Info
PowerFlowApp.log('message', 'success');  // Success
PowerFlowApp.log('message', 'warning');  // Warning
PowerFlowApp.log('message', 'error');    // Error

// ===== SUBSCRIBE =====
const unsub = PowerFlowApp.on('log', (log) => {
  console.log(log);
});
unsub(); // Unsubscribe

// ===== COMPONENT =====
<CommandLogger sdk={sdk} maxLogs={100} />

// ===== WHAT'S AUTOMATIC =====
// • SDK initialization
// • File operations (upload, open, save, delete)
// • Calculations (start, complete, convergence status)
// • Edit operations (add, modify, delete)
// • Network operations
// • Session operations
```

---

**That's it!** You now know everything you need to use the XFlow SDK logging system. 🚀

