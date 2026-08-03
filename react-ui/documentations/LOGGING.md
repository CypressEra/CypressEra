# Logging System Guide

Complete guide to the XFlow SDK logging system.

## Overview

The XFlow SDK includes automatic logging for all operations. Logs are displayed in real-time via the `CommandLogger` component.

## Features

- ✅ **Automatic Logging** - All SDK operations are logged automatically
- ✅ **Manual Logging** - Use `PowerFlowApp.log()` for custom messages
- ✅ **Event-Driven** - Uses pub-sub pattern
- ✅ **Real-time UI** - CommandLogger displays logs as they happen
- ✅ **Multiple Log Levels** - info, success, warning, error
- ✅ **Console Output** - Logs also appear in browser console

## Quick Start

### Using CommandLogger Component

```typescript
import { CommandLogger } from '@/components/features/CommandLogger';

function App() {
  return <CommandLogger maxLogs={100} />;
}
```

The component automatically subscribes to SDK log events from the `PowerFlowApp` singleton.

### Manual Logging

```typescript
import { PowerFlowApp } from '@/sdk';

// Log messages
PowerFlowApp.log('Starting analysis...', 'info');
PowerFlowApp.log('File uploaded', 'success');
PowerFlowApp.log('Memory usage high', 'warning');
PowerFlowApp.log('Connection failed', 'error');
```

## Log Levels

| Level | Icon | Use For |
|-------|------|---------|
| `info` | → | Status updates, information |
| `success` | ✓ | Successful operations |
| `warning` | ⚠ | Warnings, potential issues |
| `error` | ✗ | Errors, failures |

## Automatic Logging

The SDK automatically logs these operations:

### File Operations
- File upload start/complete
- File open
- File save
- File delete

### Calculations
- Calculation start
- Calculation complete (with convergence status)
- Calculation errors

### Edit Operations
- Element add/modify/delete
- Network updates

### Session Operations
- Session creation
- Session changes

### SDK Operations
- SDK initialization
- Health checks
- Connection status

## Manual Logging

### Basic Usage

```typescript
PowerFlowApp.log('Your message', 'info');
```

### In Workflows

```typescript
PowerFlowApp.log('Starting workflow...', 'info');

try {
  await PowerFlowApp.uploadUserFile(file);
  PowerFlowApp.log('✓ File uploaded', 'success');
  
  await PowerFlowApp.calculate('dc');
  PowerFlowApp.log('✓ Calculation complete', 'success');
} catch (error) {
  PowerFlowApp.log(`Error: ${error.message}`, 'error');
}
```

## Subscribing to Logs

```typescript
// Subscribe to log events
const unsubscribe = PowerFlowApp.on('log', (logEntry) => {
  console.log(`[${logEntry.level}] ${logEntry.message}`);
});

// Unsubscribe
unsubscribe();
```

## Log Entry Format

```typescript
interface LogEntry {
  timestamp: string;  // ISO 8601: "2025-10-08T14:30:45.123Z"
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
```

## CommandLogger Component

### Props

```typescript
interface CommandLoggerProps {
  logs?: LogEntry[];      // Optional: custom log entries
  maxLogs?: number;       // Maximum logs to keep (default: 100)
}
```

### Usage

```typescript
import { CommandLogger } from '@/components/features/CommandLogger';

// Basic usage (auto-subscribes to SDK logs)
<CommandLogger />

// With custom max logs
<CommandLogger maxLogs={50} />

// With custom logs (in addition to SDK logs)
<CommandLogger 
  logs={customLogs}
  maxLogs={100}
/>
```

## Configuration

### SDK Log Level

Controls console verbosity (doesn't affect UI logs):

```typescript
await PowerFlowApp.initialize({
  userId: 'user123',
  logLevel: 'INFO'  // NONE, ERROR, WARN, INFO, DEBUG
});
```

### CommandLogger Max Logs

Limit number of logs kept in memory:

```typescript
<CommandLogger maxLogs={50} />
```

## Common Patterns

### Workflow Tracking

```typescript
PowerFlowApp.log('Step 1/3: Uploading...', 'info');
await upload();

PowerFlowApp.log('Step 2/3: Processing...', 'info');
await process();

PowerFlowApp.log('Step 3/3: Complete!', 'success');
```

### Error Recovery

```typescript
try {
  await riskyOperation();
} catch (error) {
  PowerFlowApp.log(`Error: ${error.message}`, 'error');
  PowerFlowApp.log('Attempting recovery...', 'warning');
  await fallbackOperation();
  PowerFlowApp.log('Recovered successfully', 'success');
}
```

## Architecture

### SDK Side

```
PowerFlowApp (Xolution)
    ↓
log() method → emits 'log' event
    ↓
HttpClient → auto-logs API requests → emits 'log' event
```

### UI Side

```
CommandLogger Component
    ↓
Subscribes to 'log' events from PowerFlowApp singleton
    ↓
Updates state with new logs
    ↓
Displays in UI with auto-scroll
```

## Troubleshooting

### Logs not showing in UI?

1. Verify CommandLogger is rendered
2. Check SDK is initialized: `PowerFlowApp.isConnected()`
3. Check browser console for errors
4. Verify PowerFlowApp singleton is used (not a new instance)

### Logs showing in console but not UI?

The CommandLogger automatically subscribes to the `PowerFlowApp` singleton. Ensure you're using the same instance:

```typescript
// ✅ Correct - uses singleton
import { PowerFlowApp } from '@/sdk';
PowerFlowApp.log('message', 'info');

// ❌ Wrong - creates new instance
import { Xolution } from '@/sdk';
const sdk = new Xolution();
sdk.log('message', 'info');  // Won't appear in CommandLogger
```

## See Also

- [SDK.md](./SDK.md) - SDK usage guide
- CommandLogger source: `src/components/features/CommandLogger/`
- SDK logging source: `src/sdk/Xolution.js`

