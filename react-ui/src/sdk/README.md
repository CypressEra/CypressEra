# XFlow SDK - Modular Architecture

Modern, type-safe SDK for Power Flow Analysis, fully integrated with XFlow API Server.

## Architecture

```
sdk/
├── index.js                    # Main entry point, exports
│
├── core/                       # Core SDK components
│   ├── Xolution.js            # Main SDK class (orchestrator)
│   ├── HttpClient.js          # HTTP communication layer
│   └── SessionManager.js      # Session state management
│
├── services/                   # Business logic services
│   ├── SessionService.js      # Session lifecycle & user file management
│   ├── EditService.js         # Network element editing
│   └── AnalysisService.js     # Power flow calculations
│
├── utils/                      # Utility modules
│   ├── EventEmitter.js        # Event system
│   ├── errors.js              # Custom error classes
│   └── logger.js              # Logging utility
│
└── types/                      # Constants and types
    └── index.js               # Type definitions, constants
```

## Design Principles

### 1. **Separation of Concerns**
Each module has a single, well-defined responsibility:
- `Xolution`: Orchestrates services, provides main API
- `HttpClient`: Handles all HTTP communication
- `SessionManager`: Manages session state
- `SessionService`: User file management & session lifecycle operations
- `EditService`: Network element editing (add, modify, delete)
- `AnalysisService`: Power flow calculations

### 2. **Composition**
The main SDK class composes smaller services:
```javascript
class Xolution {
  constructor() {
    this.http = new HttpClient();
    this.sessionManager = new SessionManager();
    this.sessions = new SessionService(this.http, this.sessionManager);
    this.analysis = new AnalysisService(this.http, this.sessionManager);
    this.edit = new EditService(this.http, this.sessionManager);
  }
}
```

### 3. **Event-Driven**
All components use the EventEmitter for loose coupling:
- Services emit events (e.g., SESSION_CHANGED, CALCULATE_COMPLETE)
- SDK forwards events to consumers
- React hooks (like usePowerFlowSDK) listen and update state automatically
- UI components react to state changes (no manual refresh needed)
- Works seamlessly whether called from UI or MCP
- Components don't know about each other

### 4. **Dependency Injection**
Services receive dependencies through constructor:
```javascript
new UploadService(httpClient, sessionManager)
```

### 5. **Error Handling**
Custom error classes for different failure modes:
- `InitializationError`
- `UploadError`
- `SolveError`
- `NetworkError`
- `SessionError`
- `ValidationError`

## Module Details

### Core

#### Xolution
Main orchestrator that:
- Initializes all services
- Provides the public API
- Forwards events from services
- Manages SDK lifecycle

#### HttpClient
HTTP communication layer that:
- Handles all fetch requests
- Manages base URL
- Provides GET, POST, PUT, DELETE methods
- Handles errors consistently

#### SessionManager
Session management that:
- Stores session ID
- Manages session data
- Optionally persists to localStorage
- Emits session events

### Services

#### SessionService
Session lifecycle management:
- Create sessions
- Get session information
- Get network data
- List user sessions
- Delete user sessions
- Save session to user file
- Save session as new user file (emits SESSION_CHANGED event for automatic state updates)

#### UploadService
File upload operations:
- Upload files to sessions
- Save temporary files
- Validate files before upload
- Track upload progress
- Handle upload errors

#### EditService
Network element editing:
- Add elements (bus, load, generator, acline, transformer)
- Modify existing elements
- Delete elements
- Convenience methods for each element type

#### AnalysisService
Power flow calculations:
- Solve power flow calculations (dc, fnsl, fdns) using `solveFlow()`
- Get power flow results with optional filtering using `getPowerFlowData()`
- Results are not automatically merged into network data

### Utils

#### EventEmitter
Lightweight event system:
- Subscribe/unsubscribe to events
- Emit events to listeners
- Once-only subscriptions
- Listener management

#### Logger
Centralized logging:
- Different log levels (ERROR, WARN, INFO, DEBUG)
- Formatted output with emojis
- Child loggers with prefixes
- Configurable log level

#### Errors
Custom error classes:
- Structured error information
- Error codes for programmatic handling
- Stack traces preserved
- Serializable to JSON

### Types

Constants and type definitions:
- Analysis methods
- Event names
- API endpoints
- Status codes
- Error codes
- Default configuration

## Usage

### Basic Usage

```javascript
import { PowerFlowApp, ANALYSIS_METHODS } from '@/sdk';

// Initialize
await PowerFlowApp.initialize({ userId: 'user123' });

// Create session
const sessionId = await PowerFlowApp.createSession();

// Upload
await PowerFlowApp.uploadFile(file, sessionId);

// Get network data
const network = await PowerFlowApp.getNetwork();

// Edit network (optional)
await PowerFlowApp.addElement('bus', { ibus: 99999, name: 'NEW BUS', baskv: 230.0 });

// Solve power flow
const status = await PowerFlowApp.solveFlow(ANALYSIS_METHODS.DC);

// Get power flow results
const results = await PowerFlowApp.getPowerFlowData();

// Save changes (optional)
await PowerFlowApp.saveFile({ action: 'overwrite' });
```

### Advanced Usage

```javascript
import {
  Xolution,
  ANALYSIS_METHODS,
  ELEMENT_TYPES,
  SDK_EVENTS,
  logger,
} from '@/sdk';

// Create custom instance
const sdk = new Xolution();

// Configure logging
logger.setLevel('DEBUG');

// Initialize with options
await sdk.initialize({
  userId: 'user123',
  apiBaseURL: 'http://localhost:8080',
  logLevel: 'DEBUG',
  persistSession: true,
  timeout: 60000,
});

// Listen to events
sdk.on(SDK_EVENTS.CALCULATE_COMPLETE, (data) => {
  console.log('Calculation done!', data.results);
});

// Access services directly
await sdk.sessions.create('user123');
await sdk.upload.upload(file);
await sdk.edit.addBus({ ibus: 99999, name: 'NEW BUS' });
await sdk.analysis.solveFlow(ANALYSIS_METHODS.FNSL);

// Batch calculation
const comparison = await sdk.compareAnalysis([
  ANALYSIS_METHODS.DC,
  ANALYSIS_METHODS.FNSL,
]);

// Complete workflow in one call
const result = await sdk.uploadAndCalculate(file, ANALYSIS_METHODS.DC);
```

### Custom Service

To add a new service:

```javascript
// services/ReportService.js
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
    const sessionId = this.session.getSessionId();
    // ... implementation
  }
}

// In Xolution.js, add:
import { ReportService } from '../services/ReportService.js';

class Xolution {
  constructor() {
    // ...
    this.report = new ReportService(this.http, this.session);
  }

  async generateReport(format) {
    this._ensureInitialized();
    return this.report.generateReport(format);
  }
}
```

## Benefits

### ✅ Maintainability
- Each module is small and focused
- Easy to find and fix bugs
- Clear responsibility boundaries

### ✅ Testability
- Each module can be tested independently
- Mock dependencies easily
- Unit test each service

### ✅ Scalability
- Easy to add new services
- Modules don't affect each other
- Can grow to 100+ services

### ✅ Reusability
- Services can be reused
- HttpClient works for any API
- EventEmitter is generic

### ✅ Type Safety
- TypeScript declarations included
- Constants prevent typos
- Error classes are type-safe

### ✅ Developer Experience
- Clear API surface
- Helpful logging
- Detailed error messages
- Auto-complete in IDEs

## Testing

### Unit Testing Example

```javascript
// __tests__/AnalysisService.test.js
import { AnalysisService } from '../services/AnalysisService';
import { SessionManager } from '../core/SessionManager';

describe('AnalysisService', () => {
  let service;
  let mockHttp;
  let mockSession;

  beforeEach(() => {
    mockHttp = {
      post: jest.fn(),
      get: jest.fn(),
    };
    mockSession = new SessionManager();
    mockSession.setSessionId('test-session');
    
    service = new AnalysisService(mockHttp, mockSession);
  });

  test('solve calls HTTP client with correct data', async () => {
    mockHttp.post.mockResolvedValue({ converged: true });
    
    await service.solve('dc');
    
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/solve',
      expect.objectContaining({
        method: 'dc',
        session_id: 'test-session',
      })
    );
  });
});
```

## API Server Integration

The SDK is fully integrated with the XFlow API Server:

| SDK Method | API Endpoint | Purpose |
|------------|--------------|---------|
| `createSession()` | `POST /api/v1/session` | Create session |
| `getSessionInfo()` | `POST /api/v1/session/info` | Get session info |
| `getNetwork()` | `POST /api/v1/session/network` | Get network data |
| `uploadFile()` | `POST /api/v1/upload` | Upload file |
| `saveFile()` | `POST /api/v1/save` | Save temp file |
| `editElement()` | `POST /api/v1/edit` | Edit network element |
| `solveFlow()` | `POST /api/v1/session/solve-flow` | Solve power flow |
| `getPowerFlowData()` | `POST /api/v1/session/powerflow` | Get power flow results |
| `getUserSessions()` | `POST /api/v1/user/session` | Get user sessions |
| `deleteUserSessions()` | `DELETE /api/v1/user/session` | Delete user sessions |
| `checkHealth()` | `GET /api/v1/health` | Health check |

## TypeScript Support

Full TypeScript definitions included:

```typescript
import { Xolution, CalculationResult, SessionInfo, NetworkData } from '@/sdk';

const sdk = new Xolution();
const result: CalculationResult = await sdk.calculate('dc');
const info: SessionInfo = await sdk.getSessionInfo();
const network: NetworkData = await sdk.getNetwork();
```

## Documentation

- **[SDK_GUIDE.md](./SDK_GUIDE.md)** - Complete usage guide with examples
- **[types/index.d.ts](./types/index.d.ts)** - TypeScript definitions
- **[API Reference](../../api-server/API_REFERENCE.md)** - API server endpoints

## Next Steps

1. Review [SDK_GUIDE.md](./SDK_GUIDE.md) for detailed examples
2. Check TypeScript definitions for autocomplete
3. Explore the API server integration
4. Customize logging levels as needed
5. Add tests for your specific use cases

This architecture will scale with your application!