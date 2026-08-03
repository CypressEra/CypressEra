# SDK Changelog

## Version 2.0.1 - Event-Driven State Updates (Latest)

### Improvements

1. **Event-Driven Save As Functionality**
   - `saveSessionAsUserFile()` now emits `SESSION_CHANGED` event automatically
   - `usePowerFlowSDK` hook listens and updates `sessionInfo` state automatically
   - UI components (NetworkView, ProjectExplorer) react to state changes
   - Works seamlessly whether called from UI or MCP
   - No manual state refresh needed - fully event-driven architecture

2. **File Overwrite Behavior**
   - `saveSessionAsUserFile()` now overwrites existing files instead of throwing errors
   - Frontend shows confirmation dialog before overwriting

## Version 2.0.0 - Complete Refactor (October 2025)

### Major Changes

#### 🎉 New Features

1. **SessionService** - New service for session management
   - `create(userId)` - Create new sessions
   - `getInfo(sessionId)` - Get session information
   - `getNetwork(sessionId, tempFileId)` - Get network data
   - `getUserSessions(userId)` - List all user sessions
   - `deleteUserSessions(userId)` - Delete user sessions

2. **EditService** - New service for network editing
   - `addElement(type, data)` - Add network elements
   - `modifyElement(type, identifier, data)` - Modify elements
   - `deleteElement(type, identifier)` - Delete elements
   - Convenience methods: `addBus()`, `modifyLoad()`, `deleteGenerator()`, etc.

3. **UploadService Enhancements**
   - `saveFile(options)` - Save temporary files
   - Support for temp file workflow
   - Proper session_id handling via query params

4. **AnalysisService Updates**
   - `calculate()` - New primary method (replaces `solve()`)
   - `batchCalculate()` - Batch calculations
   - Proper support for temp files
   - Better result formatting

#### 🔄 Breaking Changes

1. **API Endpoints**
   - All endpoints now include `/api/v1` prefix
   - Changed `/solve` → `/calculate`
   - Updated to match actual API server

2. **Upload Method Signature**
   ```javascript
   // OLD
   await sdk.uploadFile(file, userId);
   
   // NEW
   await sdk.uploadFile(file, sessionId);
   ```

3. **Session Management**
   - Renamed `session` → `sessionManager` (internal)
   - Added new `sessions` service for API operations
   - Sessions must be created explicitly before upload

4. **Workflow Changes**
   ```javascript
   // OLD
   await sdk.initialize({ userId: 'user' });
   await sdk.uploadFile(file);
   await sdk.solve('dc');
   
   // NEW
   await sdk.initialize({ userId: 'user' });
   const sessionId = await sdk.createSession();
   await sdk.uploadFile(file, sessionId);
   await sdk.calculate('dc');
   ```

#### ✨ Improvements

1. **Type Safety**
   - Full TypeScript definitions (`types/index.d.ts`)
   - Better autocomplete in IDEs
   - Type-safe API calls

2. **Event System**
   - New events: `CALCULATE_START`, `CALCULATE_COMPLETE`, `CALCULATE_ERROR`
   - New events: `EDIT_START`, `EDIT_COMPLETE`, `EDIT_ERROR`
   - New events: `SESSION_CREATED`

3. **Constants**
   - `ELEMENT_TYPES` - Network element types
   - `EDIT_ACTIONS` - Edit action types
   - Updated `API_ENDPOINTS` - All API endpoints

4. **Documentation**
   - New `SDK_GUIDE.md` - Complete usage guide
   - Updated `README.md` - Architecture overview
   - TypeScript definitions with JSDoc

#### 🐛 Bug Fixes

1. Fixed upload endpoint to use query parameter for `session_id`
2. Fixed calculation config format to match API server expectations
3. Fixed network data retrieval to use correct endpoint
4. Fixed temp file handling throughout the workflow

#### 📝 API Server Integration

The SDK now perfectly matches the API server:

| Feature | Endpoint | Status |
|---------|----------|--------|
| Create Session | `POST /api/v1/session` | ✅ Implemented |
| Get Session Info | `POST /api/v1/session/info` | ✅ Implemented |
| Get Network | `POST /api/v1/session/network` | ✅ Implemented |
| Upload File | `POST /api/v1/upload` | ✅ Implemented |
| Save File | `POST /api/v1/save` | ✅ Implemented |
| Edit Element | `POST /api/v1/edit` | ✅ Implemented |
| Calculate | `POST /api/v1/calculate` | ✅ Implemented |
| User Sessions | `POST /api/v1/user/session` | ✅ Implemented |
| Delete Sessions | `DELETE /api/v1/user/session` | ✅ Implemented |
| Health Check | `GET /api/v1/health` | ✅ Implemented |

### Migration Guide

#### Update Initialization

```javascript
// No changes needed
await PowerFlowApp.initialize({
  userId: 'demo_user',
  apiBaseURL: 'http://localhost:8080'
});
```

#### Update Workflow

```javascript
// 1. Create session first
const sessionId = await PowerFlowApp.createSession();

// 2. Upload with session ID
await PowerFlowApp.uploadFile(file, sessionId);

// 3. Use calculate() instead of solve()
const result = await PowerFlowApp.calculate('dc');
```

#### Update Event Listeners

```javascript
// Update event names
PowerFlowApp.on(SDK_EVENTS.CALCULATE_COMPLETE, handler); // was SOLVE_COMPLETE
```

#### Update Imports

```javascript
// Add new constants
import {
  PowerFlowApp,
  ANALYSIS_METHODS,
  ELEMENT_TYPES,  // NEW
  EDIT_ACTIONS,   // NEW
  SDK_EVENTS
} from '@/sdk';
```

### Backward Compatibility

The following methods are maintained for backward compatibility:

- `solve()` - Alias for `calculate()`
- `batchSolve()` - Alias for `batchCalculate()`

However, we recommend migrating to the new method names.

### Files Changed

#### New Files
- `services/SessionService.js` - Session lifecycle management
- `services/EditService.js` - Network element editing
- `types/index.d.ts` - TypeScript definitions
- `SDK_GUIDE.md` - Complete usage guide
- `CHANGELOG.md` - This file

#### Modified Files
- `core/Xolution.js` - Integrated new services, updated workflow
- `services/UploadService.js` - Added saveFile(), updated upload signature
- `services/AnalysisService.js` - Added calculate(), updated endpoints
- `types/index.js` - Updated API endpoints and events
- `index.js` - Export new services and constants
- `README.md` - Updated documentation

### Testing

To test the new SDK:

```bash
# Start API server
cd api-server
./api-server

# In another terminal, test the SDK
cd react-ui
npm start
```

### Next Steps

1. Read [SDK_GUIDE.md](./SDK_GUIDE.md) for detailed examples
2. Check TypeScript definitions for API details
3. Update your code to use the new workflow
4. Test all functionality with your API server

---

For questions or issues, please refer to the documentation or create an issue in the repository.
