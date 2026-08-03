# XFlow SDK - Complete Documentation

Complete guide to using the XFlow Power Flow Analysis SDK with detailed examples and real-world use cases.

## Table of Contents

- [Overview](#overview)
- [SDK Structure](#sdk-structure)
- [Installation & Setup](#installation--setup)
- [Initialization](#initialization)
- [File Operations](#file-operations)
- [Session Management](#session-management)
- [Network Data Operations](#network-data-operations)
- [Power Flow Calculations](#power-flow-calculations)
- [Network Editing](#network-editing)
- [Events & Subscriptions](#events--subscriptions)
- [React Integration](#react-integration)
- [Error Handling](#error-handling)
- [Complete Examples](#complete-examples)
- [API Reference](#api-reference)

## Overview

The XFlow SDK (`PowerFlowApp`) is a singleton instance that provides a centralized API for all power flow operations. It handles:

- File upload/download/management
- Session lifecycle management
- Network data retrieval and caching
- Power flow calculations (DC, AC, Fast Decoupled)
- Network element editing (add, modify, delete)
- Event-driven architecture for real-time updates
- Automatic logging

**Location:** `src/sdk/index.js`  
**Import:** `import { PowerFlowApp } from '@/sdk';`

## SDK Structure

The XFlow SDK follows a modular architecture with clear separation of concerns. Understanding the structure helps with advanced usage and customization.

### Directory Structure

```
src/sdk/
├── index.js                 # Main entry point, exports PowerFlowApp singleton
├── Xolution.js             # Main SDK class (orchestrates all services)
│
├── core/                    # Core infrastructure components
│   ├── HttpClient.js       # HTTP client for API communication
│   └── SessionManager.js   # Session state management
│
├── services/                # Business logic services
│   ├── SessionService.js   # Session lifecycle operations
│   ├── AnalysisService.js  # Power flow calculations
│   └── EditService.js      # Network element editing
│
├── utils/                   # Utility modules
│   ├── EventEmitter.js     # Event system base class
│   ├── errors.js           # Custom error classes
│   └── dataAggregator.js   # Data aggregation utilities
│
├── types/                   # Type definitions and constants
│   ├── index.js            # Constants (ANALYSIS_METHODS, SDK_EVENTS, etc.)
│   ├── index.d.ts          # TypeScript definitions
│   └── powerFlow.d.ts      # Power flow type definitions
│
└── examples/               # Example code
    ├── complete-workflow.js
    └── logging-example.js
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PowerFlowApp                         │
│                  (Xolution Singleton)                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Core       │  │   Services    │  │    Utils      │ │
│  │              │  │               │  │               │ │
│  │ HttpClient   │  │ SessionService│  │ EventEmitter  │ │
│  │ SessionMgr   │  │ AnalysisSvc   │  │ Errors        │ │
│  │              │  │ EditService   │  │ DataAggregator│ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Public API Methods                    │ │
│  │  - initialize()  - uploadUserFile()                │ │
│  │  - solveFlow()   - addElement()                    │ │
│  │  - getNetwork()  - modifyElement()                 │ │
│  │  - on() / off()  - deleteElement()                 │ │
│  │  - getPowerFlowData()                              │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. **Xolution.js** (Main Class)

The main SDK class that orchestrates all services. It extends `EventEmitter` and provides the unified API.

**Key Responsibilities:**
- Initialization and configuration
- Service orchestration
- Event forwarding from services
- Cache management
- Public API methods

**Key Properties:**
```typescript
class Xolution {
  // Core components
  http: HttpClient;
  sessionManager: SessionManager;
  
  // Services
  sessions: SessionService;
  analysis: AnalysisService;
  edit: EditService;
  
  // State
  baseURL: string;
  userId: string;
  status: STATUS;
  connected: boolean;
  
  // Cached data
  networkData: NetworkData | null;
  calculationResult: CalculationResult | null;
}
```

#### 2. **HttpClient.js** (Core)

Handles all HTTP communication with the backend API.

**Key Methods:**
- `request(endpoint, options)` - Generic HTTP request
- `get(endpoint, params?)` - GET request
- `post(endpoint, data?)` - POST request
- `put(endpoint, data?)` - PUT request
- `delete(endpoint, data?)` - DELETE request
- `uploadFile(endpoint, file, onProgress?)` - File upload with progress

**Features:**
- Automatic error handling
- Request timeout
- Retry logic
- Progress tracking for file uploads

#### 3. **SessionManager.js** (Core)

Manages session state and persistence.

**Key Methods:**
- `getSessionId()` - Get current session ID
- `setSessionId(sessionId)` - Set session ID
- `clearSession()` - Clear session
- `hasSession()` - Check if session exists
- `setData(key, value)` - Store session data
- `getData(key)` - Retrieve session data
- `loadFromLocalStorage()` - Load persisted session
- `saveToLocalStorage()` - Persist session

**Features:**
- Session state management
- Optional localStorage persistence
- Event emission on session changes

### Services

#### 1. **SessionService.js**

Handles session lifecycle operations.

**Key Methods:**
- `createSessionFromFile(fileName)` - Create session from uploaded file
- `getSessionInfo(sessionId?)` - Get session information
- `saveSessionToUserFile()` - Save session to user file
- `uploadUserFile(file, fileType)` - Upload file to user folder
- `getUserFiles(fileType)` - Get list of user files
- `deleteUserFile(fileName, fileType)` - Delete user file

**Events Emitted:**
- `SESSION_CREATED`
- `SESSION_CHANGED`
- `FILE_DELETED`

#### 2. **AnalysisService.js**

Handles power flow calculations.

**Key Methods:**
- `solveFlow(method, options)` - Solve power flow calculation (returns status only)
- `getPowerFlowData(options)` - Get power flow calculation results (with optional filtering)
- `getResults(sessionId?)` - Get calculation results

**Supported Methods:**
- `'dc'` - DC power flow
- `'ac'` - AC power flow (Newton-Raphson)
- `'fast_decoupled'` - Fast Decoupled power flow

**Events Emitted:**
- `CALCULATE_START`
- `CALCULATE_COMPLETE`
- `CALCULATE_ERROR`

#### 3. **EditService.js**

Handles network element editing operations.

**Key Methods:**
- `editElement(elementType, action, options)` - Generic edit method
- `addElement(elementType, data)` - Add network element
- `modifyElement(elementType, identifier, data)` - Modify element
- `deleteElement(elementType, identifier)` - Delete element

**Supported Element Types:**
- `'bus'` - Bus
- `'load'` - Load
- `'generator'` - Generator
- `'acline'` - AC transmission line
- `'transformer'` - Transformer
- `'fixshunt'` - Fixed shunt
- `'swshunt'` - Switched shunt

**Events Emitted:**
- `EDIT_START`
- `EDIT_COMPLETE`
- `EDIT_ERROR`

### Utilities

#### 1. **EventEmitter.js**

Base class for event-driven architecture. All services extend this.

**Key Methods:**
- `on(event, handler)` - Subscribe to event
- `off(event, handler)` - Unsubscribe from event
- `emit(event, data)` - Emit event
- `once(event, handler)` - Subscribe to event once

**Usage:**
```typescript
// All services extend EventEmitter
class MyService extends EventEmitter {
  doSomething() {
    this.emit('something:done', { result: 'success' });
  }
}
```

#### 2. **errors.js**

Custom error classes for better error handling.

**Error Classes:**
- `SDKError` - Base error class
- `InitializationError` - SDK initialization errors
- `SessionError` - Session-related errors
- `ValidationError` - Input validation errors
- `SolveError` - Calculation errors
- `NetworkError` - Network/HTTP errors

**Usage:**
```typescript
try {
  await PowerFlowApp.solveFlow('dc');
} catch (error) {
  if (error instanceof SolveError) {
    console.error('Calculation failed:', error.message);
  }
}
```

#### 3. **dataAggregator.js**

Utilities for aggregating calculation results with network data.

**Key Functions:**
- `aggregateNetworkData(networkData, calculationResult)` - Aggregate all data
- `aggregateBusData(busData, busResults)` - Aggregate bus data
- `aggregateAclineData(aclineData, branchResults)` - Aggregate line data
- `getAggregatedBuses(networkData, calculationResult)` - Get aggregated buses
- `getAggregatedLines(networkData, calculationResult)` - Get aggregated lines

### Types and Constants

Located in `src/sdk/types/index.js`:

**Constants:**
- `ANALYSIS_METHODS` - Power flow calculation methods
- `SDK_EVENTS` - Event type constants
- `API_ENDPOINTS` - Backend API endpoints
- `STATUS` - SDK status codes
- `ERROR_CODES` - Error code constants
- `DEFAULT_CONFIG` - Default configuration values

**Usage:**
```typescript
import { ANALYSIS_METHODS, SDK_EVENTS } from '@/sdk';

// Use constants instead of strings
await PowerFlowApp.solveFlow(ANALYSIS_METHODS.DC);

PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  console.log('Calculation complete');
});
```

### Data Flow

```
User Code
    ↓
PowerFlowApp (Xolution)
    ↓
Service Layer (SessionService, AnalysisService, EditService)
    ↓
Core Layer (HttpClient, SessionManager)
    ↓
Backend API
    ↓
Response
    ↓
Cache Update
    ↓
Event Emission
    ↓
User Code (via event listeners)
```

### Example: Understanding the Flow

When you call `PowerFlowApp.solveFlow('dc')`:

1. **Xolution.solveFlow()** receives the call
2. **AnalysisService.solveFlow()** is invoked
3. **HttpClient.post()** sends request to backend
4. **SessionManager.getSessionId()** provides session ID
5. Response is received and parsed (status only, no full results)
6. **Xolution** updates `calculationStatus` cache
7. **AnalysisService** emits `CALCULATE_COMPLETE` event
8. **Xolution** forwards event to subscribers
9. Your event handler receives the status

To get the actual results, call `PowerFlowApp.getPowerFlowData()` separately.

### Advanced Usage

#### Accessing Internal Services

For advanced use cases, you can access internal services directly:

```typescript
// Access HTTP client
const httpClient = PowerFlowApp.http;

// Access session manager
const sessionManager = PowerFlowApp.sessionManager;

// Access services
const analysisService = PowerFlowApp.analysis;
const editService = PowerFlowApp.edit;
const sessionService = PowerFlowApp.sessions;
```

**Note:** Direct access to internal services is not recommended for most use cases. Use the public API methods instead.

#### Creating Multiple SDK Instances

For advanced scenarios, you can create multiple SDK instances:

```typescript
import { Xolution } from '@/sdk';

// Create additional instances
const sdk1 = new Xolution();
const sdk2 = new Xolution();

await sdk1.initialize({ userId: 'user1' });
await sdk2.initialize({ userId: 'user2' });
```

**Note:** The singleton `PowerFlowApp` is sufficient for most use cases.

### Module Exports

The SDK exports the following from `src/sdk/index.js`:

**Main Export:**
- `PowerFlowApp` - Singleton SDK instance (default and named export)
- `Xolution` - SDK class (for advanced usage)

**Constants:**
- `ANALYSIS_METHODS`
- `SDK_EVENTS`
- `API_ENDPOINTS`
- `STATUS`
- `ERROR_CODES`
- `ELEMENT_TYPES`
- `EDIT_ACTIONS`

**Error Classes:**
- `SDKError`
- `InitializationError`
- `SolveError`
- `NetworkError`
- `SessionError`
- `ValidationError`

**Utilities:**
- `EventEmitter`
- `aggregateNetworkData`
- `aggregateBusData`
- `aggregateAclineData`
- `getAggregatedBuses`
- `getAggregatedLines`

**Core Components:**
- `HttpClient`
- `SessionManager`

**Services:**
- `SessionService`
- `AnalysisService`
- `EditService`

### File Locations Reference

| Component | File Path |
|-----------|-----------|
| Main Entry | `src/sdk/index.js` |
| Main Class | `src/sdk/Xolution.js` |
| HTTP Client | `src/sdk/core/HttpClient.js` |
| Session Manager | `src/sdk/core/SessionManager.js` |
| Session Service | `src/sdk/services/SessionService.js` |
| Analysis Service | `src/sdk/services/AnalysisService.js` |
| Edit Service | `src/sdk/services/EditService.js` |
| Event Emitter | `src/sdk/utils/EventEmitter.js` |
| Errors | `src/sdk/utils/errors.js` |
| Data Aggregator | `src/sdk/utils/dataAggregator.js` |
| Types/Constants | `src/sdk/types/index.js` |

## Installation & Setup

The SDK is already included in the project. No additional installation needed.

### Import Paths

```typescript
// Recommended: Use path alias
import { PowerFlowApp } from '@/sdk';

// Alternative: Relative path
import { PowerFlowApp } from '../sdk';

// Import constants and types
import { 
  PowerFlowApp,
  ANALYSIS_METHODS,
  ELEMENT_TYPES,
  SDK_EVENTS,
  STATUS,
  ERROR_CODES
} from '@/sdk';
```

## Initialization

### Basic Initialization

Initialize the SDK once when your app starts (typically in `App.tsx` or via `usePowerFlowSDK`). In authenticated setups the React auth layer is responsible for obtaining and storing the JWT access token; the SDK reads that token and infers the backend `user_id` from the token claims.

```typescript
import { PowerFlowApp } from '@/sdk';

// In App.tsx or main component
useEffect(() => {
  const initSDK = async () => {
    try {
      const connected = await PowerFlowApp.initialize({
        apiBaseURL: window.API_BASE_URL || 'http://localhost:8080',
        // In authenticated flows, AuthProvider will later call updateConfig({ accessToken })
        logLevel: 'INFO',
        persistSession: false
      });
      
      if (connected) {
        console.log('SDK initialized successfully');
      } else {
        console.error('Failed to connect to backend');
      }
    } catch (error) {
      console.error('SDK initialization failed:', error);
    }
  };
  
  initSDK();
}, []);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiBaseURL` | string | `'http://localhost:8080'` | Backend API URL |
| `accessToken` | string | `undefined` | JWT access token; when provided, the SDK automatically attaches `Authorization: Bearer <token>` and infers `userId` from the token (`uid` / `sub` claims) |
| `userId` | string | `'anonymous'` | Optional override for user identifier (mainly for non-authenticated or legacy flows); in normal JWT-based flows you should not pass this manually |
| `logLevel` | string | `'INFO'` | Logging verbosity: `'NONE'`, `'ERROR'`, `'WARN'`, `'INFO'`, `'DEBUG'` |
| `persistSession` | boolean | `false` | Persist session to localStorage |

### Initialization Example with Error Handling

```typescript
async function initializeSDK() {
  try {
    await PowerFlowApp.initialize({
      apiBaseURL: window.API_BASE_URL,
      logLevel: 'INFO',
      persistSession: false
      // In the React app, AuthProvider will later call PowerFlowApp.updateConfig({ accessToken })
    });
    
    // Check connection status
    if (PowerFlowApp.isConnected()) {
      console.log('✅ Connected to backend');
      
      // Check backend health
      const health = await PowerFlowApp.checkHealth();
      console.log('Backend health:', health);
    } else {
      console.error('❌ Not connected to backend');
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    // Handle error (show notification, retry, etc.)
  }
}
```

## File Operations

### Upload File to User Folder

Upload files to the user's folder for later use:

```typescript
// Upload a model file (study case)
const handleFileUpload = async (file: File) => {
  try {
    const result = await PowerFlowApp.uploadUserFile(file, 'models');
    console.log('File uploaded:', result);
    // result: { message: "File uploaded successfully", fileName: "case9.rawx" }
  } catch (error) {
    console.error('Upload failed:', error);
  }
};

// Upload a knowledge base file
const handleKnowledgeUpload = async (file: File) => {
  try {
    const result = await PowerFlowApp.uploadUserFile(file, 'knowledge');
    console.log('Knowledge file uploaded:', result);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

**File Types:**
- `'models'` - Power flow study case files (.rawx, .raw)
- `'knowledge'` - Knowledge base files for AI Assistant

### Get User Files

Retrieve list of files in user's folder:

```typescript
// Get model files
const loadModelFiles = async () => {
  try {
    const response = await PowerFlowApp.getUserFiles('models');
    console.log('Model files:', response.files);
    // response: { files: ["case9.rawx", "case14.rawx", ...] }
    return response.files;
  } catch (error) {
    console.error('Failed to load files:', error);
  }
};

// Get knowledge base files
const loadKnowledgeFiles = async () => {
  try {
    const response = await PowerFlowApp.getUserFiles('knowledge');
    console.log('Knowledge files:', response.files);
    return response.files;
  } catch (error) {
    console.error('Failed to load knowledge files:', error);
  }
};
```

### Get File Information

Get metadata about a specific file:

```typescript
const getFileInfo = async (fileName: string) => {
  try {
    const info = await PowerFlowApp.getUserFileInfo(fileName);
    console.log('File info:', info);
    // info: { fileName: "case9.rawx", size: 12345, modified: "2024-01-01T00:00:00Z", ... }
    return info;
  } catch (error) {
    console.error('Failed to get file info:', error);
  }
};
```

### Delete User File

```typescript
const deleteFile = async (fileName: string) => {
  try {
    const result = await PowerFlowApp.deleteUserFile(fileName, 'models');
    console.log('File deleted:', result);
    // result: { message: "File deleted successfully" }
  } catch (error) {
    console.error('Delete failed:', error);
  }
};
```

### Download User File

```typescript
const downloadFile = async (fileName: string) => {
  try {
    const blob = await PowerFlowApp.downloadUserFile(fileName, 'knowledge');
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
  }
};
```

## Session Management

### Create Session from File

Create a working session from an uploaded file:

```typescript
const openFile = async (fileName: string) => {
  try {
    const result = await PowerFlowApp.createSessionFromFile(fileName);
    console.log('Session created:', result);
    // result: { session_id: "abc123", message: "Session created successfully" }
    
    // Get session ID
    const sessionId = PowerFlowApp.getSession();
    console.log('Current session:', sessionId);
  } catch (error) {
    console.error('Failed to open file:', error);
  }
};
```

### Get Session Information

```typescript
const getSessionInfo = async () => {
  try {
    const info = await PowerFlowApp.getSessionInfo();
    console.log('Session info:', info);
    // info: {
    //   id: "abc123",
    //   status: "active",
    //   method: "dc",
    //   converged: true,
    //   created_at: "2024-01-01T00:00:00Z",
    //   updated_at: "2024-01-01T00:00:00Z"
    // }
    return info;
  } catch (error) {
    console.error('Failed to get session info:', error);
  }
};
```

### Get Current Session ID

```typescript
const sessionId = PowerFlowApp.getSession();
console.log('Current session:', sessionId); // "abc123" or null
```

### Clear Session

```typescript
const clearSession = () => {
  PowerFlowApp.clearSession();
  PowerFlowApp.clearCache(); // Also clear cached data
  console.log('Session cleared');
};
```

### Save Session to User File

Save the current working session back to a user file:

```typescript
const saveFile = async () => {
  try {
    const result = await PowerFlowApp.saveSessionToUserFile();
    console.log('File saved:', result);
    // result: { message: "File saved successfully", fileName: "case9.rawx" }
  } catch (error) {
    console.error('Save failed:', error);
  }
};
```

## Network Data Operations

### Get Network Data

Retrieve the complete network data for the current session:

```typescript
const loadNetworkData = async () => {
  try {
    const network = await PowerFlowApp.getNetwork();
    console.log('Network data:', network);
    
    // Access network elements
    const buses = network.network_data.bus || [];
    const lines = network.network_data.acline || [];
    const generators = network.network_data.generator || [];
    const loads = network.network_data.load || [];
    const transformers = network.network_data.transformer || [];
    
    console.log(`Network has ${buses.length} buses, ${lines.length} lines`);
    return network;
  } catch (error) {
    console.error('Failed to load network:', error);
  }
};
```

**Network Data Structure:**
```typescript
interface NetworkData {
  network_data: {
    bus: Bus[];
    acline: Acline[];
    generator: Generator[];
    load: Load[];
    transformer: Transformer[];
    fixshunt?: FixShunt[];
    swshunt?: SwShunt[];
  };
}
```

### Get Cached Network (No API Call)

Use cached data to avoid unnecessary API calls:

```typescript
// Get cached network (fast, no API call)
const cachedNetwork = PowerFlowApp.getCachedNetwork();

if (cachedNetwork) {
  console.log('Using cached network data');
  const buses = cachedNetwork.network_data.bus || [];
} else {
  console.log('No cached data, loading from API...');
  const network = await PowerFlowApp.getNetwork();
}
```

### Example: Display Network Summary

```typescript
const displayNetworkSummary = () => {
  const network = PowerFlowApp.getCachedNetwork();
  
  if (!network) {
    console.log('No network data available');
    return;
  }
  
  const data = network.network_data;
  const summary = {
    buses: data.bus?.length || 0,
    lines: data.acline?.length || 0,
    generators: data.generator?.length || 0,
    loads: data.load?.length || 0,
    transformers: data.transformer?.length || 0,
  };
  
  console.log('Network Summary:', summary);
  return summary;
};
```

## Power Flow Calculations

### Run DC Power Flow

```typescript
const runDCCalculation = async () => {
  try {
    // Solve power flow
    const status = await PowerFlowApp.solveFlow('dc');
    
    // Get power flow results
    const results = await PowerFlowApp.getPowerFlowData();
    
    console.log('DC Calculation Status:');
    console.log('Convergedd:', status.converged);
    console.log('Success:', status.success);
    
    if (results) {
      console.log('Solution time:', results.results?.solution_time_ms, 'ms');
      console.log('Iterations:', results.results?.iterations);
      console.log('Bus results:', results.results?.bus_results);
      console.log('Branch results:', results.results?.branch_results);
    }
    
    return { status, results };
  } catch (error) {
    console.error('DC calculation failed:', error);
    throw error;
  }
};
```

### Run AC Power Flow with Options

```typescript
const runACCalculation = async () => {
  try {
    const status = await PowerFlowApp.solveFlow('ac', {
      tolerance: 1e-6,        // Convergednce tolerance
      maxIterations: 100,     // Maximum iterations
    });
    
    const results = await PowerFlowApp.getPowerFlowData();
    
    if (status.converged) {
      console.log('✅ AC Power Flow converged');
      console.log('Iterations:', results?.results?.iterations);
      console.log('Time:', results?.results?.solution_time_ms, 'ms');
    } else {
      console.warn('⚠️ AC Power Flow did not converge');
      console.log('Iterations:', results?.results?.iterations);
    }
    
    return { status, results };
  } catch (error) {
    console.error('AC calculation failed:', error);
    throw error;
  }
};
```

### Get Calculation Results

```typescript
// Get cached calculation results (no API call)
const getResults = () => {
  const cached = PowerFlowApp.getCachedCalculationResult();
  
  if (cached) {
    console.log('Cached results:', cached);
    return cached;
  } else {
    console.log('No cached results available');
    return null;
  }
};
```

### Calculation Results Structure

```typescript
interface CalculationResult {
  results: {
    converged: boolean;
    solution_time_ms: number;
    iterations?: number;
    bus_results: BusResult[];
    branch_results: BranchResult[];
    system_summary?: {
      total_load_mw: number;
      total_generation_mw: number;
      total_losses_mw: number;
      efficiency_percent: number;
    };
  };
}

interface BusResult {
  ibus: number;
  vm: number;        // Voltage magnitude (pu)
  va: number;        // Voltage angle (degrees)
  pg?: number;       // Real power generation (MW)
  qg?: number;       // Reactive power generation (MVar)
  pl?: number;       // Real power load (MW)
  ql?: number;       // Reactive power load (MVar)
}

interface BranchResult {
  ibus: number;
  jbus: number;
  ckt: string;
  p_flow: number;   // Real power flow (MW)
  q_flow: number;   // Reactive power flow (MVar)
  p_loss: number;   // Real power loss (MW)
  q_loss: number;   // Reactive power loss (MVar)
}
```

### Example: Compare DC vs AC Results

```typescript
const compareMethods = async () => {
  try {
    // Run DC calculation
    const dcStatus = await PowerFlowApp.solveFlow('dc');
    const dcResults = await PowerFlowApp.getPowerFlowData();
    console.log('DC Results:', {
      converged: dcStatus.converged,
      time: dcResults?.results?.solution_time_ms,
    });
    
    // Run AC calculation
    const acStatus = await PowerFlowApp.solveFlow('ac');
    const acResults = await PowerFlowApp.getPowerFlowData();
    console.log('AC Results:', {
      converged: acStatus.converged,
      time: acResults?.results?.solution_time_ms,
      iterations: acResults?.results?.iterations,
    });
    
    // Compare bus voltages
    const dcBus1 = dcResults?.results?.bus_results?.[0];
    const acBus1 = acResults?.results?.bus_results?.[0];
    
    if (dcBus1 && acBus1) {
      console.log('Bus 1 Comparison:');
      console.log(`DC Voltage: ${dcBus1.vm.toFixed(4)} pu`);
      console.log(`AC Voltage: ${acBus1.vm.toFixed(4)} pu`);
      console.log(`Difference: ${Math.abs(dcBus1.vm - acBus1.vm).toFixed(4)} pu`);
    }
  } catch (error) {
    console.error('Comparison failed:', error);
  }
};
```

## Network Editing

### Add Elements

Add new network elements to the current session:

#### Add a Bus

```typescript
import { ELEMENT_TYPES } from '@/sdk';

const addBus = async () => {
  try {
    const busData = {
      ibus: 99999,           // Bus number (must be unique)
      name: 'NEW_BUS',       // Bus name
      baskv: 230.0,          // Base voltage (kV)
      ide: 1,                // Bus type (1=PQ, 2=PV, 3=Slack)
      area: 1,               // Area number
      zone: 1,               // Zone number
      owner: 1,              // Owner number
      vm: 1.0,               // Initial voltage magnitude (pu)
      va: 0.0,               // Initial voltage angle (degrees)
      nvhi: 1.05,            // Normal voltage high limit (pu)
      nvlo: 0.95,            // Normal voltage low limit (pu)
      evhi: 1.10,            // Emergency voltage high limit (pu)
      evlo: 0.90,            // Emergency voltage low limit (pu)
    };
    
    const result = await PowerFlowApp.addElement('bus', busData);
    console.log('Bus added:', result);
    
    // Network is automatically updated
    const updatedNetwork = PowerFlowApp.getCachedNetwork();
    console.log('Updated network has', updatedNetwork.network_data.bus.length, 'buses');
  } catch (error) {
    console.error('Failed to add bus:', error);
  }
};
```

#### Add a Load

```typescript
const addLoad = async (busNumber: number) => {
  try {
    const loadData = {
      ibus: busNumber,       // Bus number
      loadid: '1',           // Load ID (unique per bus)
      stat: 1,               // Status (0=inactive, 1=active)
      pl: 100.0,             // Real power load (MW)
      ql: 50.0,              // Reactive power load (MVar)
      area: 1,
      zone: 1,
      owner: 1,
    };
    
    await PowerFlowApp.addElement('load', loadData);
    console.log(`Load added to bus ${busNumber}`);
  } catch (error) {
    console.error('Failed to add load:', error);
  }
};
```

#### Add a Generator

```typescript
const addGenerator = async (busNumber: number) => {
  try {
    const genData = {
      ibus: busNumber,       // Bus number
      machid: '1',           // Machine ID (unique per bus)
      pg: 150.0,            // Real power generation (MW)
      qg: 75.0,             // Reactive power generation (MVar)
      qt: 100.0,            // Maximum reactive power (MVar)
      qb: -50.0,             // Minimum reactive power (MVar)
      vs: 1.0,               // Voltage setpoint (pu)
      stat: 1,               // Status (0=offline, 1=online)
      mbase: 100.0,          // Machine base MVA
      rmpct: 100.0,          // Pmax base percentage
      pt: 200.0,             // Maximum real power (MW)
      pb: 0.0,               // Minimum real power (MW)
    };
    
    await PowerFlowApp.addElement('generator', genData);
    console.log(`Generator added to bus ${busNumber}`);
  } catch (error) {
    console.error('Failed to add generator:', error);
  }
};
```

#### Add an AC Line

```typescript
const addACLine = async (fromBus: number, toBus: number) => {
  try {
    const lineData = {
      ibus: fromBus,         // From bus
      jbus: toBus,           // To bus
      ckt: '1',              // Circuit ID
      rpu: 0.01,             // Resistance (pu)
      xpu: 0.05,             // Reactance (pu)
      bpu: 0.001,            // Susceptance (pu)
      rate1: 100.0,          // Rating 1 (MVA)
      rate2: 150.0,          // Rating 2 (MVA)
      rate3: 200.0,          // Rating 3 (MVA)
      stat: 1,               // Status (0=out of service, 1=in service)
      met: 1,                // Metering end (1=bus I, 2=bus J)
      len: 10.0,             // Length (miles)
    };
    
    await PowerFlowApp.addElement('acline', lineData);
    console.log(`AC Line added from bus ${fromBus} to bus ${toBus}`);
  } catch (error) {
    console.error('Failed to add AC line:', error);
  }
};
```

### Modify Elements

Modify existing network elements:

#### Modify Bus Voltage

```typescript
const modifyBusVoltage = async (busNumber: number, newVoltage: number) => {
  try {
    const identifier = { ibus: busNumber };
    const newData = { vm: newVoltage };
    
    await PowerFlowApp.modifyElement('bus', identifier, newData);
    console.log(`Bus ${busNumber} voltage updated to ${newVoltage} pu`);
  } catch (error) {
    console.error('Failed to modify bus:', error);
  }
};
```

#### Modify Load Power

```typescript
const modifyLoadPower = async (busNumber: number, loadId: string, newPL: number, newQL: number) => {
  try {
    const identifier = { ibus: busNumber, loadid: loadId };
    const newData = { pl: newPL, ql: newQL };
    
    await PowerFlowApp.modifyElement('load', identifier, newData);
    console.log(`Load ${loadId} on bus ${busNumber} updated: P=${newPL}MW, Q=${newQL}MVar`);
  } catch (error) {
    console.error('Failed to modify load:', error);
  }
};
```

#### Modify Generator Output

```typescript
const modifyGeneratorOutput = async (busNumber: number, machId: string, newPG: number, newQG: number) => {
  try {
    const identifier = { ibus: busNumber, machid: machId };
    const newData = { pg: newPG, qg: newQG };
    
    await PowerFlowApp.modifyElement('generator', identifier, newData);
    console.log(`Generator ${machId} on bus ${busNumber} updated: P=${newPG}MW, Q=${newQG}MVar`);
  } catch (error) {
    console.error('Failed to modify generator:', error);
  }
};
```

#### Modify AC Line Impedance

```typescript
const modifyLineImpedance = async (fromBus: number, toBus: number, circuitId: string, newR: number, newX: number) => {
  try {
    const identifier = { ibus: fromBus, jbus: toBus, ckt: circuitId };
    const newData = { rpu: newR, xpu: newX };
    
    await PowerFlowApp.modifyElement('acline', identifier, newData);
    console.log(`Line ${fromBus}-${toBus} (${circuitId}) impedance updated`);
  } catch (error) {
    console.error('Failed to modify line:', error);
  }
};
```

### Delete Elements

Delete network elements:

#### Delete a Bus

```typescript
const deleteBus = async (busNumber: number) => {
  try {
    const identifier = { ibus: busNumber };
    await PowerFlowApp.deleteElement('bus', identifier);
    console.log(`Bus ${busNumber} deleted`);
  } catch (error) {
    console.error('Failed to delete bus:', error);
  }
};
```

#### Delete a Load

```typescript
const deleteLoad = async (busNumber: number, loadId: string) => {
  try {
    const identifier = { ibus: busNumber, loadid: loadId };
    await PowerFlowApp.deleteElement('load', identifier);
    console.log(`Load ${loadId} on bus ${busNumber} deleted`);
  } catch (error) {
    console.error('Failed to delete load:', error);
  }
};
```

#### Delete an AC Line

```typescript
const deleteACLine = async (fromBus: number, toBus: number, circuitId: string) => {
  try {
    const identifier = { ibus: fromBus, jbus: toBus, ckt: circuitId };
    await PowerFlowApp.deleteElement('acline', identifier);
    console.log(`Line ${fromBus}-${toBus} (${circuitId}) deleted`);
  } catch (error) {
    console.error('Failed to delete line:', error);
  }
};
```

### Element Identifiers

Each element type requires specific identifier fields:

| Element Type | Identifier Fields |
|--------------|-------------------|
| `bus` | `{ ibus: number }` |
| `load` | `{ ibus: number, loadid: string }` |
| `generator` | `{ ibus: number, machid: string }` |
| `acline` | `{ ibus: number, jbus: number, ckt: string }` |
| `transformer` | `{ ibus: number, jbus: number, kbus: number, ckt: string }` |
| `fixshunt` | `{ ibus: number, shntid: string }` |
| `swshunt` | `{ ibus: number, shntid: string }` |

### Element Schema

Get detailed metadata about element types for UI form generation and validation:

```typescript
// Get schema for an element type
const schema = PowerFlowApp.getElementSchema('load');

console.log(schema);
// {
//   elementType: 'load',
//   identifierKeys: ['ibus', 'loadid'],
//   dataKeys: ['pl', 'ql', 'stat', 'area', 'zone', ...],
//   description: 'Load at a bus...',
//   keyDescriptions: { pl: 'Active power demand (MW)', ql: 'Reactive power demand (Mvar)', ... },
//   exampleIdentifier: { ibus: 2, loadid: '1' },
//   exampleData: { pl: 100, ql: 50, stat: 1 },
//   defaultValues: { pl: 0, ql: 0, stat: 1, scale: 1.0, ... }
// }
```

**Use Cases:**

1. **SDK Cache Merging** - `identifierKeys` tell SDK how to match elements when updating partial network data
2. **UI Form Generation** - `dataKeys`, `keyDescriptions`, `defaultValues` for dynamic form creation
3. **User Guidance** - `description`, `exampleIdentifier`, `exampleData` help users understand required format

**Get All Supported Element Types:**

```typescript
const types = PowerFlowApp.getSupportedElementTypes();
// ['bus', 'load', 'generator', 'acline', 'transformer']
```

**Note:** The element schema is defined in `src/sdk/data/elementSchema.js` and serves as the single source of truth for element metadata in the frontend. The agent-server has its own independent schema for server-side tool execution.

## Events & Subscriptions

The SDK uses an event-driven architecture. Subscribe to events for real-time updates:

### Subscribe to Events

```typescript
import { SDK_EVENTS } from '@/sdk';

// Subscribe to calculation complete
const unsubscribe = PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  console.log('Calculation complete:', data);
  console.log('Convergedd:', data.results?.converged);
  console.log('Method:', data.method);
  console.log('Session:', data.sessionId);
});

// Later, unsubscribe
unsubscribe();
```

### Available Events

```typescript
// SDK Lifecycle
SDK_EVENTS.INITIALIZED        // SDK initialized
SDK_EVENTS.HEALTH_CHECK       // Health check result

// Session Events
SDK_EVENTS.SESSION_CREATED    // Session created
SDK_EVENTS.SESSION_CHANGED    // Session changed
SDK_EVENTS.SESSION_CLEARED    // Session cleared

// Calculation Events
SDK_EVENTS.CALCULATE_START    // Calculation started
SDK_EVENTS.CALCULATE_COMPLETE // Calculation completed
SDK_EVENTS.CALCULATE_ERROR    // Calculation error

// Edit Events
SDK_EVENTS.EDIT_START         // Edit operation started
SDK_EVENTS.EDIT_COMPLETE      // Edit operation completed
SDK_EVENTS.EDIT_ERROR        // Edit operation error

// Network Events
SDK_EVENTS.NETWORK_UPDATED    // Network data updated

// File Events
SDK_EVENTS.FILE_DELETED       // File deleted

// System Events
SDK_EVENTS.ERROR              // General error
SDK_EVENTS.RESET              // SDK reset
SDK_EVENTS.LOG                // Log message
```

### Example: React Component with Event Listeners

```typescript
import { useEffect } from 'react';
import { PowerFlowApp, SDK_EVENTS } from '@/sdk';

function MyComponent() {
  useEffect(() => {
    // Subscribe to events
    const handleCalculateComplete = (data: any) => {
      console.log('Calculation done!', data.results);
      // Update UI, show notification, etc.
    };
    
    const handleNetworkUpdated = (data: any) => {
      console.log('Network updated:', data);
      // Refresh network display
    };
    
    const handleEditComplete = (data: any) => {
      console.log('Edit complete:', data);
      // Update UI
    };
    
    PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, handleCalculateComplete);
    PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
    PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, handleEditComplete);
    
    // Cleanup
    return () => {
      PowerFlowApp.off(SDK_EVENTS.CALCULATE_COMPLETE, handleCalculateComplete);
      PowerFlowApp.off(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
      PowerFlowApp.off(SDK_EVENTS.EDIT_COMPLETE, handleEditComplete);
    };
  }, []);
  
  return <div>My Component</div>;
}
```

## React Integration

### Using the usePowerFlowSDK Hook

The recommended way to use the SDK in React components is via the `usePowerFlowSDK` hook, together with the app’s `AuthProvider`. The hook accepts the backend URL and (optionally) an access token; `userId` is **not** passed from React and is instead inferred from the JWT by the SDK.

```typescript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function PowerFlowComponent() {
  const {
    // State
    initialized,
    connected,
    loading,
    error,
    sessionId,
    networkData,
    calculationResult,
    
    // Actions
    solveFlow,
    getPowerFlowData,
    uploadUserFile,
    createSessionFromFile,
    addElement,
    modifyElement,
    deleteElement,
    
    // SDK instance (for advanced usage)
    sdk,
  } = usePowerFlowSDK({
    apiBaseURL: window.API_BASE_URL,
    // accessToken can be passed from AuthProvider if you are not using the shared hook integration.
    // In the main app, AuthProvider calls PowerFlowApp.updateConfig({ accessToken }) directly.
    autoInitialize: true
  });
  
  const handleCalculate = async () => {
    try {
      await solveFlow('dc');
    } catch (err) {
      console.error('Calculation failed:', err);
    }
  };
  
  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {networkData && (
        <div>
          <p>Buses: {networkData.network_data.bus.length}</p>
          <p>Lines: {networkData.network_data.acline.length}</p>
        </div>
      )}
      <button onClick={handleCalculate} disabled={loading}>
        Calculate
      </button>
    </div>
  );
}
```

### Hook State Properties

| Property | Type | Description |
|----------|------|-------------|
| `initialized` | boolean | SDK initialization status |
| `connected` | boolean | Backend connection status |
| `loading` | boolean | Operation in progress |
| `error` | string \| null | Last error message |
| `sessionId` | string \| null | Current session ID |
| `networkData` | NetworkData \| null | Current network data |
| `calculationResult` | CalculationResult \| null | Last calculation results |
| `sessionInfo` | SessionInfo \| null | Session information |

### Hook Action Methods

All actions automatically update the hook state:

- `initialize()` - Initialize SDK
- `uploadUserFile(file, fileType)` - Upload file
- `createSessionFromFile(fileName)` - Create session
- `getUserFiles(fileType)` - Get file list
- `deleteUserFile(fileName, fileType)` - Delete file
- `getNetwork()` - Load network data
- `calculate(method)` - Run calculation
- `addElement(type, data)` - Add element
- `modifyElement(type, identifier, data)` - Modify element
- `deleteElement(type, identifier)` - Delete element
- `saveSessionToUserFile()` - Save session
- `checkHealth()` - Check backend health
- `resetSession()` - Clear session

## Error Handling

### Error Types

The SDK throws specific error types:

```typescript
import { SDKError, InitializationError, SessionError, ValidationError, SolveError } from '@/sdk';

try {
  await PowerFlowApp.calculate('dc');
} catch (error) {
  if (error instanceof InitializationError) {
    console.error('SDK not initialized:', error.message);
  } else if (error instanceof SessionError) {
    console.error('Session error:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  } else if (error instanceof SolveError) {
    console.error('Calculation error:', error.message);
  } else if (error instanceof SDKError) {
    console.error('SDK error:', error.message);
    console.error('Error code:', error.code);
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Error Handling Example

```typescript
const safeCalculate = async (method: 'dc' | 'ac') => {
  try {
    // Check if SDK is initialized
    if (!PowerFlowApp.isConnected()) {
      throw new Error('SDK not connected. Initialize first.');
    }
    
    // Check if session exists
    const sessionId = PowerFlowApp.getSession();
    if (!sessionId) {
      throw new Error('No active session. Open a file first.');
    }
    
    // Run calculation
    const results = await PowerFlowApp.calculate(method);
    
    if (!results.results?.converged) {
      console.warn('Calculation did not converge');
    }
    
    return results;
  } catch (error: any) {
    // Handle different error types
    if (error.message?.includes('session')) {
      console.error('Session error - open a file first');
    } else if (error.message?.includes('network')) {
      console.error('Network error - check backend connection');
    } else {
      console.error('Calculation failed:', error.message);
    }
    throw error;
  }
};
```

## Complete Examples

### Example 1: Complete Workflow

Upload file, open session, run calculation, and display results:

```typescript
import { PowerFlowApp } from '@/sdk';

async function completeWorkflow(file: File) {
  try {
    // 1. Initialize SDK
    await PowerFlowApp.initialize({
      userId: 'user123',
      apiBaseURL: window.API_BASE_URL
    });
    
    // 2. Upload file
    await PowerFlowApp.uploadUserFile(file, 'models');
    console.log('File uploaded');
    
    // 3. Create session from file
    await PowerFlowApp.createSessionFromFile(file.name);
    console.log('Session created');
    
    // 4. Get network data
    const network = await PowerFlowApp.getNetwork();
    console.log(`Network loaded: ${network.network_data.bus.length} buses`);
    
    // 5. Run DC calculation
    const dcResults = await PowerFlowApp.calculate('dc');
    console.log('DC calculation complete:', dcResults.results?.converged);
    
    // 6. Run AC calculation
    const acResults = await PowerFlowApp.calculate('ac');
    console.log('AC calculation complete:', acResults.results?.converged);
    
    // 7. Display results
    if (dcResults.results?.bus_results) {
      dcResults.results.bus_results.forEach((bus: any) => {
        console.log(`Bus ${bus.ibus}: V=${bus.vm.toFixed(4)} pu, Angle=${bus.va.toFixed(2)}°`);
      });
    }
    
    // 8. Save session
    await PowerFlowApp.saveSessionToUserFile();
    console.log('Session saved');
    
    return { network, dcResults, acResults };
  } catch (error) {
    console.error('Workflow failed:', error);
    throw error;
  }
}
```

### Example 2: React Component - File Upload and Analysis

```typescript
import React, { useState } from 'react';
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function FileAnalysisComponent() {
  const {
    loading,
    error,
    networkData,
    calculationResult,
    uploadUserFile,
    createSessionFromFile,
    calculate,
  } = usePowerFlowSDK();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };
  
  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) return;
    
    try {
      // Upload file
      await uploadUserFile(selectedFile, 'models');
      
      // Create session
      await createSessionFromFile(selectedFile.name);
      
      // Run calculation
      await calculate('dc');
      
      console.log('Analysis complete!');
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };
  
  return (
    <div>
      <input type="file" onChange={handleFileSelect} accept=".rawx,.raw" />
      <button 
        onClick={handleUploadAndAnalyze} 
        disabled={!selectedFile || loading}
      >
        {loading ? 'Processing...' : 'Upload & Analyze'}
      </button>
      
      {error && <div className="error">Error: {error}</div>}
      
      {networkData && (
        <div>
          <h3>Network Summary</h3>
          <p>Buses: {networkData.network_data.bus.length}</p>
          <p>Lines: {networkData.network_data.acline.length}</p>
        </div>
      )}
      
      {calculationResult && (
        <div>
          <h3>Calculation Results</h3>
          <p>Convergedd: {calculationResult.results?.converged ? 'Yes' : 'No'}</p>
          <p>Time: {calculationResult.results?.solution_time_ms}ms</p>
        </div>
      )}
    </div>
  );
}
```

### Example 3: Network Editor Component

```typescript
import React, { useState } from 'react';
import { usePowerFlowSDK, ELEMENT_TYPES } from '@/hooks/usePowerFlowSDK';

function NetworkEditor() {
  const { networkData, addElement, modifyElement, deleteElement } = usePowerFlowSDK();
  const [selectedBus, setSelectedBus] = useState<number | null>(null);
  
  const handleAddBus = async () => {
    const busNumber = prompt('Enter bus number:');
    if (!busNumber) return;
    
    try {
      await addElement('bus', {
        ibus: parseInt(busNumber),
        name: `BUS_${busNumber}`,
        baskv: 230.0,
        ide: 1,
        vm: 1.0,
        va: 0.0,
      });
      console.log('Bus added');
    } catch (error) {
      console.error('Failed to add bus:', error);
    }
  };
  
  const handleModifyBusVoltage = async (busNumber: number) => {
    const newVoltage = prompt('Enter new voltage (pu):');
    if (!newVoltage) return;
    
    try {
      await modifyElement('bus', { ibus: busNumber }, { vm: parseFloat(newVoltage) });
      console.log('Bus voltage updated');
    } catch (error) {
      console.error('Failed to modify bus:', error);
    }
  };
  
  const handleDeleteBus = async (busNumber: number) => {
    if (!confirm(`Delete bus ${busNumber}?`)) return;
    
    try {
      await deleteElement('bus', { ibus: busNumber });
      console.log('Bus deleted');
    } catch (error) {
      console.error('Failed to delete bus:', error);
    }
  };
  
  return (
    <div>
      <button onClick={handleAddBus}>Add Bus</button>
      
      {networkData?.network_data.bus.map((bus: any) => (
        <div key={bus.ibus}>
          <span>Bus {bus.ibus}: {bus.name} - {bus.vm.toFixed(4)} pu</span>
          <button onClick={() => handleModifyBusVoltage(bus.ibus)}>Modify</button>
          <button onClick={() => handleDeleteBus(bus.ibus)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

### Example 4: Batch Operations

```typescript
const batchModifyLoads = async (loadChanges: Array<{bus: number, loadid: string, pl: number, ql: number}>) => {
  try {
    // Modify multiple loads
    for (const change of loadChanges) {
      await PowerFlowApp.modifyElement('load', 
        { ibus: change.bus, loadid: change.loadid },
        { pl: change.pl, ql: change.ql }
      );
    }
    
    console.log(`Modified ${loadChanges.length} loads`);
    
    // Recalculate after modifications
    // Solve power flow
    const status = await PowerFlowApp.solveFlow('dc');
    
    // Get power flow results
    const results = await PowerFlowApp.getPowerFlowData();
    console.log('Recalculation complete:', results.results?.converged);
    
  } catch (error) {
    console.error('Batch operation failed:', error);
  }
};
```

### Example 5: Upload and Calculate in One Step

```typescript
const quickAnalysis = async (file: File) => {
  try {
    // This method handles: upload -> create session -> calculate
    const results = await PowerFlowApp.uploadAndCalculate(file, 'dc');
    
    console.log('Quick analysis complete:');
    console.log('Convergedd:', results.results?.converged);
    console.log('Time:', results.results?.solution_time_ms, 'ms');
    
    return results;
  } catch (error) {
    console.error('Quick analysis failed:', error);
    throw error;
  }
};
```

## API Reference

### Core Methods

#### `PowerFlowApp.initialize(config)`

Initialize the SDK.

**Parameters:**
- `config.userId` (string, required) - User identifier
- `config.apiBaseURL` (string, optional) - Backend API URL
- `config.logLevel` (string, optional) - Logging level
- `config.persistSession` (boolean, optional) - Persist session

**Returns:** `Promise<boolean>` - `true` if connected successfully

#### `PowerFlowApp.uploadUserFile(file, fileType)`

Upload file to user folder.

**Parameters:**
- `file` (File, required) - File to upload
- `fileType` (string, optional) - `'models'` or `'knowledge'` (default: `'models'`)

**Returns:** `Promise<{message: string, fileName: string}>`

#### `PowerFlowApp.createSessionFromFile(fileName)`

Create session from uploaded file.

**Parameters:**
- `fileName` (string, required) - Name of uploaded file

**Returns:** `Promise<{session_id: string, message: string}>`

#### `PowerFlowApp.getNetwork(sessionId?)`

Get network data for session.

**Parameters:**
- `sessionId` (string, optional) - Session ID (uses current if not provided)

**Returns:** `Promise<NetworkData>`

#### `PowerFlowApp.calculate(method, options?)`

Run power flow calculation.

**Parameters:**
- `method` (string, required) - `'dc'`, `'ac'`, or `'fast_decoupled'`
- `options.tolerance` (number, optional) - Convergednce tolerance (default: 1e-6)
- `options.maxIterations` (number, optional) - Max iterations (default: 100)

**Returns:** `Promise<CalculationResult>`

#### `PowerFlowApp.addElement(elementType, data)`

Add network element.

**Parameters:**
- `elementType` (string, required) - Element type (see ELEMENT_TYPES)
- `data` (object, required) - Element data

**Returns:** `Promise<{message: string}>`

#### `PowerFlowApp.modifyElement(elementType, identifier, data)`

Modify network element.

**Parameters:**
- `elementType` (string, required) - Element type
- `identifier` (object, required) - Element identifier
- `data` (object, required) - New data

**Returns:** `Promise<{message: string}>`

#### `PowerFlowApp.deleteElement(elementType, identifier)`

Delete network element.

**Parameters:**
- `elementType` (string, required) - Element type
- `identifier` (object, required) - Element identifier

**Returns:** `Promise<{message: string}>`

### Utility Methods

```typescript
// Get current session ID
PowerFlowApp.getSession(): string | null

// Check connection status
PowerFlowApp.isConnected(): boolean

// Get base URL
PowerFlowApp.getBaseURL(): string

// Get cached network (no API call)
PowerFlowApp.getCachedNetwork(): NetworkData | null

// Get cached calculation result (no API call)
PowerFlowApp.getCachedCalculationResult(): CalculationResult | null

// Clear cache
PowerFlowApp.clearCache(): void

// Clear session
PowerFlowApp.clearSession(): void

// Check backend health
PowerFlowApp.checkHealth(): Promise<HealthStatus>

// Manual logging
PowerFlowApp.log(message: string, level: 'info' | 'success' | 'warning' | 'error'): void
```

### Constants

```typescript
// Analysis methods
ANALYSIS_METHODS.DC              // 'dc'
ANALYSIS_METHODS.AC              // 'ac'
ANALYSIS_METHODS.FAST_DECOUPLED  // 'fast_decoupled'

// Element types
ELEMENT_TYPES.BUS           // 'bus'
ELEMENT_TYPES.LOAD          // 'load'
ELEMENT_TYPES.GENERATOR     // 'generator'
ELEMENT_TYPES.ACLINE        // 'acline'
ELEMENT_TYPES.TRANSFORMER   // 'transformer'

// SDK Events (see Events section for full list)
SDK_EVENTS.INITIALIZED
SDK_EVENTS.CALCULATE_COMPLETE
SDK_EVENTS.EDIT_COMPLETE
// ... etc
```

## Best Practices

1. **Always initialize SDK first** - Call `initialize()` before any other operations
2. **Use the React hook** - Prefer `usePowerFlowSDK` over direct SDK calls in components
3. **Handle errors** - Wrap SDK calls in try-catch blocks
4. **Use cached data** - Use `getCachedNetwork()` when possible to avoid API calls
5. **Subscribe to events** - Use events for real-time updates instead of polling
6. **Clean up subscriptions** - Always unsubscribe from events in React cleanup
7. **Check session** - Verify session exists before calculations/edits
8. **Validate data** - Ensure element data matches expected format before adding/modifying

## Troubleshooting

### SDK not initialized

```typescript
if (!PowerFlowApp.isConnected()) {
  await PowerFlowApp.initialize({ userId: 'user123' });
}
```

### No session error

```typescript
const sessionId = PowerFlowApp.getSession();
if (!sessionId) {
  // Create session first
  await PowerFlowApp.createSessionFromFile('case9.rawx');
}
```

### Network data not updating

```typescript
// Subscribe to network update events
PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, (data) => {
  const network = PowerFlowApp.getCachedNetwork();
  // Update your component state
});
```

## See Also

- [LOGGING.md](./LOGGING.md) - Logging system details
- [API.md](./API.md) - Network and API documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Project architecture
- SDK source code: `src/sdk/`
- SDK examples: `src/sdk/examples/`
