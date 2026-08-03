# React SDK Integration Guide

## Overview

The React UI has been fully integrated with the XFlow SDK. All API calls now go through the SDK, providing a clean, type-safe, and maintainable architecture.

## What Changed

### ✅ New Custom Hook: `usePowerFlowSDK`

Location: `src/hooks/usePowerFlowSDK.ts`

A powerful React hook that wraps the SDK functionality and provides:
- Automatic initialization
- State management (loading, error, sessionId, etc.)
- Event listeners
- All SDK methods as React callbacks

### ✅ Updated App Component

Location: `src/App.tsx`

The main App component now:
- Uses the SDK hook instead of manual fetch calls
- Handles menu actions through the SDK
- Shows SDK status in development mode
- Provides better error handling

### ✅ Enhanced MenuBar

Location: `src/components/common/MenuBar/MenuBar.tsx`

The menu bar now:
- Shows real-time connection status
- Displays session status when active
- Shows loading indicator
- Connected to SDK functions

## Architecture

```
┌─────────────────────────────────────────┐
│           React Components              │
│                                         │
│  App.tsx → usePowerFlowSDK() Hook      │
│              ↓                          │
│         PowerFlowApp (SDK)              │
│              ↓                          │
│    SessionService, UploadService,       │
│    EditService, AnalysisService         │
│              ↓                          │
│         API Server (Go)                 │
└─────────────────────────────────────────┘
```

## Usage

### Basic Hook Usage

```typescript
import { usePowerFlowSDK } from './hooks/usePowerFlowSDK';

function MyComponent() {
  const {
    // State
    initialized,
    connected,
    loading,
    error,
    sessionId,
    currentFile,
    networkData,
    calculationResult,
    
    // Actions
    createSession,
    uploadFile,
    calculate,
    getNetwork,
    saveFile,
    
    // Constants
    ANALYSIS_METHODS,
    ELEMENT_TYPES,
  } = usePowerFlowSDK({
    userId: 'demo_user',
    apiBaseURL: 'http://localhost:8080',
    autoInitialize: true
  });

  // Use the hook methods
  const handleUpload = async (file: File) => {
    await createSession();
    await uploadFile(file);
  };

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

### Available Methods

#### Session Management
- `createSession()` - Create a new session
- `getSessionInfo()` - Get session details
- `resetSession()` - Clear session data

#### File Operations
- `uploadFile(file, sessionId?)` - Upload a file
- `saveFile(action, newName?)` - Save temp file
  - `action: 'overwrite'` - Replace original
  - `action: 'save_as'` - Save as new file

#### Network Operations
- `getNetwork()` - Get network data
- `addElement(type, data)` - Add element
- `modifyElement(type, identifier, data)` - Modify element
- `deleteElement(type, identifier)` - Delete element

#### Calculation
- `calculate(method)` - Run power flow
  - `method: 'dc' | 'ac' | 'fast_decoupled'`
- `uploadAndCalculate(file, method)` - Complete workflow

#### Utilities
- `checkHealth()` - Check server health
- `clearError()` - Clear error state

### State Properties

```typescript
{
  initialized: boolean;       // SDK initialized
  connected: boolean;          // Server connected
  loading: boolean;            // Operation in progress
  error: string | null;        // Error message
  sessionId: string | null;    // Current session ID
  currentFile: File | null;    // Uploaded file
  networkData: NetworkData | null;  // Network data
  calculationResult: CalculationResult | null;  // Results
  sessionInfo: SessionInfo | null;  // Session info
}
```

## Menu Bar Integration

The menu bar is now fully connected to SDK functions:

### File Menu
- **New Project** → `resetSession()`
- **Save** → `saveFile('overwrite')`
- **Export Results** → Downloads results as JSON

### Analysis Menu
- **DC Power Flow** → `calculate('dc')`
- **AC Power Flow** → `calculate('ac')`
- **Fast Decoupled** → `calculate('fast_decoupled')`
- **Run Analysis** → Uses current method

### View Menu
- **Network Diagram** → `getNetwork()`
- **Bus Results** → Shows bus results in console
- **Branch Results** → Shows branch results in console

## Status Indicators

The menu bar shows multiple status indicators:

### Connection Status
- 🟢 **Green** - Connected to server
- 🔴 **Red** - Disconnected
- 🟠 **Orange** - Checking connection

### Session Status
- 🟣 **Purple** - Session active (shows when session exists)

### Loading Status
- 🔵 **Blue** - Operation in progress (pulsing animation)

## Development Debug Panel

In development mode, a debug panel appears in the bottom-right corner showing:
- SDK initialization status
- Connection status
- Current session ID
- Uploaded file name
- Selected analysis method
- Current error (if any)

To disable: Remove the debug panel from `App.tsx` or set `NODE_ENV=production`

## Complete Workflow Example

```typescript
// 1. Auto-initialized on mount
const sdk = usePowerFlowSDK({ autoInitialize: true });

// 2. Upload file (creates session automatically)
await sdk.uploadFile(file);

// 3. Get network data
const network = await sdk.getNetwork();
console.log('Buses:', network.network_data.bus);

// 4. Edit network (optional)
await sdk.addElement('bus', {
  ibus: 99999,
  name: 'NEW BUS',
  baskv: 230.0
});

// 5. Run calculation
const result = await sdk.calculate('dc');
console.log('Converged:', result.results.converged);

// 6. Save changes
await sdk.saveFile('overwrite');

// 7. Export results
const json = JSON.stringify(result, null, 2);
// Download or display...
```

## Error Handling

```typescript
const sdk = usePowerFlowSDK();

// Errors are automatically captured in state
if (sdk.error) {
  console.error('SDK Error:', sdk.error);
  sdk.clearError(); // Clear when handled
}

// Or handle manually
try {
  await sdk.calculate('dc');
} catch (error) {
  console.error('Calculation failed:', error);
}
```

## Event Listeners

The hook automatically sets up event listeners for:
- `CALCULATE_COMPLETE` - Calculation finished
- `ERROR` - Any SDK error

To add custom listeners:

```typescript
import { PowerFlowApp, SDK_EVENTS } from './sdk';

useEffect(() => {
  const handler = (data) => {
    console.log('Upload complete:', data);
  };
  
  PowerFlowApp.on(SDK_EVENTS.UPLOAD_COMPLETE, handler);
  
  return () => {
    PowerFlowApp.off(SDK_EVENTS.UPLOAD_COMPLETE, handler);
  };
}, []);
```

## TypeScript Support

The hook is fully typed with TypeScript. Import types from the SDK:

```typescript
import type {
  CalculationResult,
  SessionInfo,
  NetworkData,
  UploadResult
} from './sdk/types/index';

const result: CalculationResult = await sdk.calculate('dc');
const info: SessionInfo = await sdk.getSessionInfo();
```

## Testing

### 1. Start API Server
```bash
cd api-server
./api-server
```

### 2. Start React UI
```bash
cd react-ui
npm start
```

### 3. Test Workflow
1. Open http://localhost:3000
2. Check connection status (should be green)
3. Upload a `.rawx` file
4. See session status appear (purple)
5. Click **Analysis** → **Run Analysis**
6. Check results in console or UI
7. Click **File** → **Save** to save changes

## Troubleshooting

### SDK not initializing
- Check API server is running on port 8080
- Check browser console for errors
- Verify `apiBaseURL` is correct

### Connection status stays red
- Ensure API server is running
- Check CORS settings
- Verify `/health` endpoint is accessible

### File upload fails
- Check file is `.rawx` format
- Verify session was created
- Check browser console for details

### Calculation fails
- Ensure file was uploaded successfully
- Check session has valid file
- Verify network data is parsed correctly

## Files Modified

### New Files
- `src/hooks/usePowerFlowSDK.ts` - Custom React hook
- `src/hooks/index.ts` - Hook exports
- `REACT_SDK_INTEGRATION.md` - This file

### Updated Files
- `src/App.tsx` - Uses SDK hook, removed fetch calls
- `src/components/common/MenuBar/MenuBar.tsx` - Added status props
- `src/components/common/MenuBar/MenuBar.css` - New status styles

## Best Practices

### 1. Use the Hook
Always use `usePowerFlowSDK()` hook instead of accessing SDK directly

### 2. Handle Loading States
```typescript
{sdk.loading && <LoadingSpinner />}
```

### 3. Handle Errors
```typescript
{sdk.error && <ErrorMessage error={sdk.error} />}
```

### 4. Check Connection
```typescript
{!sdk.connected && <ConnectionWarning />}
```

### 5. Validate Session
```typescript
if (!sdk.sessionId) {
  await sdk.createSession();
}
```

## Next Steps

1. **Add UI Components** for network visualization
2. **Display Results** in tables or charts
3. **Add Element Editor** using `addElement/modifyElement/deleteElement`
4. **Implement File Browser** to show uploaded files
5. **Add Export Options** for different formats
6. **Create Settings Panel** for SDK configuration

---

**Status**: ✅ Complete and ready to use

**Version**: 1.0.0

**Date**: October 2025
