# XFlow SDK - Migration Guide

Guide for migrating from monolithic to modular SDK architecture.

## 📊 Before & After

### Before: Monolithic (Single File)
```
src/services/xflow.js           348 lines
                                Everything in one file
                                Hard to maintain
                                Hard to test
                                Hard to extend
```

### After: Modular (10 Files)
```
src/sdk/                        1,333 lines total
├── index.js                    70 lines    (Entry point)
├── core/
│   ├── Xolution.js            280 lines   (Main orchestrator)
│   ├── HttpClient.js          120 lines   (HTTP layer)
│   └── SessionManager.js      140 lines   (Session management)
├── services/
│   ├── UploadService.js       150 lines   (Upload operations)
│   └── AnalysisService.js     200 lines   (Analysis operations)
├── utils/
│   ├── EventEmitter.js        85 lines    (Event system)
│   ├── errors.js              100 lines   (Error handling)
│   └── logger.js              90 lines    (Logging)
└── types/
    └── index.js               80 lines    (Constants)
```

## 🔄 Import Path Changes

### New Path (Required)
```javascript
// ✅ Use this - Old path has been removed
import { PowerFlowApp } from '@/sdk';
```

**Note**: The old `@/services/xflow` path has been removed. All code must now use `@/sdk`.

## 📝 API Changes

### Method Name Changes

| Old API | New API | Notes |
|---------|---------|-------|
| `PowerFlowApp.upload(file)` | `PowerFlowApp.uploadFile(file)` | More descriptive |
| Everything else | Same | No changes |

### Example Migration

**Before:**
```javascript
import { PowerFlowApp } from '@/services/xflow';

await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.upload(file);  // OLD
const results = await PowerFlowApp.solve('dc');
```

**After:**
```javascript
import { PowerFlowApp } from '@/sdk';  // NEW PATH

await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.uploadFile(file);  // NEW NAME
const results = await PowerFlowApp.solve('dc');
```

## 🎯 New Features

### 1. Use Constants Instead of Strings
```javascript
import { PowerFlowApp, ANALYSIS_METHODS, SDK_EVENTS } from '@/sdk';

// Before
await PowerFlowApp.solve('dc');

// After (more type-safe)
await PowerFlowApp.solve(ANALYSIS_METHODS.DC);

// Before
PowerFlowApp.on('solve:complete', callback);

// After (autocomplete works!)
PowerFlowApp.on(SDK_EVENTS.SOLVE_COMPLETE, callback);
```

### 2. Better Error Handling
```javascript
import { PowerFlowApp, SolveError, UploadError } from '@/sdk';

try {
  await PowerFlowApp.solve('dc');
} catch (error) {
  if (error instanceof SolveError) {
    console.error('Analysis error:', error.message);
    console.error('Error code:', error.code);
    console.error('Details:', error.details);
  } else if (error instanceof UploadError) {
    console.error('Upload error:', error.message);
  }
}
```

### 3. Configurable Logging
```javascript
import { PowerFlowApp, logger } from '@/sdk';

// Set log level
logger.setLevel('DEBUG');  // See all logs
logger.setLevel('WARN');   // Only warnings and errors

// Or during initialization
await PowerFlowApp.initialize({
  userId: 'user123',
  logLevel: 'DEBUG',
});
```

### 4. Session Persistence
```javascript
await PowerFlowApp.initialize({
  userId: 'user123',
  persistSession: true,  // Save session to localStorage
});

// Session automatically restored on next visit
```

### 5. Advanced: Multiple SDK Instances
```javascript
import { Xolution } from '@/sdk';

// Create separate instances
const prodSDK = new Xolution();
await prodSDK.initialize({ apiBaseURL: 'https://api.prod.com' });

const devSDK = new Xolution();
await devSDK.initialize({ apiBaseURL: 'http://localhost:8080' });
```

## 🔧 Configuration Options

### Old Configuration
```javascript
await PowerFlowApp.initialize({
  userId: 'user123',
  apiBaseURL: 'http://localhost:8080',
});
```

### New Configuration (More Options)
```javascript
await PowerFlowApp.initialize({
  userId: 'user123',
  apiBaseURL: 'http://localhost:8080',
  
  // NEW options
  logLevel: 'DEBUG',           // Control logging
  persistSession: true,        // Save to localStorage
  timeout: 60000,              // Request timeout (ms)
  retries: 3,                  // Number of retries
  retryDelay: 1000,            // Delay between retries (ms)
  autoReconnect: true,         // Auto-reconnect on disconnect
});
```

## 📚 Imports Available

### Before (Limited)
```javascript
import { PowerFlowApp, PowerFlowSDK } from '@/services/xflow';
```

### After (Rich Exports)
```javascript
// Main SDK
import { PowerFlowApp } from '@/sdk';

// For multiple instances
import { Xolution } from '@/sdk';

// Constants
import { 
  ANALYSIS_METHODS,
  SDK_EVENTS,
  API_ENDPOINTS,
  STATUS,
  ERROR_CODES 
} from '@/sdk';

// Error classes
import { 
  SDKError,
  InitializationError,
  UploadError,
  SolveError,
  NetworkError,
  SessionError,
  ValidationError 
} from '@/sdk';

// Utilities (advanced)
import { 
  EventEmitter,
  logger,
  Logger,
  LOG_LEVELS 
} from '@/sdk';

// Core components (advanced)
import { 
  HttpClient,
  SessionManager 
} from '@/sdk';

// Services (advanced)
import { 
  UploadService,
  AnalysisService 
} from '@/sdk';
```

## 🎨 Usage Patterns

### Pattern 1: Simple (No Changes)
```javascript
import { PowerFlowApp } from '@/sdk';

await PowerFlowApp.initialize({ userId: 'user123' });
const results = await PowerFlowApp.uploadAndSolve(file, 'dc');
```

### Pattern 2: With Constants
```javascript
import { PowerFlowApp, ANALYSIS_METHODS } from '@/sdk';

await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.uploadFile(file);
const results = await PowerFlowApp.solve(ANALYSIS_METHODS.AC);
```

### Pattern 3: With Events
```javascript
import { PowerFlowApp, SDK_EVENTS } from '@/sdk';

PowerFlowApp.on(SDK_EVENTS.UPLOAD_COMPLETE, (data) => {
  console.log('Uploaded:', data.sessionId);
});

PowerFlowApp.on(SDK_EVENTS.SOLVE_COMPLETE, (data) => {
  console.log('Results:', data.results);
});

await PowerFlowApp.initialize({ userId: 'user123' });
await PowerFlowApp.uploadFile(file);
await PowerFlowApp.solve('dc');
```

### Pattern 4: With Error Handling
```javascript
import { 
  PowerFlowApp, 
  UploadError, 
  SolveError,
  NetworkError 
} from '@/sdk';

try {
  await PowerFlowApp.uploadFile(file);
  await PowerFlowApp.solve('dc');
} catch (error) {
  if (error instanceof UploadError) {
    showError('Upload failed: ' + error.message);
  } else if (error instanceof SolveError) {
    showError('Analysis failed: ' + error.message);
  } else if (error instanceof NetworkError) {
    showError('Network error: ' + error.message);
  }
}
```

## ✅ Migration Checklist

- [ ] Update import paths from `@/services/xflow` to `@/sdk` (optional)
- [ ] Change `upload(file)` to `uploadFile(file)`
- [ ] Add constants for better type safety (optional)
- [ ] Add error handling with specific error classes (recommended)
- [ ] Configure logging level if needed (optional)
- [ ] Enable session persistence if needed (optional)
- [ ] Update tests to mock new modular structure

## 🧪 Testing Changes

### Before
```javascript
// Mock the entire xflow module
jest.mock('@/services/xflow');
```

### After (More Granular)
```javascript
// Mock specific services
jest.mock('@/sdk/services/UploadService');
jest.mock('@/sdk/services/AnalysisService');

// Or mock HTTP client
jest.mock('@/sdk/core/HttpClient');
```

## 📖 Documentation

- **Architecture**: [SDK_ARCHITECTURE.md](./SDK_ARCHITECTURE.md)
- **Usage Guide**: [XFLOW_SDK_GUIDE.md](./XFLOW_SDK_GUIDE.md)
- **Quick Reference**: [XFLOW_QUICK_REFERENCE.md](./XFLOW_QUICK_REFERENCE.md)
- **Module Details**: [src/sdk/README.md](./src/sdk/README.md)

## 🆘 Troubleshooting

### Issue: "Cannot find module '@/sdk'"

**Solution**: Make sure `tsconfig.json` has the path alias:
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "paths": {
      "@/sdk": ["sdk/index.js"],
      "@/sdk/*": ["sdk/*"]
    }
  }
}
```

### Issue: "upload is not a function"

**Solution**: Use `uploadFile` instead of `upload`:
```javascript
// Before
await PowerFlowApp.upload(file);

// After
await PowerFlowApp.uploadFile(file);
```

### Issue: TypeScript errors

**Solution**: The SDK includes TypeScript declarations. Make sure your editor can find them. Try restarting your TypeScript server.

## 💡 Benefits of Migrating

1. ✅ **Better organization** - Code split into logical modules
2. ✅ **Easier testing** - Mock individual services
3. ✅ **More features** - Constants, better errors, logging
4. ✅ **Type safety** - Use constants instead of strings
5. ✅ **Extensible** - Easy to add new services
6. ✅ **Maintainable** - Each module is small and focused

## 🎯 Recommended Migration Steps

1. **Keep using old import** initially (backward compatible)
2. **Update method names** (`upload` → `uploadFile`)
3. **Add constants** for type safety
4. **Add error handling** with specific error classes
5. **Switch to new import path** when ready
6. **Enjoy the benefits!** 🎉

No breaking changes if you keep using the old import path!