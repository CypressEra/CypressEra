# XFlow SDK - Modular Architecture

Complete guide to the modular, scalable SDK architecture.

## 🎯 Overview

The XFlow SDK has been refactored from a single monolithic file into a **modular, scalable architecture** with clear separation of concerns.

### Before (Monolithic)
```
src/services/xflow.js        # 348 lines, everything in one file
```

### After (Modular)
```
src/sdk/
├── index.js                  # Entry point (70 lines)
├── core/                     # Core components (3 files, ~500 lines)
├── services/                 # Business logic (2 files, ~400 lines)
├── utils/                    # Utilities (3 files, ~250 lines)
└── types/                    # Constants (1 file, ~80 lines)
```

## 📁 Architecture

```
src/sdk/
│
├── index.js                           # Main entry point & exports
│
├── core/                              # Core SDK components
│   ├── Xolution.js                   # Main orchestrator class
│   ├── HttpClient.js                 # HTTP communication layer  
│   └── SessionManager.js             # Session state management
│
├── services/                          # Business logic services
│   ├── UploadService.js              # File upload operations
│   └── AnalysisService.js            # Analysis operations
│
├── utils/                             # Utility modules
│   ├── EventEmitter.js               # Event system
│   ├── errors.js                     # Custom error classes
│   └── logger.js                     # Logging utility
│
└── types/                             # Type definitions
    └── index.js                      # Constants, event names, etc.
```

## 🧩 Module Details

### 1. Core Modules

#### `Xolution.js` - Main Orchestrator
**Purpose**: Composes all services and provides the main API

**Responsibilities**:
- Initialize all services
- Provide public API methods
- Forward events from services
- Manage SDK lifecycle
- Handle SDK state

**Key Methods**:
```javascript
initialize(config)          // Initialize SDK
uploadFile(file)           // Upload file
solve(method, options)     // Run analysis
getResults(sessionId)      // Get cached results
uploadAndSolve(file, method) // Upload + solve
batchSolve(methods)        // Run multiple methods
compareAnalysis(methods)   // Compare methods
```

#### `HttpClient.js` - HTTP Layer
**Purpose**: Handle all HTTP communication

**Responsibilities**:
- Make HTTP requests (GET, POST, PUT, DELETE)
- Handle errors consistently
- Manage base URL
- Add timeouts and retries

**Key Methods**:
```javascript
get(endpoint, options)
post(endpoint, data, options)
postFormData(endpoint, formData)
put(endpoint, data)
delete(endpoint)
ping(endpoint)  // Check if reachable
```

#### `SessionManager.js` - Session Management
**Purpose**: Manage session state

**Responsibilities**:
- Store session ID
- Manage session data
- Persist to localStorage (optional)
- Emit session events

**Key Methods**:
```javascript
getSessionId()
setSessionId(id)
clearSession()
setData(key, value)
getData(key)
saveToLocalStorage()
loadFromLocalStorage()
```

### 2. Service Modules

#### `UploadService.js` - Upload Operations
**Purpose**: Handle file uploads

**Responsibilities**:
- Upload files to backend
- Validate files before upload
- Track upload progress
- Emit upload events

**Key Methods**:
```javascript
upload(file, userId)
validateFile(file, options)
getProgress()
cancel()
```

#### `AnalysisService.js` - Analysis Operations
**Purpose**: Handle power flow analysis

**Responsibilities**:
- Run analysis with different methods
- Get cached results
- Batch analysis
- Compare methods

**Key Methods**:
```javascript
solve(method, options)
getResults(sessionId)
batchSolve(methods, options)
compareAnalysis(methods)
cancel()
```

### 3. Utility Modules

#### `EventEmitter.js` - Event System
**Purpose**: Provide event-driven architecture

**Features**:
- Subscribe/unsubscribe to events
- Once-only subscriptions
- Event forwarding
- Listener management

**Methods**:
```javascript
on(event, callback)         // Subscribe
once(event, callback)       // Subscribe once
off(event, callback)        // Unsubscribe
emit(event, data)           // Emit event
removeAllListeners(event)   // Clear listeners
listenerCount(event)        // Get count
```

#### `errors.js` - Error Handling
**Purpose**: Structured error handling

**Error Classes**:
- `SDKError` - Base error class
- `InitializationError` - SDK initialization failed
- `UploadError` - Upload operation failed
- `SolveError` - Analysis failed
- `NetworkError` - Network/HTTP error
- `SessionError` - Session-related error
- `ValidationError` - Input validation error

**Benefits**:
- Error codes for programmatic handling
- Detailed error information
- Serializable to JSON
- Stack traces preserved

#### `logger.js` - Logging
**Purpose**: Centralized logging

**Features**:
- Different log levels (ERROR, WARN, INFO, DEBUG)
- Formatted output with emojis
- Child loggers with prefixes
- Configurable at runtime

**Methods**:
```javascript
logger.error(message, ...args)
logger.warn(message, ...args)
logger.info(message, ...args)
logger.debug(message, ...args)
logger.success(message, ...args)
logger.setLevel(level)
logger.child(prefix)  // Create child logger
```

### 4. Type Definitions

#### `types/index.js` - Constants
**Purpose**: Centralize all constants

**Exports**:
- `ANALYSIS_METHODS` - dc, ac, fast_decoupled
- `SDK_EVENTS` - All event names
- `API_ENDPOINTS` - API paths
- `STATUS` - SDK status codes
- `ERROR_CODES` - Error codes
- `DEFAULT_CONFIG` - Default settings

**Benefits**:
- No magic strings
- Autocomplete support
- Type safety
- Single source of truth

## 🔄 Data Flow

```
User Code
   ↓
PowerFlowApp (Xolution instance)
   ↓
Service (Upload/Analysis)
   ↓
HttpClient
   ↓
Backend API
   ↓
Response flows back up
   ↓
Events emitted at each layer
```

## 🎨 Design Patterns

### 1. Composition Over Inheritance
```javascript
class Xolution {
  constructor() {
    // Compose services instead of inheriting
    this.http = new HttpClient();
    this.session = new SessionManager();
    this.upload = new UploadService(this.http, this.session);
    this.analysis = new AnalysisService(this.http, this.session);
  }
}
```

### 2. Dependency Injection
```javascript
// Services receive dependencies via constructor
class UploadService {
  constructor(httpClient, sessionManager) {
    this.http = httpClient;        // Injected
    this.session = sessionManager; // Injected
  }
}
```

### 3. Observer Pattern (Events)
```javascript
// Services emit events
service.emit('upload:complete', { sessionId });

// SDK forwards to consumers
sdk.on('upload:complete', (data) => {
  console.log(data.sessionId);
});
```

### 4. Singleton Pattern
```javascript
// Single instance exported
const PowerFlowApp = new Xolution();
export { PowerFlowApp };
export default PowerFlowApp;
```

### 5. Facade Pattern
```javascript
// Xolution provides simplified interface
// to complex internal services
class Xolution {
  async uploadFile(file) {
    return this.upload.upload(file, this.userId);
  }
}
```

## 📊 Benefits

### ✅ Maintainability
- **Small modules**: Each file < 250 lines
- **Single responsibility**: Each module has one job
- **Clear boundaries**: Easy to understand what each module does
- **Easy to modify**: Changes stay isolated

### ✅ Testability
- **Unit testable**: Each module tests independently
- **Mockable dependencies**: Easy to mock HttpClient, SessionManager
- **No side effects**: Pure functions where possible
- **Test coverage**: Can test each layer separately

### ✅ Scalability
- **Easy to extend**: Add new services without changing existing code
- **No coupling**: Services don't know about each other
- **Can grow large**: Architecture supports 100+ modules
- **Team friendly**: Different developers work on different modules

### ✅ Reusability
- **Generic utilities**: EventEmitter, Logger can be reused
- **Service composition**: Mix and match services
- **Portable**: HttpClient works with any API
- **Shareable**: Can extract to separate package

### ✅ Developer Experience
- **Clear API**: Public methods are obvious
- **Autocomplete**: Constants and types help IDEs
- **Helpful errors**: Custom error classes with details
- **Good logging**: See what's happening at each step
- **Self-documenting**: Code structure explains itself

## 📝 Usage Examples

### Basic Usage
```javascript
import { PowerFlowApp } from '@/sdk';

await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.uploadFile(file);
const results = await PowerFlowApp.solve('dc');
```

### With Constants
```javascript
import { PowerFlowApp, ANALYSIS_METHODS, SDK_EVENTS } from '@/sdk';

// Use constants instead of strings
await PowerFlowApp.solve(ANALYSIS_METHODS.AC);

// Listen to events
PowerFlowApp.on(SDK_EVENTS.SOLVE_COMPLETE, (data) => {
  console.log(data.results);
});
```

### Custom Configuration
```javascript
import { PowerFlowApp } from '@/sdk';

await PowerFlowApp.initialize({
  userId: 'user123',
  logLevel: 'DEBUG',           // See detailed logs
  persistSession: true,        // Save session to localStorage
  timeout: 60000,              // 60 second timeout
});
```

### Error Handling
```javascript
import { PowerFlowApp, UploadError, SolveError } from '@/sdk';

try {
  await PowerFlowApp.solve('dc');
} catch (error) {
  if (error instanceof SolveError) {
    console.error('Analysis failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Details:', error.details);
  }
}
```

### Multiple Instances (Advanced)
```javascript
import { Xolution } from '@/sdk';

// Create separate instances for different APIs
const prodSDK = new Xolution();
await prodSDK.initialize({ apiBaseURL: 'https://api.prod.com' });

const devSDK = new Xolution();
await devSDK.initialize({ apiBaseURL: 'http://localhost:8080' });
```

## 🔧 Extending the SDK

### Adding a New Service

1. **Create service file**:
```javascript
// src/sdk/services/ReportService.js
import { EventEmitter } from '../utils/EventEmitter.js';
import { logger } from '../utils/logger.js';

export class ReportService extends EventEmitter {
  constructor(httpClient, sessionManager) {
    super();
    this.http = httpClient;
    this.session = sessionManager;
    this.logger = logger.child('Report');
  }

  async generateReport(format = 'pdf') {
    this.logger.info('Generating report:', format);
    const sessionId = this.session.getSessionId();
    return this.http.post('/report', { sessionId, format });
  }
}
```

2. **Add to Xolution**:
```javascript
// src/sdk/core/Xolution.js
import { ReportService } from '../services/ReportService.js';

class Xolution {
  constructor() {
    // ... existing code
    this.report = new ReportService(this.http, this.session);
  }

  async generateReport(format) {
    this._ensureInitialized();
    return this.report.generateReport(format);
  }
}
```

3. **Export from index**:
```javascript
// src/sdk/index.js
export { ReportService } from './services/ReportService.js';
```

Done! Now you can use:
```javascript
await PowerFlowApp.generateReport('pdf');
```

### Adding Custom Events

1. **Add to types**:
```javascript
// src/sdk/types/index.js
export const SDK_EVENTS = {
  // ... existing events
  REPORT_START: 'report:start',
  REPORT_COMPLETE: 'report:complete',
};
```

2. **Emit from service**:
```javascript
this.emit(SDK_EVENTS.REPORT_START, { format });
```

3. **Listen in app**:
```javascript
PowerFlowApp.on('report:complete', (data) => {
  console.log('Report ready!', data);
});
```

## 🧪 Testing

### Unit Test Example
```javascript
// __tests__/AnalysisService.test.js
import { AnalysisService } from '../sdk/services/AnalysisService';
import { SessionManager } from '../sdk/core/SessionManager';

describe('AnalysisService', () => {
  let service, mockHttp, mockSession;

  beforeEach(() => {
    mockHttp = { post: jest.fn() };
    mockSession = new SessionManager();
    mockSession.setSessionId('test-123');
    service = new AnalysisService(mockHttp, mockSession);
  });

  test('solve emits start event', async () => {
    const startListener = jest.fn();
    service.on('solve:start', startListener);

    mockHttp.post.mockResolvedValue({ converged: true });
    await service.solve('dc');

    expect(startListener).toHaveBeenCalledWith({
      method: 'dc',
      sessionId: 'test-123',
    });
  });
});
```

## 📈 Performance

### Bundle Size
- **Modular**: ~1300 lines total (split across 10 files)
- **Organized**: Easy to tree-shake unused code
- **Efficient**: Load only what you need

### Runtime
- **Fast initialization**: Minimal setup
- **No overhead**: Event system is lightweight
- **Efficient HTTP**: Single HTTP client instance

## 🔄 Migration

### From Old API

Old (monolithic):
```javascript
import { PowerFlowApp } from '@/services/xflow';
await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.upload(file);  // OLD METHOD NAME
```

New (modular):
```javascript
import { PowerFlowApp } from '@/sdk';  // NEW PATH
await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.uploadFile(file);  // NEW METHOD NAME
```

**Note**: Old import path still works for backward compatibility!

## 📚 Documentation

- **Architecture**: [SDK_ARCHITECTURE.md](./SDK_ARCHITECTURE.md) (this file)
- **Usage Guide**: [XFLOW_SDK_GUIDE.md](./XFLOW_SDK_GUIDE.md)
- **Quick Reference**: [XFLOW_QUICK_REFERENCE.md](./XFLOW_QUICK_REFERENCE.md)
- **Module Details**: [src/sdk/README.md](./src/sdk/README.md)

## ✨ Summary

The modular architecture provides:
1. ✅ **Clear separation of concerns**
2. ✅ **Easy to test and maintain**
3. ✅ **Scalable to 100+ modules**
4. ✅ **Great developer experience**
5. ✅ **Production-ready and robust**

**Start using it:**
```javascript
import { PowerFlowApp } from '@/sdk';
```

See `src/sdk/README.md` for detailed module documentation!