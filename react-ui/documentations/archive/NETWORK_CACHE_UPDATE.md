# Network Data Cache Update Feature

## Overview
This feature allows the NetworkDataTable component to update the SDK's cached network data directly after table edits, without requiring an API call to refresh the data.

## Changes Made

### 1. SDK Core (`src/sdk/core/Xolution.js`)
Added a new method to manage cached network data:

#### `updateCachedNetwork(networkData)`
Updates the entire cached network data and emits a `NETWORK_UPDATED` event.
```javascript
PowerFlowApp.updateCachedNetwork(networkData);
```

### 2. SDK Events (`src/sdk/types/index.js` & `index.d.ts`)
Added new event type:
- `NETWORK_UPDATED: 'network:updated'` - Emitted when network data cache is updated

Also added missing events to TypeScript definitions:
- `FILE_DELETED: 'file:deleted'`
- `LOG: 'log'`

### 3. NetworkDataTable Component (`src/components/features/NetworkDataTable/NetworkDataTable.tsx`)
Updated the `handleSaveChanges` method to:
1. Call the API to save changes to the backend
2. Update the SDK's cached network data with the current table data
3. Notify parent component (optional)

```typescript
// Update SDK's cached network data directly with the current table data
if (networkData) {
  PowerFlowApp.updateCachedNetwork(networkData);
  console.log('SDK network cache updated with table data');
}

// Notify parent (if they want to do additional UI updates)
if (onDataUpdated) {
  onDataUpdated();
}
```

### 4. React Hook (`src/hooks/usePowerFlowSDK.ts`)
Added event listener for `NETWORK_UPDATED` event to automatically sync SDK cache updates with React state:

```typescript
const handleNetworkUpdated = (data: any) => {
  console.log('Network data updated in SDK:', data);
  const cachedNetwork = PowerFlowApp.getCachedNetwork();
  if (cachedNetwork) {
    setState(prev => ({ ...prev, networkData: cachedNetwork }));
  }
};

PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
```

## How It Works

1. **User edits data** in NetworkDataTable
2. **User clicks "Save Changes"**
3. **API calls are made** to update the backend (via `modifyElement`)
4. **SDK cache is updated** directly with the table's current data (via `updateCachedNetwork`)
5. **SDK emits** `NETWORK_UPDATED` event
6. **React hook listens** to the event and updates the React state
7. **UI automatically re-renders** with the updated data (no API call needed!)

## Benefits

1. **No API call needed** after edits - Saves bandwidth and reduces latency
2. **Immediate UI updates** - No waiting for network round trip
3. **Automatic sync** - React state stays in sync with SDK cache via events
4. **Centralized cache management** - Single source of truth in the SDK

## Data Flow

```
User Edit in Table
    ↓
API Call (modifyElement)
    ↓
Update SDK Cache (updateCachedNetwork)
    ↓
Emit NETWORK_UPDATED Event
    ↓
React Hook Updates State
    ↓
UI Re-renders
```

## Usage Example

```typescript
// In a component that needs to update network data
import { PowerFlowApp } from '../sdk';

// After making changes to network data locally
const updatedNetworkData = {
  network_data: {
    bus: [...],
    load: [...],
    // ... other elements
  }
};

// Update SDK cache without API call
PowerFlowApp.updateCachedNetwork(updatedNetworkData);

// React components using usePowerFlowSDK hook will automatically
// receive the updated data via the NETWORK_UPDATED event
```

## API Reference

### PowerFlowApp.updateCachedNetwork(networkData)
- **Parameters:** `networkData` - Complete network data object
- **Returns:** `void`
- **Emits:** `SDK_EVENTS.NETWORK_UPDATED`

### PowerFlowApp.getCachedNetwork()
- **Returns:** `NetworkData | null` - Cached network data

### SDK_EVENTS.NETWORK_UPDATED
Event emitted when network cache is updated.
- **Event data:** `{ networkData }`

