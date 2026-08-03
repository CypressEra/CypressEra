# Xolution SDK - Complete Guide

**Xolution** - The soul of power flow analysis. Modern, type-safe SDK fully integrated with the XFlow API server.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Complete Workflow](#complete-workflow)
- [API Reference](#api-reference)
- [Event System](#event-system)
- [Best Practices](#best-practices)
- [React Integration](#react-integration)
- [Examples](#examples)

---

## Installation

The SDK is included in the React UI project:

```javascript
import { Xolution, PowerFlowApp, ANALYSIS_METHODS } from '@/sdk';
```

---

## Quick Start

### Basic Usage (Singleton Pattern - Recommended)

```javascript
import { PowerFlowApp, ANALYSIS_METHODS } from '@/sdk';

// 1. Initialize SDK
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'INFO'
});

// 2. Upload file to user folder
const file = document.querySelector('input[type="file"]').files[0];
await PowerFlowApp.uploadUserFile(file);

// 3. Create session from file
const session = await PowerFlowApp.createSessionFromFile(file.name);

// 4. Get network data
const network = await PowerFlowApp.getNetwork();

// 5. Run calculation
const result = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC);

// 6. Save changes back to user file
await PowerFlowApp.saveSessionToUserFile();
```

### Advanced Usage (Multiple Instances)

```javascript
import { Xolution } from '@/sdk';

const sdk1 = new Xolution();
await sdk1.initialize({ userId: 'user1' });

const sdk2 = new Xolution();
await sdk2.initialize({ userId: 'user2' });
```

---

## Architecture

### Clear Hierarchy

```
sdk/
  📜 Xolution.js              ← THE SOUL - Main orchestrator
  📜 index.js                 ← Entry point & exports
  │
  🔧 core/                    ← Infrastructure layer
     HttpClient.js            ← HTTP communication
     SessionManager.js        ← Session state management
  │
  🎨 services/                ← Business logic layer
     SessionService.js        ← File & session lifecycle
     AnalysisService.js       ← Power flow calculations
     EditService.js           ← Network element editing
  │
  🛠️ utils/                   ← Utilities layer
     EventEmitter.js          ← Event system
     errors.js                ← Custom error classes
     dataAggregator.js        ← Data merging logic
  │
  📋 types/                   ← Type definitions
     index.js                 ← Constants
     index.d.ts               ← TypeScript definitions
```

### Component Responsibilities

#### **Xolution** (The Soul)
- Main SDK class that orchestrates everything
- Delegates to services for domain-specific operations
- Manages SDK lifecycle and state
- Emits events for UI integration

#### **Core Components**
- **HttpClient**: HTTP communication layer with retry logic
- **SessionManager**: Session state and localStorage persistence

#### **Services**
- **SessionService**: User file management, session lifecycle
- **AnalysisService**: Power flow calculations, batch analysis
- **EditService**: Network element CRUD operations

#### **Utilities**
- **EventEmitter**: Pub/sub event system
- **errors.js**: Custom error classes (SessionError, SolveError, etc.)
- **dataAggregator.js**: Merges calculation results with network data

---

## Complete Workflow

### 1. Initialize SDK

```javascript
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'INFO',
  persistSession: false,
  timeout: 30000
});
```

**Configuration Options:**
- `userId` (required): User identifier
- `apiBaseURL` (optional): API server URL (default: http://localhost:8080)
- `logLevel`: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' (default: 'INFO')
- `persistSession`: Save session to localStorage (default: false)
- `timeout`: Request timeout in milliseconds (default: 30000)

### 2. User File Management

#### Upload File to User Folder
```javascript
const file = document.querySelector('input[type="file"]').files[0];
const result = await PowerFlowApp.uploadUserFile(file);
// Returns: { message, path, fileName }
```

#### Get User Files
```javascript
const response = await PowerFlowApp.getUserFiles('demo_user');
console.log(response.files); // Array of file names
```

#### Get File Info
```javascript
const info = await PowerFlowApp.getUserFileInfo('network.rawx');
// Returns: { name, size, modified, path }
```

#### Delete User File
```javascript
// Delete model file (default)
await PowerFlowApp.deleteUserFile('network.rawx', 'model');
// Delete knowledge base file
await PowerFlowApp.deleteUserFile('document.pdf', 'knowledge');
```

### 3. Session Management

#### Create Session from User File
```javascript
const result = await PowerFlowApp.createSessionFromFile('network.rawx');
console.log(result.session_id);
console.log(result.message);
```

#### Get Session Info
```javascript
const info = await PowerFlowApp.getSessionInfo();
// Returns: { session_id, user_id, status, created_at, ... }
```

#### Save Session Back to User File
```javascript
await PowerFlowApp.saveSessionToUserFile();
// Saves current session state back to the original file
```

#### Save Session As New User File
```javascript
await PowerFlowApp.saveSessionAsUserFile('new-filename.rawx');
// Saves current session state as a new file with the specified name
// The session temp file is renamed to match, and mapping is updated
// 
// Event-Driven State Updates:
// - Emits SESSION_CHANGED event automatically
// - usePowerFlowSDK hook listens and updates sessionInfo state
// - UI components react to sessionInfo changes (NetworkView title, ProjectExplorer selection)
// - Works seamlessly whether called from UI or MCP
//
// Note: If a file with the same name already exists, it will be overwritten.
```

#### Clear Session
```javascript
PowerFlowApp.clearSession();
```

### 4. Get Network Data

```javascript
const network = await PowerFlowApp.getNetwork();

console.log(network.network_data.bus);       // Array of buses
console.log(network.network_data.load);      // Array of loads
console.log(network.network_data.generator); // Array of generators
console.log(network.network_data.acline);    // Array of AC lines
console.log(network.network_data.transformer); // Array of transformers
```

**Cached Network Data:**
```javascript
// Get from cache (no API call)
const cached = PowerFlowApp.getCachedNetwork();

// Update cache locally
PowerFlowApp.updateCachedNetwork(newNetworkData);

// Clear cache
PowerFlowApp.clearCache();
```

### 5. Edit Network

#### Add Element
```javascript
import { ELEMENT_TYPES } from '@/sdk';

// Add a bus
await PowerFlowApp.addElement(ELEMENT_TYPES.BUS, {
  ibus: 99999,
  name: 'NEW BUS',
  baskv: 230.0,
  ide: 1,
  vm: 1.0,
  va: 0.0
});
```

#### Modify Element
```javascript
await PowerFlowApp.modifyElement(
  ELEMENT_TYPES.BUS,
  { ibus: 99999 },  // identifier
  { vm: 1.05 }      // new data
);
```

#### Delete Element
```javascript
await PowerFlowApp.deleteElement(
  ELEMENT_TYPES.BUS,
  { ibus: 99999 }
);
```

**Available Element Types:**
- `ELEMENT_TYPES.BUS`
- `ELEMENT_TYPES.LOAD`
- `ELEMENT_TYPES.GENERATOR`
- `ELEMENT_TYPES.ACLINE`
- `ELEMENT_TYPES.TRANSFORMER`

### 6. Run Calculation

#### Single Method
```javascript
import { ANALYSIS_METHODS } from '@/sdk';

const result = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC, {
  tolerance: 1e-3,
  maxIterations: 100
});

console.log(result.results.converged);      // true/false
console.log(result.results.iterations);     // number of iterations
console.log(result.results.solution_time_ms); // computation time
console.log(result.results.bus_results);    // bus results
console.log(result.results.branch_results); // branch results
```

#### Batch Calculation
```javascript
const results = await PowerFlowApp.batchCalculate([
  ANALYSIS_METHODS.DC,
  ANALYSIS_METHODS.FNSL
]);

console.log(results.dc);  // DC results
console.log(results.fnsl);  // Full Newton (fnsl) results
```

**Available Methods:**
- `ANALYSIS_METHODS.DC` - DC power flow
- `ANALYSIS_METHODS.FNSL` - Full Newton (fnsl) power flow
- `ANALYSIS_METHODS.FDNS` - Fast decoupled (fdns) method

### 7. Complete Workflow (Upload & Calculate)

```javascript
// One-step workflow: upload file and calculate
const result = await PowerFlowApp.uploadAndCalculate(file, ANALYSIS_METHODS.DC);

console.log(result.results.converged);
console.log(result.session_id);
```

---

## Event System

Xolution uses an event-driven architecture for UI integration.

### Available Events

```javascript
import { SDK_EVENTS } from '@/sdk';

// Initialization
SDK_EVENTS.INITIALIZED          // SDK initialized
SDK_EVENTS.ERROR                // Error occurred

// Calculation
SDK_EVENTS.CALCULATE_START      // Calculation started
SDK_EVENTS.CALCULATE_COMPLETE   // Calculation complete
SDK_EVENTS.CALCULATE_ERROR      // Calculation failed

// Network
SDK_EVENTS.NETWORK_UPDATED      // Network data updated

// Session
SDK_EVENTS.SESSION_CREATED      // Session created
SDK_EVENTS.SESSION_CLEARED      // Session cleared
SDK_EVENTS.SESSION_CHANGED      // Session changed

// Editing
SDK_EVENTS.EDIT_START           // Edit started
SDK_EVENTS.EDIT_COMPLETE        // Edit complete
SDK_EVENTS.EDIT_ERROR           // Edit failed

// File operations
SDK_EVENTS.FILE_DELETED         // File deleted

// System
SDK_EVENTS.HEALTH_CHECK         // Health check performed
SDK_EVENTS.RESET                // SDK reset
SDK_EVENTS.LOG                  // Log message (for UI)
```

### Subscribe to Events

```javascript
// Listen to an event
const unsubscribe = PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  console.log('Calculation done:', data.results.converged);
});

// Unsubscribe
unsubscribe();

// Or use off()
PowerFlowApp.off(SDK_EVENTS.CALCULATE_COMPLETE, handler);
```

### Listen Once

```javascript
PowerFlowApp.once(SDK_EVENTS.INITIALIZED, (data) => {
  console.log('SDK ready:', data.connected);
});
```

### Remove All Listeners

```javascript
PowerFlowApp.removeAllListeners(); // Remove all
PowerFlowApp.removeAllListeners(SDK_EVENTS.ERROR); // Remove specific event
```

---

## Logging System

### UI Logging with `this.log()`

The SDK provides a dual logging system:

```javascript
// In SDK internals - logs to BOTH console and UI (CommandLogger)
this.log('File uploaded successfully', 'success');
this.log('Starting calculation...', 'info');
this.log('Connection failed', 'error');
this.log('Network data missing', 'warning');
```

**Log Levels:**
- `'info'` - Informational message (ℹ️)
- `'success'` - Success message (✅)
- `'warning'` - Warning message (⚠️)
- `'error'` - Error message (❌)
- `'debug'` - Debug message (🔍)

### Listening to UI Logs

```javascript
PowerFlowApp.on(SDK_EVENTS.LOG, (logEntry) => {
  console.log(logEntry.timestamp); // ISO timestamp
  console.log(logEntry.level);     // 'info' | 'success' | 'error' | 'warning'
  console.log(logEntry.message);   // Log message
});
```

### Console-Only Debugging

For internal debugging (developers only):

```javascript
// Console only - not shown in UI
console.log('[XFlow] 🔍 Debug info:', data);
console.error('[XFlow] ❌ Internal error:', error);
console.warn('[XFlow] ⚠️ Warning:', message);
```

---

## Best Practices

### 1. Error Handling

```javascript
import { 
  SessionError, 
  SolveError, 
  NetworkError,
  ValidationError,
  InitializationError 
} from '@/sdk';

try {
  await PowerFlowApp.createSessionFromFile('network.rawx');
} catch (error) {
  if (error instanceof SessionError) {
    console.error('Session error:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof SolveError) {
    console.error('Calculation failed:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 2. Event-Driven UI Updates

```javascript
// Listen to network updates
PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, (data) => {
  updateNetworkDisplay(data.networkData);
});

// Listen to calculation completion
PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  displayResults(data.results);
});

// Listen to errors
PowerFlowApp.on(SDK_EVENTS.ERROR, (data) => {
  showErrorNotification(data.error.message);
});
```

### 3. Cache Management

```javascript
// Use cached data when possible to avoid API calls
const cachedNetwork = PowerFlowApp.getCachedNetwork();
if (cachedNetwork) {
  console.log('Using cached network');
} else {
  const network = await PowerFlowApp.getNetwork();
}

// After editing, update cache
PowerFlowApp.updateCachedNetwork(modifiedNetwork);

// Clear cache when switching files
PowerFlowApp.clearCache();
```

### 4. Session Persistence

```javascript
// Enable session persistence
await PowerFlowApp.initialize({
  userId: 'demo_user',
  persistSession: true
});

// Session is automatically saved to localStorage
// and restored on next initialization
```

### 5. Check Connection Status

```javascript
// Check if SDK is initialized and connected
if (PowerFlowApp.isConnected()) {
  // Ready to use
  await PowerFlowApp.createSessionFromFile('network.rawx');
} else {
  console.error('SDK not connected');
}

// Check health
const health = await PowerFlowApp.checkHealth();
console.log(health.status); // 'ok' or 'error'
```

---

## React Integration

### Using the Hook (Recommended)

```javascript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function MyComponent() {
  const {
    initialized,
    connected,
    loading,
    error,
    networkData,
    calculationResult,
    createSessionFromFile,
    calculate,
    clearError,
    sdk  // Access to PowerFlowApp instance
  } = usePowerFlowSDK({
    userId: 'demo_user',
    apiBaseURL: 'http://localhost:8080',
    autoInitialize: true
  });

  const handleUpload = async (file) => {
    try {
      await sdk.uploadUserFile(file);
      await createSessionFromFile(file.name);
    } catch (err) {
      console.error(err);
    }
  };

  if (!initialized) return <div>Initializing...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {connected && <FileUploader onUpload={handleUpload} />}
      {loading && <Spinner />}
    </div>
  );
}
```

### Direct Usage in React

```javascript
import { PowerFlowApp, SDK_EVENTS } from '@/sdk';
import { useEffect, useState } from 'react';

function MyComponent() {
  const [networkData, setNetworkData] = useState(null);

  useEffect(() => {
    // Initialize
    PowerFlowApp.initialize({
      userId: 'demo_user'
    });

    // Subscribe to events
    const unsubscribe = PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, (data) => {
      setNetworkData(data.networkData);
    });

    // Cleanup
    return () => unsubscribe();
  }, []);

  const handleCalculate = async () => {
    const result = await PowerFlowApp.calculate('dc');
    console.log(result);
  };

  return <button onClick={handleCalculate}>Calculate</button>;
}
```

---

## Examples

### Complete Workflow Example

```javascript
import { PowerFlowApp, ANALYSIS_METHODS, SDK_EVENTS } from '@/sdk';

async function completeWorkflow(file) {
  try {
    // 1. Initialize
    await PowerFlowApp.initialize({
      userId: 'demo_user',
      logLevel: 'INFO'
    });

    // 2. Listen to events
    PowerFlowApp.on(SDK_EVENTS.LOG, (log) => {
      console.log(`[${log.level}] ${log.message}`);
    });

    PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
      console.log('Converged:', data.results.converged);
    });

    // 3. Upload file to user folder
    await PowerFlowApp.uploadUserFile(file);
    console.log('File uploaded to user folder');

    // 4. Create session from file
    const session = await PowerFlowApp.createSessionFromFile(file.name);
    console.log('Session created:', session.session_id);

    // 5. Get network
    const network = await PowerFlowApp.getNetwork();
    console.log('Buses:', network.network_data.bus.length);

    // 6. Edit network (optional)
    await PowerFlowApp.addElement('bus', {
      ibus: 99999,
      name: 'NEW BUS',
      baskv: 230.0,
      ide: 1,
      vm: 1.0,
      va: 0.0
    });
    console.log('Bus added');

    // 7. Calculate
    const result = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC);
    console.log('Converged:', result.results.converged);
    console.log('Time:', result.results.solution_time_ms, 'ms');

    // 8. Save changes back to file
    await PowerFlowApp.saveSessionToUserFile();
    console.log('Changes saved to user file');

    return result;
  } catch (error) {
    console.error('Workflow failed:', error);
    throw error;
  }
}
```

### One-Step Upload & Calculate

```javascript
async function quickAnalysis(file) {
  await PowerFlowApp.initialize({ userId: 'demo_user' });
  
  // Upload and calculate in one call
  const result = await PowerFlowApp.uploadAndCalculate(
    file, 
    ANALYSIS_METHODS.DC,
    { tolerance: 1e-3 }
  );
  
  console.log('Converged:', result.results.converged);
  return result;
}
```

### Batch Analysis

```javascript
async function compareAnalysisMethods(fileName) {
  await PowerFlowApp.createSessionFromFile(fileName);
  
  const results = await PowerFlowApp.batchCalculate([
    ANALYSIS_METHODS.DC,
    ANALYSIS_METHODS.FNSL
  ]);
  
  console.log('DC Time:', results.dc.results.solution_time_ms, 'ms');
  console.log('FNSL Time:', results.fnsl.results.solution_time_ms, 'ms');
  
  return results;
}
```

---

## TypeScript Support

The SDK includes full TypeScript definitions for autocomplete and type checking:

```typescript
import { 
  Xolution, 
  CalculationResult, 
  SessionInfo,
  NetworkData,
  ANALYSIS_METHODS 
} from '@/sdk';

const sdk = new Xolution();

// Full type safety
const result: CalculationResult = await sdk.calculate(ANALYSIS_METHODS.DC);
const info: SessionInfo = await sdk.getSessionInfo();
const network: NetworkData = await sdk.getNetwork();
```

---

## Quick Reference - All Functions

Copy-paste ready examples for every SDK function.

### Initialization & Status

```javascript
// Initialize
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'INFO'
});

// Check connection
const connected = PowerFlowApp.isConnected(); // true/false

// Check health
const health = await PowerFlowApp.checkHealth();
// Returns: { status: 'ok' | 'error' }

// Get status
const status = PowerFlowApp.getStatus();
// Returns: 'idle' | 'connected' | 'error'

// Get base URL
const url = PowerFlowApp.getBaseURL(); // 'http://localhost:8080'
```

### User File Management

```javascript
// Upload file to user folder
const file = document.querySelector('input').files[0];
await PowerFlowApp.uploadUserFile(file);
// Optional: specify user
await PowerFlowApp.uploadUserFile(file, 'user123');

// Get all user files
const response = await PowerFlowApp.getUserFiles();
console.log(response.files); // ['network1.rawx', 'network2.rawx']

// Get specific user's files
const userFiles = await PowerFlowApp.getUserFiles('user123');

// Get file info
const info = await PowerFlowApp.getUserFileInfo('network.rawx');
// Returns: { name, size, modified, path }

// Delete user file (default: 'model')
await PowerFlowApp.deleteUserFile('network.rawx', 'model');
// Delete knowledge base file
await PowerFlowApp.deleteUserFile('document.pdf', 'knowledge');
```

### Session Management

```javascript
// Create session from user file
const result = await PowerFlowApp.createSessionFromFile('network.rawx');
console.log(result.session_id);

// Get current session ID
const sessionId = PowerFlowApp.getSession();

// Set session ID (switch sessions)
PowerFlowApp.setSession('session_abc123');

// Check if has session
const hasSession = PowerFlowApp.hasSession(); // true/false

// Get session info
const info = await PowerFlowApp.getSessionInfo();
// Returns: { session_id, user_id, status, created_at, ... }

// Save session back to user file
await PowerFlowApp.saveSessionToUserFile();

// Save session as new user file
// Automatically emits SESSION_CHANGED event for state updates
await PowerFlowApp.saveSessionAsUserFile('new-filename.rawx');

// Clear current session
PowerFlowApp.clearSession();

// Get session data (internal state)
const data = PowerFlowApp.getSessionData('key');

// Get all user sessions
const sessions = await PowerFlowApp.getUserSessions('user123');

// Delete all user sessions
await PowerFlowApp.deleteUserSessions('user123');
```

### Network Data

```javascript
// Get network data from API
const network = await PowerFlowApp.getNetwork();
console.log(network.network_data.bus);
console.log(network.network_data.load);
console.log(network.network_data.generator);
console.log(network.network_data.acline);

// Get from specific session
const network2 = await PowerFlowApp.getNetwork('session_id');

// Get cached network (no API call)
const cached = PowerFlowApp.getCachedNetwork();

// Update cached network locally
PowerFlowApp.updateCachedNetwork(modifiedNetwork);

// Get cached calculation result
const cachedResult = PowerFlowApp.getCachedCalculationResult();

// Clear all cache
PowerFlowApp.clearCache();
```

### Edit Operations

```javascript
import { ELEMENT_TYPES } from '@/sdk';

// Add element (generic)
await PowerFlowApp.addElement(ELEMENT_TYPES.BUS, {
  ibus: 99999,
  name: 'NEW BUS',
  baskv: 230.0,
  ide: 1,
  vm: 1.0,
  va: 0.0
});

// Modify element (generic)
await PowerFlowApp.modifyElement(
  ELEMENT_TYPES.BUS,
  { ibus: 99999 },  // identifier
  { vm: 1.05, va: 0.5 }  // new values
);

// Delete element (generic)
await PowerFlowApp.deleteElement(
  ELEMENT_TYPES.BUS,
  { ibus: 99999 }
);

// Edit element (low-level)
await PowerFlowApp.editElement(
  ELEMENT_TYPES.BUS,
  'add',
  {
    data: { ibus: 99999, name: 'BUS' }
  }
);

// Add load
await PowerFlowApp.addElement(ELEMENT_TYPES.LOAD, {
  ibus: 101,
  loadid: '1',
  pl: 100.0,
  ql: 50.0
});

// Add generator
await PowerFlowApp.addElement(ELEMENT_TYPES.GENERATOR, {
  ibus: 1,
  machid: '1',
  pg: 500.0,
  qg: 100.0
});

// Add AC line
await PowerFlowApp.addElement(ELEMENT_TYPES.ACLINE, {
  ibus: 1,
  jbus: 2,
  ckt: '1',
  r: 0.01,
  x: 0.05
});

// Add transformer
await PowerFlowApp.addElement(ELEMENT_TYPES.TRANSFORMER, {
  ibus: 1,
  jbus: 2,
  ckt: '1',
  r: 0.002,
  x: 0.08
});
```

### Calculations

```javascript
import { ANALYSIS_METHODS } from '@/sdk';

// DC power flow
const dcResult = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC);

// Full Newton (fnsl) power flow
const acResult = await PowerFlowApp.calculate(ANALYSIS_METHODS.FNSL);

// Fast decoupled (fdns)
const fdResult = await PowerFlowApp.calculate(ANALYSIS_METHODS.FDNS);

// With options
const result = await PowerFlowApp.calculate(ANALYSIS_METHODS.DC, {
  tolerance: 1e-3,
  maxIterations: 100
});

// Access results
console.log(result.results.converged);      // true/false
console.log(result.results.iterations);     // number
console.log(result.results.solution_time_ms); // milliseconds
console.log(result.results.bus_results);    // array
console.log(result.results.branch_results); // array

// Batch calculate (multiple methods)
const batch = await PowerFlowApp.batchCalculate([
  ANALYSIS_METHODS.DC,
  ANALYSIS_METHODS.FNSL
]);
console.log(batch.dc);
console.log(batch.fnsl);

// Get cached results
const cached = await PowerFlowApp.getResults();

// Alias: solve = calculate
const result2 = await PowerFlowApp.solve(ANALYSIS_METHODS.DC);

// Batch solve (alias)
const batch2 = await PowerFlowApp.batchSolve([
  ANALYSIS_METHODS.DC,
  ANALYSIS_METHODS.FNSL
]);

// Compare analysis methods
const comparison = await PowerFlowApp.compareAnalysis([
  ANALYSIS_METHODS.DC,
  ANALYSIS_METHODS.FNSL
]);
console.log(comparison.methods.dc);
console.log(comparison.methods.fnsl);
console.log(comparison.summary.fastestMethod);
```

### Workflows

```javascript
// Upload and calculate in one step
const result = await PowerFlowApp.uploadAndCalculate(
  file,
  ANALYSIS_METHODS.DC
);

// With options
const result2 = await PowerFlowApp.uploadAndCalculate(
  file,
  ANALYSIS_METHODS.FNSL,
  {
    tolerance: 1e-3,
    maxIterations: 100
  }
);
```

### Configuration

```javascript
// Update configuration
PowerFlowApp.updateConfig({
  apiBaseURL: 'http://new-server:8080',
  timeout: 60000
});

// Get current config
const config = PowerFlowApp.getConfig();
console.log(config.apiBaseURL);
console.log(config.timeout);
console.log(config.logLevel);
```

### Events

```javascript
import { SDK_EVENTS } from '@/sdk';

// Subscribe to event
const unsubscribe = PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  console.log('Done!', data.results);
});

// Unsubscribe
unsubscribe();

// Or use off()
PowerFlowApp.off(SDK_EVENTS.CALCULATE_COMPLETE, handler);

// Listen once
PowerFlowApp.once(SDK_EVENTS.INITIALIZED, (data) => {
  console.log('Ready!');
});

// Remove all listeners
PowerFlowApp.removeAllListeners();

// Remove specific event listeners
PowerFlowApp.removeAllListeners(SDK_EVENTS.ERROR);

// All available events:
PowerFlowApp.on(SDK_EVENTS.INITIALIZED, handler);
PowerFlowApp.on(SDK_EVENTS.ERROR, handler);
PowerFlowApp.on(SDK_EVENTS.CALCULATE_START, handler);
PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, handler);
PowerFlowApp.on(SDK_EVENTS.CALCULATE_ERROR, handler);
PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handler);
PowerFlowApp.on(SDK_EVENTS.SESSION_CREATED, handler);
PowerFlowApp.on(SDK_EVENTS.SESSION_CLEARED, handler);
PowerFlowApp.on(SDK_EVENTS.SESSION_CHANGED, handler);
PowerFlowApp.on(SDK_EVENTS.EDIT_START, handler);
PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, handler);
PowerFlowApp.on(SDK_EVENTS.EDIT_ERROR, handler);
PowerFlowApp.on(SDK_EVENTS.FILE_DELETED, handler);
PowerFlowApp.on(SDK_EVENTS.HEALTH_CHECK, handler);
PowerFlowApp.on(SDK_EVENTS.RESET, handler);
PowerFlowApp.on(SDK_EVENTS.LOG, handler); // UI logs
```

### Logging

```javascript
// Listen to UI logs
PowerFlowApp.on(SDK_EVENTS.LOG, (logEntry) => {
  console.log(logEntry.timestamp); // ISO string
  console.log(logEntry.level);     // 'info' | 'success' | 'error' | 'warning'
  console.log(logEntry.message);   // Message text
});

// Internal SDK logging (in SDK code):
this.log('Operation complete', 'success');
this.log('Processing...', 'info');
this.log('Warning: something', 'warning');
this.log('Error occurred', 'error');
```

### Cleanup & Reset

```javascript
// Reset SDK to initial state
PowerFlowApp.reset();
// Clears session, cache, removes listeners, resets status

// Destroy SDK instance
PowerFlowApp.destroy();
// Complete cleanup, frees resources
```

### Multiple SDK Instances

```javascript
import { Xolution } from '@/sdk';

// Create separate instances
const sdk1 = new Xolution();
await sdk1.initialize({ userId: 'user1' });

const sdk2 = new Xolution();
await sdk2.initialize({ userId: 'user2' });

// Use independently
await sdk1.createSessionFromFile('network1.rawx');
await sdk2.createSessionFromFile('network2.rawx');

const result1 = await sdk1.calculate('dc');
const result2 = await sdk2.calculate('fnsl');
```

### Error Handling

```javascript
import { 
  SessionError, 
  SolveError, 
  NetworkError,
  ValidationError,
  InitializationError 
} from '@/sdk';

try {
  await PowerFlowApp.createSessionFromFile('network.rawx');
} catch (error) {
  if (error instanceof InitializationError) {
    console.error('SDK not initialized');
  } else if (error instanceof SessionError) {
    console.error('Session error:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network/API error:', error.message);
  } else if (error instanceof SolveError) {
    console.error('Calculation failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Invalid data:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

### React Hook

```javascript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';
import { ANALYSIS_METHODS } from '@/sdk';

function MyComponent() {
  const {
    initialized,
    connected,
    loading,
    error,
    sessionId,
    networkData,
    calculationResult,
    // Methods
    createSessionFromFile,
    uploadUserFile,
    getUserFiles,
    deleteUserFile,
    getNetwork,
    calculate,
    addElement,
    modifyElement,
    deleteElement,
    saveSessionToUserFile,
    uploadAndCalculate,
    checkHealth,
    clearError,
    resetSession,
    getCachedNetwork,
    getCachedCalculationResult,
    getAggregatedBuses,
    getAggregatedLines,
    // SDK instance
    sdk,
    // Constants
    ANALYSIS_METHODS,
    ELEMENT_TYPES
  } = usePowerFlowSDK({
    userId: 'demo_user',
    apiBaseURL: 'http://localhost:8080',
    autoInitialize: true
  });

  // Use state and methods
  if (!initialized) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const handleCalculate = async () => {
    await calculate(ANALYSIS_METHODS.DC);
  };

  return (
    <div>
      <p>Connected: {connected ? 'Yes' : 'No'}</p>
      <p>Session: {sessionId}</p>
      <button onClick={handleCalculate} disabled={loading}>
        Calculate
      </button>
    </div>
  );
}
```

---

## API Reference Summary

### Initialization
- `initialize(config)` - Initialize SDK
- `isConnected()` - Check connection status
- `checkHealth()` - Check backend health
- `getStatus()` - Get current status

### User File Management
- `uploadUserFile(file, userId?)` - Upload file to user folder
- `getUserFiles(userId?)` - Get list of user files
- `getUserFileInfo(fileName, userId?)` - Get file info
- `deleteUserFile(fileName, fileType?)` - Delete user file (fileType: 'model' | 'knowledge', default: 'model')

### Session Operations
- `createSessionFromFile(fileName, userId?)` - Create session from user file
- `getSessionInfo(sessionId?)` - Get session information
- `saveSessionToUserFile(sessionId?)` - Save session back to file
- `clearSession()` - Clear current session
- `getSession()` - Get current session ID

### Network Operations
- `getNetwork(sessionId?)` - Get network data
- `getCachedNetwork()` - Get cached network
- `updateCachedNetwork(data)` - Update cache
- `clearCache()` - Clear all cached data

### Edit Operations
- `addElement(type, data, options?)` - Add element
- `modifyElement(type, identifier, data, options?)` - Modify element
- `deleteElement(type, identifier, options?)` - Delete element

### Calculation Operations
- `calculate(method, options?)` - Run calculation
- `batchCalculate(methods, options?)` - Batch calculation
- `uploadAndCalculate(file, method, options?)` - Upload and calculate

### Configuration
- `updateConfig(config)` - Update configuration
- `getConfig()` - Get current configuration

### Cleanup
- `reset()` - Reset SDK to initial state
- `destroy()` - Destroy SDK instance

---

## Contributing

For architecture details and development guidelines, see the main project documentation.

**Xolution** - The soul of power flow analysis. 💫
