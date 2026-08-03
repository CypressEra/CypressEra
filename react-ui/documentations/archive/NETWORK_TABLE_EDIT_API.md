# Network Data Table - Edit API Integration

## Overview
Added modify API integration to the NetworkDataTable component, allowing users to edit values and save changes to the backend via the SDK.

## Features Added

### 1. **Real-time Cell Editing**
- Click any cell to edit its value
- Input validation based on original data type (string, number)
- Visual feedback for edited cells (highlighted with orange gradient)
- Edit indicator dot on modified cells

### 2. **Change Tracking**
- Local state management for all pending changes
- Changes organized by element type and row index
- Change counter to show total pending modifications

### 3. **API Integration**
- Integrated with PowerFlowApp SDK's `modifyElement` method
- Automatic batching of changes by element type
- Identifier field extraction for each element type:
  - **Bus**: `ibus`
  - **Load**: `ibus`, `loadid`
  - **Generator**: `ibus`, `machid`
  - **AC Line**: `ibus`, `jbus`, `ckt`
  - **Transformer**: `ibus`, `jbus`, `ckt`
  - **Fixed Shunt**: `ibus`, `shntid`
  - **Switched Shunt**: `ibus`, `shntid`

### 4. **Floating Action Bar**
- Appears when there are pending changes
- Shows count of pending changes
- **Reset** button: Clears all changes and reloads data
- **Save Changes** button: Applies all modifications via API
- Error message display for failed save operations
- Loading state while saving

### 5. **User Experience**
- Smooth animations for action bar appearance/disappearance
- Disabled buttons during save operation
- Success: Auto-refresh data after save
- Error handling with user-friendly error messages
- Keyboard support: Enter to save, Escape to cancel

## Implementation Details

### Component Props
```typescript
interface NetworkDataTableProps {
  data?: any;
  onDataUpdated?: () => void; // Optional callback for data refresh
}
```

### State Management
```typescript
const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null);
const [editValue, setEditValue] = useState<string>('');
const [changes, setChanges] = useState<Map<string, Map<string, any>>>(new Map());
const [isSaving, setIsSaving] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);
```

### API Call Flow
1. User edits cell value and saves (blur or Enter key)
2. Change is tracked in local state with key `{elementType}-{rowIdx}`
3. Cell value is immediately updated in the local data (optimistic update)
4. User clicks "Save Changes"
5. Changes are grouped by element type
6. For each changed element:
   - Extract identifier fields from row data (to locate the element)
   - Build full element data object (the API requires the complete element, not just changed fields)
   - The row data already contains all the user's edits applied
   - Call `PowerFlowApp.modifyElement(elementType, identifier, fullElementData)`
7. On success: Clear changes, trigger data refresh
8. On error: Display error message, keep changes for retry

**Important**: The Rust solver's modify API expects the **full element data**, not partial updates. The backend deserializes the entire element from the `data` field.

### CSS Styling
- Floating action bar with gradient background and glassmorphism effect
- Position: Fixed bottom-right
- Modern macOS-inspired design with smooth animations
- Color coding:
  - Orange gradient for edited cells and action bar
  - Blue for active editing
  - Red accent for reset action on hover

## Usage Example

```tsx
import { NetworkDataTable } from '@/components/features/NetworkDataTable';

// In your component
const handleDataUpdated = async () => {
  // Refresh network data from API
  await sdk.getNetwork();
};

<NetworkDataTable 
  data={networkData} 
  onDataUpdated={handleDataUpdated}
/>
```

## API Endpoints Used

### **POST** `/api/v1/session/edit` - Edit element endpoint

**Request Format:**
```json
{
  "session_id": "abc123",
  "element_type": "bus",
  "action": "modify",
  "identifier": {
    "ibus": 101
  },
  "data": {
    "ibus": 101,
    "name": "BUS_101",
    "baskv": 345.0,
    "ide": 1,
    "vm": 1.05,
    "va": 0.0,
    // ... all other bus fields
  }
}
```

**Response Format:**
```json
{
  "status": "success",
  "message": "bus modify operation completed successfully",
  "session_id": "abc123",
  "file_path": "/path/to/session/file.rawx"
}
```

**Flow:**
1. SDK sends request to Go API server
2. Go API extracts session's working file path
3. Go API calls Rust solver with edit command
4. Rust solver modifies element and sends back updated network
5. Go API saves updated network to session file
6. Returns success response

## Error Handling

- Network errors: Display error message in action bar
- Validation errors: Prevent invalid edits (e.g., non-numeric values for number fields)
- Session errors: Handled by SDK with proper error messages
- Partial failures: Shows first error, keeps changes for retry

## Future Enhancements

Potential improvements:
- [ ] Undo/Redo functionality
- [ ] Batch validation before save
- [ ] Optimistic UI updates
- [ ] Change history/audit log
- [ ] Field-level validation rules
- [ ] Inline add/delete operations
- [ ] Multi-cell selection and bulk edit
- [ ] Export changes as JSON
- [ ] Conflict resolution for concurrent edits

## Files Modified

1. **NetworkDataTable.tsx**
   - Added SDK import: `PowerFlowApp`, `ELEMENT_TYPES`
   - Added `onDataUpdated` prop
   - Added state for saving and errors
   - Implemented `getIdentifierFields()` helper
   - Implemented `handleSaveChanges()` async function
   - Added floating action bar UI

2. **NetworkDataTable.css**
   - Added `.changes-action-bar` styles
   - Added button styles for save/reset actions
   - Added error message styles
   - Added animations for action bar appearance

## Testing Checklist

- [x] Edit cell value and verify local state update
- [x] Verify edited cell visual highlighting
- [x] Test "Reset" button clears changes
- [x] Test "Save Changes" calls modify API
- [x] Verify error handling for failed saves
- [x] Test loading state during save
- [x] Verify data refresh after successful save
- [x] Test with different element types
- [x] Verify identifier field extraction
- [x] Test keyboard shortcuts (Enter, Escape)
- [x] TypeScript compilation with no errors
- [x] No linter warnings

## Notes

- The component uses the SDK singleton instance `PowerFlowApp` for API calls
- Changes are saved per element, not per field
- All changes to an element are sent in a single modify call
- The identifier fields must be present in the original row data
- Only changed fields are sent to the API (not the entire row)

