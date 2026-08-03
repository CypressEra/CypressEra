# Undo/Redo System Design for Network Modifications

## Executive Summary

This document outlines an industrial-grade undo/redo solution for network modifications in the X-Flow React UI. The design follows the **Command Pattern**, integrated seamlessly with the existing SDK architecture, event-driven system, and React state management.

## 🎯 KEY DESIGN PRINCIPLE

**UNDO/REDO IS LOCAL-ONLY - NO BACKEND API CALLS**

The undo/redo system operates **EXCLUSIVELY on frontend state** (the `changes` Map):

- ✅ **Undo/Redo manipulates local `changes` Map only** - no backend calls
- ✅ **Backend sync happens ONLY when user clicks "Save Changes"** - existing button/popup
- ✅ **After successful save**, undo/redo history is cleared automatically
- ✅ **Matches existing pattern** - works with current "Save Changes" flow
- ✅ **Instant feedback** - no network latency during undo/redo operations

**Current Flow:**
1. User edits cell → Tracked in `changes` Map → "Save Changes" button appears
2. User can undo/redo edits → Manipulates `changes` Map only (no API calls)
3. User clicks "Save Changes" → Backend API called → Cache updated → History cleared

This approach is simpler, faster, and matches user expectations (like text editors).

## Design Goals

1. **Performance**: Minimal memory footprint with efficient history management
2. **Reliability**: Atomic operations, error recovery, and state consistency
3. **User Experience**: Fast undo/redo, visual feedback, keyboard shortcuts
4. **Maintainability**: Clean separation of concerns, testable, extensible
5. **Scalability**: Handle large networks with thousands of elements efficiently
6. **Integration**: Seamless integration with existing SDK and React architecture

## CRITICAL DESIGN PRINCIPLE

**UNDO/REDO IS LOCAL-ONLY:**
- ✅ Undo/Redo operates **ONLY on frontend state** (the `changes` Map)
- ✅ **NO backend API calls** during undo/redo operations
- ✅ Backend sync happens **ONLY when user clicks "Save Changes"** button
- ✅ After successful save, undo/redo history is cleared
- ✅ This matches the existing "Save Changes" pattern already in the codebase

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI Layer                            │
│  ┌────────────────────────────────────────────────────┐     │
│  │  NetworkDataTable Component                        │     │
│  │  - Captures user edits                             │     │
│  │  - Dispatches commands via useUndoRedo hook        │     │
│  └────────────────────────────────────────────────────┘     │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  useUndoRedo Hook (React Hook)                     │     │
│  │  - Manages undo/redo state                         │     │
│  │  - Provides undo/redo/fire functions               │     │
│  │  - Handles UI state (canUndo, canRedo)             │     │
│  └────────────────────────────────────────────────────┘     │
│                          │                                   │
│                          ▼                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         UndoRedoManager (Local State Manager)                │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Command Pattern Implementation                    │     │
│  │  - EditCommand (Local state only)                  │     │
│  │  - Operates on `changes` Map directly              │     │
│  │  - NO backend API calls                            │     │
│  └────────────────────────────────────────────────────┘     │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  History Manager (Local Only)                      │     │
│  │  - Undo stack (past edits)                         │     │
│  │  - Redo stack (undone edits)                       │     │
│  │  - History limit & memory management               │     │
│  │  - Command merging for rapid edits                 │     │
│  └────────────────────────────────────────────────────┘     │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Changes Map (React State)                         │     │
│  │  - Tracks pending edits                            │     │
│  │  - Manipulated by undo/redo                        │     │
│  │  - Sent to backend on "Save Changes" only          │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           │ (Only when user clicks "Save Changes")
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  SDK Integration Layer                        │
│  ┌────────────────────────────────────────────────────┐     │
│  │  EditService (Existing)                            │     │
│  │  - modifyElement() ← Called ONLY on save          │     │
│  │  - addElement()                                    │     │
│  │  - deleteElement()                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Network Cache (Existing)                          │     │
│  │  - updateCachedNetwork() ← Updated after save     │     │
│  │  - getCachedNetwork()                              │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
│  - /api/v1/session/edit                                     │
│  (Called ONLY when user clicks "Save Changes")              │
└─────────────────────────────────────────────────────────────┘
```

## Core Design Patterns

### 1. Command Pattern

Each network modification is encapsulated as a command object that knows how to:
- Execute itself (do/redo)
- Undo itself (reverse the operation)
- Serialize/deserialize for persistence (optional)

**Benefits:**
- Decouples the operation from the invoker
- Enables queuing, logging, and undo/redo
- Supports batch operations and macros
- Easy to test individual commands

### 2. Memento Pattern (Optional, for Snapshots)

For complex operations or checkpoints, store snapshots of network state:
- Full state snapshot: Complete network data at a point in time
- Differential snapshot: Only changes from previous state
- Checkpoint: User-initiated save points (e.g., after major operations)

**Benefits:**
- Fast undo to specific checkpoints
- Recovery from errors
- Time-travel debugging (future feature)

## Implementation Details

### 1. Command Interface

```typescript
interface ICommand {
  // Unique identifier for the command
  id: string;
  
  // Timestamp when command was created
  timestamp: number;
  
  // Human-readable description (for UI display)
  description: string;
  
  // Execute the command (forward/reapply)
  execute(): Promise<CommandResult>;
  
  // Undo the command (reverse)
  undo(): Promise<CommandResult>;
  
  // Whether this command can be undone
  canUndo(): boolean;
  
  // Serialize for persistence (optional)
  serialize(): string;
  
  // Merge with another command if possible (for optimization)
  canMergeWith(other: ICommand): boolean;
  merge(other: ICommand): ICommand;
}
```

### 2. Command Types

**IMPORTANT: Commands operate on LOCAL STATE ONLY (changes Map), NOT backend API.**

#### A. EditCommand (Local State Only)
For tracking edits to the `changes` Map. This is a lightweight command that only manipulates frontend state.

**Structure:**
```typescript
class EditCommand implements ICommand {
  elementKey: string;        // e.g., "bus-0", "load-5"
  field: string;             // Field name that was edited
  previousValue: any;        // Value before edit (for undo)
  newValue: any;             // Value after edit
  timestamp: number;         // When edit was made
  
  // Execute: Apply the edit to changes Map
  execute(changes: Map<string, Map<string, any>>): Map<string, Map<string, any>> {
    const newChanges = new Map(changes);
    if (!newChanges.has(this.elementKey)) {
      newChanges.set(this.elementKey, new Map());
    }
    const elementChanges = newChanges.get(this.elementKey)!;
    elementChanges.set(this.field, this.newValue);
    return newChanges;
  }
  
  // Undo: Revert the edit in changes Map
  undo(changes: Map<string, Map<string, any>>): Map<string, Map<string, any>> {
    const newChanges = new Map(changes);
    if (!newChanges.has(this.elementKey)) {
      return newChanges;
    }
    const elementChanges = newChanges.get(this.elementKey)!;
    
    if (this.previousValue === undefined) {
      // If previous value was undefined, remove the change entirely
      elementChanges.delete(this.field);
      if (elementChanges.size === 0) {
        newChanges.delete(this.elementKey);
      }
    } else {
      // Restore previous value
      elementChanges.set(this.field, this.previousValue);
    }
    return newChanges;
  }
  
  canUndo(): boolean {
    return true; // All edits can be undone
  }
  
  // Command merging: If same field edited quickly, merge
  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof EditCommand)) return false;
    if (other.elementKey !== this.elementKey) return false;
    if (other.field !== this.field) return false;
    
    // Merge if within time window (e.g., 2 seconds)
    const timeDiff = other.timestamp - this.timestamp;
    return timeDiff < 2000;
  }
  
  merge(other: EditCommand): EditCommand {
    // Keep original previousValue, update newValue to latest
    return new EditCommand({
      elementKey: this.elementKey,
      field: this.field,
      previousValue: this.previousValue, // Keep original
      newValue: other.newValue,          // Use latest
      timestamp: other.timestamp,        // Use latest timestamp
    });
  }
  
  description: string {
    return `Edit ${this.field} in ${this.elementKey}`;
  }
}
```

**Note:** This command does NOT call any backend APIs. It only manipulates the `changes` Map state.

### 3. UndoRedoManager (Local State Manager)

Central service managing command history and undo/redo operations on **LOCAL STATE ONLY**.

**Key Responsibilities:**
- Maintain undo/redo stacks (for local edits only)
- Track edits to `changes` Map
- Execute undo/redo by manipulating `changes` Map (no backend calls)
- Handle command merging (if same field edited quickly)
- Memory management (limit history size)
- Event emission for UI updates
- Clear history after successful save

**Structure:**
```typescript
class UndoRedoManager extends EventEmitter {
  private undoStack: EditCommand[] = [];  // Edits that can be undone
  private redoStack: EditCommand[] = [];  // Edits that were undone
  private maxHistorySize: number = 100;   // Configurable limit
  private currentChanges: Map<string, Map<string, any>> = new Map(); // Reference to changes Map
  
  constructor(config: { maxHistorySize?: number } = {}) {
    super();
    this.maxHistorySize = config.maxHistorySize || 100;
  }
  
  // Track an edit and apply it to changes Map
  trackEdit(edit: {
    elementKey: string;
    field: string;
    previousValue: any;
    newValue: any;
  }): Map<string, Map<string, any>> {
    // Try to merge with last command (if same field edited quickly)
    const lastCommand = this.undoStack[this.undoStack.length - 1];
    if (lastCommand && lastCommand.canMergeWith && lastCommand.canMergeWith(edit)) {
      // Merge with last command
      const merged = lastCommand.merge(new EditCommand(edit));
      this.undoStack[this.undoStack.length - 1] = merged;
      
      // Update changes with merged command
      this.currentChanges = merged.execute(this.currentChanges);
    } else {
      // Create new command
      const command = new EditCommand({
        ...edit,
        timestamp: Date.now(),
      });
      
      // Apply edit to changes Map
      this.currentChanges = command.execute(this.currentChanges);
      
      // Add to undo stack
      this.undoStack.push(command);
      
      // Clear redo stack (new edit invalidates redo history)
      this.redoStack = [];
      
      // Trim history if needed
      this.trimHistory();
    }
    
    // Emit events
    this.emit('edit:tracked', { command: this.undoStack[this.undoStack.length - 1] });
    this.emit('history:changed', this.getHistoryState());
    
    return new Map(this.currentChanges); // Return new Map instance for React state
  }
  
  // Undo last edit (manipulates changes Map only, no backend calls)
  undo(): Map<string, Map<string, any>> | null {
    if (!this.canUndo()) {
      this.emit('history:changed', this.getHistoryState());
      return null;
    }
    
    const command = this.undoStack.pop()!;
    
    // Revert the edit in changes Map
    this.currentChanges = command.undo(this.currentChanges);
    
    // Move to redo stack
    this.redoStack.push(command);
    
    // Emit events
    this.emit('edit:undone', { command });
    this.emit('history:changed', this.getHistoryState());
    
    return new Map(this.currentChanges); // Return new Map instance for React state
  }
  
  // Redo last undone edit (manipulates changes Map only, no backend calls)
  redo(): Map<string, Map<string, any>> | null {
    if (!this.canRedo()) {
      this.emit('history:changed', this.getHistoryState());
      return null;
    }
    
    const command = this.redoStack.pop()!;
    
    // Re-apply the edit to changes Map
    this.currentChanges = command.execute(this.currentChanges);
    
    // Move back to undo stack
    this.undoStack.push(command);
    
    // Emit events
    this.emit('edit:redone', { command });
    this.emit('history:changed', this.getHistoryState());
    
    return new Map(this.currentChanges); // Return new Map instance for React state
  }
  
  // Clear all history (call after successful save)
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentChanges = new Map();
    this.emit('history:cleared');
    this.emit('history:changed', this.getHistoryState());
  }
  
  // Update reference to current changes Map (sync with React state)
  setChanges(changes: Map<string, Map<string, any>>): void {
    this.currentChanges = changes;
  }
  
  // Check if undo is possible
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  
  // Check if redo is possible
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  
  // Get current history state
  getHistoryState() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
    };
  }
  
  // Trim history to stay within memory limits
  private trimHistory(): void {
    while (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift(); // Remove oldest command
    }
  }
}
```

**Key Points:**
- **NO backend API calls** - all operations on local `changes` Map
- **`trackEdit()`** - Records edit and applies to `changes` Map
- **`undo()`** - Reverts last edit in `changes` Map
- **`redo()`** - Re-applies last undone edit to `changes` Map
- **`clearHistory()`** - Clears history after successful save
- **Command merging** - Optimizes history for rapid edits

### 4. React Hook: useUndoRedo

Custom React hook providing undo/redo functionality to components.

**API:**
```typescript
interface UseUndoRedoReturn {
  // State
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  redoStackSize: number;
  
  // Actions (all operate on LOCAL STATE ONLY, no backend calls)
  trackEdit: (edit: {
    elementKey: string;
    field: string;
    previousValue: any;
    newValue: any;
  }) => Map<string, Map<string, any>>;
  
  undo: () => Map<string, Map<string, any>> | null;
  redo: () => Map<string, Map<string, any>> | null;
  clearHistory: () => void;
  
  // Sync with React state
  setChanges: (changes: Map<string, Map<string, any>>) => void;
}
```

**Implementation:**
```typescript
export function useUndoRedo(): UseUndoRedoReturn {
  const managerRef = useRef<UndoRedoManager | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historySize, setHistorySize] = useState(0);
  const [redoStackSize, setRedoStackSize] = useState(0);
  
  // Initialize manager (singleton)
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new UndoRedoManager({
        maxHistorySize: 100,
      });
      
      // Listen to history changes
      managerRef.current.on('history:changed', (state) => {
        setCanUndo(state.canUndo);
        setCanRedo(state.canRedo);
        setHistorySize(state.undoStackSize);
        setRedoStackSize(state.redoStackSize);
      });
    }
    
    return () => {
      // Cleanup if needed
    };
  }, []);
  
  // Track an edit (called when user edits a cell)
  const trackEdit = useCallback((edit: {
    elementKey: string;
    field: string;
    previousValue: any;
    newValue: any;
  }) => {
    if (!managerRef.current) throw new Error("Manager not initialized");
    return managerRef.current.trackEdit(edit);
  }, []);
  
  // Undo last edit (manipulates changes Map only, no backend calls)
  const undo = useCallback(() => {
    if (!managerRef.current) return null;
    return managerRef.current.undo();
  }, []);
  
  // Redo last undone edit (manipulates changes Map only, no backend calls)
  const redo = useCallback(() => {
    if (!managerRef.current) return null;
    return managerRef.current.redo();
  }, []);
  
  // Clear history (called after successful save)
  const clearHistory = useCallback(() => {
    if (!managerRef.current) return;
    managerRef.current.clearHistory();
  }, []);
  
  // Sync changes Map with manager (keep in sync with React state)
  const setChanges = useCallback((changes: Map<string, Map<string, any>>) => {
    if (!managerRef.current) return;
    managerRef.current.setChanges(changes);
  }, []);
  
  return {
    canUndo,
    canRedo,
    historySize,
    redoStackSize,
    trackEdit,
    undo,
    redo,
    clearHistory,
    setChanges,
  };
}
```

**Important:** All operations are synchronous and operate on local state only. No async/await needed since there are no backend calls.

### 5. Integration with NetworkDataTable

**IMPORTANT: Local-Only Undo/Redo (No Backend Calls)**

**Key Principle:** Undo/Redo operates ONLY on frontend state (the `changes` Map). Backend API calls happen ONLY when user clicks "Save Changes" button.

**Current Flow (Before):**
1. User edits cell → Track in local `changes` Map
2. "Save Changes" button appears (when `changeCount > 0`)
3. User clicks "Save Changes" → Batch API calls → Update cache → Clear changes

**New Flow (With Undo/Redo):**
1. User edits cell → Track in local `changes` Map → Add to undo history
2. "Save Changes" button appears (when `changeCount > 0`)
3. **Undo/Redo** → Manipulates `changes` Map ONLY (no API calls, just frontend state)
4. User clicks "Save Changes" → Batch API calls → Update cache → Clear changes → Clear undo/redo history

**Key Changes:**

```typescript
// In NetworkDataTable component
const { 
  trackEdit,      // Track an edit to changes Map
  undo,           // Undo last edit (manipulates changes Map)
  redo,           // Redo last undone edit (manipulates changes Map)
  canUndo,        // Whether undo is possible
  canRedo,        // Whether redo is possible
  clearHistory    // Clear undo/redo history (after successful save)
} = useUndoRedo();

// When user edits a cell
const saveEdit = () => {
  if (editingCell && editValue !== null) {
    const { rowIdx, field } = editingCell;
    const elementKey = `${selectedElement}-${rowIdx}`;
    const currentValue = getCellValue(rowIdx, field);
    const newValue = parseEditValue(editValue, currentValue);
    
    // Update changes Map (existing code)
    setChanges(prev => {
      const newChanges = new Map(prev);
      if (!newChanges.has(elementKey)) {
        newChanges.set(elementKey, new Map());
      }
      const elementChanges = newChanges.get(elementKey)!;
      elementChanges.set(field, newValue);
      return newChanges;
    });
    
    // Track this edit for undo/redo
    trackEdit({
      type: 'modify',
      elementKey,
      field,
      previousValue: currentValue,
      newValue: newValue,
    });
    
    setEditingCell(null);
    setEditValue('');
  }
};

// Handle undo - manipulates changes Map only
const handleUndo = () => {
  undo(); // This will revert the last change in the changes Map
};

// Handle redo - manipulates changes Map only  
const handleRedo = () => {
  redo(); // This will re-apply the last undone change to the changes Map
};

// Save Changes - ONLY place that calls backend API (unchanged)
const handleSaveChanges = async () => {
  if (changes.size === 0) return;
  
  setIsSaving(true);
  setSaveError(null);
  
  try {
    // Group changes by element type (existing code)
    const changesByType = new Map<string, Array<{ rowIdx: number; changes: Map<string, any> }>>();
    
    changes.forEach((elementChanges, elementKey) => {
      const [elementType, rowIdxStr] = elementKey.split('-');
      const rowIdx = parseInt(rowIdxStr);
      
      if (!changesByType.has(elementType)) {
        changesByType.set(elementType, []);
      }
      
      changesByType.get(elementType)!.push({ rowIdx, changes: elementChanges });
    });
    
    // Apply changes for each element type (existing API calls)
    for (const [elementType, elementChanges] of Array.from(changesByType)) {
      const elementData = networkData?.[elementType];
      if (!elementData) continue;
      
      const dataArray = Array.isArray(elementData) ? elementData : elementData.data;
      if (!dataArray) continue;
      
      for (const { rowIdx, changes: fieldChanges } of elementChanges) {
        const row = dataArray[rowIdx];
        if (!row) continue;
        
        const identifierFields = ELEMENT_IDENTIFIERS[elementType] || [];
        const identifier: Record<string, any> = {};
        identifierFields.forEach(field => {
          if (row[field] !== undefined) {
            identifier[field] = row[field];
          }
        });
        
        const modifyData: Record<string, any> = {};
        fieldChanges.forEach((value: any, field: string) => {
          modifyData[field] = value;
        });
        
        // Call backend API (ONLY place that makes API calls)
        await PowerFlowApp.modifyElement(elementType as keyof typeof ELEMENT_TYPES, identifier, modifyData);
      }
    }
    
    // Success - clear changes and update SDK cache
    setChanges(new Map());
    setSaveError(null);
    
    if (networkData) {
      PowerFlowApp.updateCachedNetwork(networkData);
    }
    
    // Clear undo/redo history after successful save
    clearHistory();
    
    if (onDataUpdated) {
      onDataUpdated();
    }
    
    console.log('All changes saved successfully');
  } catch (error: any) {
    console.error('Failed to save changes:', error);
    setSaveError(error.message || 'Failed to save changes');
  } finally {
    setIsSaving(false);
  }
};
```

**Key Points:**
- **Undo/Redo operates on `changes` Map directly** - no backend calls
- **`trackEdit()`** - Records each edit to build undo history
- **`undo()`** - Reverts last change in `changes` Map
- **`redo()`** - Re-applies last undone change to `changes` Map
- **`handleSaveChanges()`** - Only place that calls backend API (unchanged logic)
- **`clearHistory()`** - Clears undo/redo history after successful save

### 6. Keyboard Shortcuts Integration

Already implemented in `MenuBar.tsx` and `App.tsx`, just wire up the handlers:

```typescript
// In App.tsx or NetworkView component
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) for Undo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (canUndo) {
        undo();
      }
    }
    
    // Cmd+Shift+Z or Cmd+Y for Redo
    if (
      ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
      ((e.metaKey || e.ctrlKey) && e.key === 'y')
    ) {
      e.preventDefault();
      if (canRedo) {
        redo();
      }
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [canUndo, canRedo, undo, redo]);
```

## Advanced Features

### 1. Command Merging

When user makes multiple edits to the same field quickly, merge into one command (already implemented in `EditCommand`):

```typescript
// In EditCommand class (already defined above)
class EditCommand {
  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof EditCommand)) return false;
    if (other.elementKey !== this.elementKey) return false;
    if (other.field !== this.field) return false;
    
    // Merge if within time threshold (e.g., 2 seconds)
    const timeDiff = other.timestamp - this.timestamp;
    return timeDiff < 2000; // 2 seconds
  }
  
  merge(other: EditCommand): EditCommand {
    // Keep original previousValue, update newValue to latest
    return new EditCommand({
      elementKey: this.elementKey,
      field: this.field,
      previousValue: this.previousValue, // Keep original
      newValue: other.newValue,          // Use latest
      timestamp: other.timestamp,        // Use latest timestamp
    });
  }
}
```

**Example:** User types "1", then "2", then "3" in a field within 2 seconds → merged into single edit: previousValue="original", newValue="3"

### 2. Optimistic Updates (NOT NEEDED - Already Local)

Since undo/redo operates on local state only, updates are already instant. No optimistic updates needed - the `changes` Map is already the "optimistic" state before saving to backend.

### 3. Persistent History (Optional)

Save history to localStorage for session recovery:

```typescript
class UndoRedoManager {
  private storageKey = 'xflow:undo-redo-history';
  
  saveToStorage(): void {
    const serialized = {
      undoStack: this.undoStack.map(cmd => cmd.serialize()),
      redoStack: this.redoStack.map(cmd => cmd.serialize()),
      timestamp: Date.now(),
    };
    localStorage.setItem(this.storageKey, JSON.stringify(serialized));
  }
  
  loadFromStorage(): void {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return;
    
    const { undoStack, redoStack } = JSON.parse(stored);
    // Deserialize commands
    this.undoStack = undoStack.map(deserializeCommand);
    this.redoStack = redoStack.map(deserializeCommand);
  }
}
```

**Note:** Only serialize lightweight metadata, not full network data.

### 4. Command Macros

Record a sequence of commands and replay them:

```typescript
class MacroCommand implements ICommand {
  commands: ICommand[];
  name: string;
  
  async execute(): Promise<CommandResult> {
    for (const cmd of this.commands) {
      await cmd.execute();
    }
  }
  
  async undo(): Promise<CommandResult> {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i].undo();
    }
  }
}
```

### 5. History Visualization (Future)

Show history as a timeline for debugging:

```typescript
interface HistoryItem {
  command: ICommand;
  timestamp: number;
  description: string;
  icon: string;
}

// Component: HistoryPanel
// - Visual timeline of commands
// - Click to jump to specific state (if checkpoints enabled)
// - Filter by command type
```

## Error Handling & Recovery

### 1. Edit Tracking Errors

Since undo/redo operates on local state only, errors are minimal:
- **Invalid edit**: Validate edit data before tracking (e.g., ensure elementKey and field exist)
- **State inconsistency**: Sync manager's internal state with React state if mismatch detected

### 2. Undo/Redo Errors

Since operations are on local `changes` Map, errors are rare:
- **Empty stack**: Check `canUndo()` / `canRedo()` before calling
- **State mismatch**: If changes Map doesn't match history, sync using `setChanges()`

### 3. Save Errors (Backend API)

When "Save Changes" button calls backend API:
- **API failure**: Keep `changes` Map and undo history (user can retry)
- **Partial success**: Rollback any successful API calls, keep changes Map
- **Network error**: Show error message, keep local changes for retry

### 4. State Validation

Before tracking edits:
- Validate that `elementKey` and `field` exist in network data
- Validate that `previousValue` matches current value in network data
- Ensure `newValue` is of correct type

## Performance Optimizations

### 1. Lazy History Trimming

Instead of trimming on every command, trim periodically or when size limit exceeded:

```typescript
private shouldTrimHistory(): boolean {
  return this.undoStack.length > this.maxHistorySize * 1.5; // 150% threshold
}
```

### 2. Differential Snapshots

For checkpoints, store only changes instead of full state:

```typescript
interface DifferentialSnapshot {
  baseCheckpointId: string; // Reference to base checkpoint
  changes: Record<string, any>; // Only modified data
}
```

### 3. Command Compression

Store only essential data in commands:

```typescript
// Instead of storing full element, store only:
interface CompressedModifyCommand {
  elementType: string;
  identifier: Record<string, any>; // Compact identifier
  fieldChanges: Array<{field: string, oldValue: any, newValue: any}>; // Minimal
}
```

### 4. Debounced Command Execution

For rapid edits, debounce command creation:

```typescript
const debouncedCreateCommand = debounce((edits) => {
  const command = createCommandFromEdits(edits);
  executeCommand(command);
}, 500); // Wait 500ms after last edit
```

## Testing Strategy

### 1. Unit Tests

- **Command Tests**: Test each command type (execute, undo, merge)
- **Manager Tests**: Test history management, trimming, error handling
- **Hook Tests**: Test React hook with React Testing Library

### 2. Integration Tests

- **SDK Integration**: Test with real SDK calls (mocked backend)
- **Component Integration**: Test NetworkDataTable with undo/redo
- **Event Flow**: Test event emission and handling

### 3. E2E Tests

- **User Workflow**: Edit → Save → Undo → Redo
- **Error Scenarios**: API failure, network error
- **Keyboard Shortcuts**: Cmd+Z, Cmd+Shift+Z

## File Structure

### Recommended Structure (Matches Your Codebase Patterns)

```
src/
├── utils/                                # Global utilities (create this folder)
│   └── undo-redo/                       # Undo/redo functionality
│       ├── UndoRedoManager.ts          # Core manager class (non-React)
│       ├── EditCommand.ts              # Command class for edits
│       ├── types.ts                    # TypeScript types
│       └── index.ts                    # Exports (UndoRedoManager, EditCommand, types)
│
├── hooks/                                # Global React hooks
│   ├── useUndoRedo.ts                  # Main React hook (imports from utils/undo-redo)
│   └── index.ts                        # Updated exports (add useUndoRedo)
│
└── components/
    └── features/
        └── NetworkDataTable/
            ├── NetworkDataTable.tsx    # Updated to use useUndoRedo hook
            ├── NetworkDataTable.css
            └── index.ts
```

### File Organization Rationale

**Why `src/utils/undo-redo/`?**
- ✅ **Global utility** - Could be used by other components (not just NetworkDataTable)
- ✅ **Separates concerns** - Core logic (UndoRedoManager) is independent of React
- ✅ **Testable** - Can test UndoRedoManager without React
- ✅ **Follows architecture** - Matches the pattern in `documentations/ARCHITECTURE.md` (global utils)
- ✅ **Clear structure** - Easy to find and maintain

**Why `src/hooks/useUndoRedo.ts`?**
- ✅ **React integration** - Hooks belong in `hooks/` folder
- ✅ **Consistent** - Matches existing hooks (usePowerFlowSDK, useTranslation, etc.)
- ✅ **Reusable** - Can be imported by any component
- ✅ **Simple imports** - `import { useUndoRedo } from '@/hooks'`

**Why NOT in `src/sdk/`?**
- ❌ **Not SDK-related** - This is React/frontend state management, not backend API
- ❌ **Different purpose** - SDK handles backend communication, this handles local state
- ❌ **Would be confusing** - SDK is for API calls, this is for local undo/redo

**Why NOT co-located with NetworkDataTable?**
- ❌ **Less reusable** - Other components might need undo/redo in the future
- ❌ **Harder to test** - Core logic mixed with component code
- ❌ **Violates separation** - Business logic should be separate from UI

### Import Paths

```typescript
// In NetworkDataTable.tsx
import { useUndoRedo } from '@/hooks';

// In useUndoRedo.ts (the hook itself)
import { UndoRedoManager, EditCommand } from '@/utils/undo-redo';
import type { EditCommandData, UndoRedoState } from '@/utils/undo-redo/types';

// In tests
import { UndoRedoManager } from '@/utils/undo-redo';
```

### Alternative Structure (If You Want Feature-Specific)

If you prefer keeping it closer to NetworkDataTable (but still reusable):

```
src/
├── components/
│   └── features/
│       └── NetworkDataTable/
│           ├── NetworkDataTable.tsx
│           ├── NetworkDataTable.css
│           ├── index.ts
│           └── undo-redo/              # Feature-specific utils
│               ├── UndoRedoManager.ts
│               ├── EditCommand.ts
│               ├── types.ts
│               └── index.ts
│
└── hooks/
    ├── useUndoRedo.ts                 # Import from NetworkDataTable/undo-redo
    └── index.ts
```

**But this is NOT recommended** because:
- Less discoverable
- Harder to reuse in other components
- Mixed concerns (feature utils in component folder)

## Migration Path

### Phase 1: Core Infrastructure
1. Create `UndoRedoManager` class
2. Implement `ICommand` interface and base classes
3. Create basic command types (Modify, Add, Delete, Batch)
4. Unit tests for core functionality

### Phase 2: React Integration
1. Create `useUndoRedo` hook
2. Integrate with `NetworkDataTable`
3. Wire up keyboard shortcuts
4. Update UI buttons (enable/disable based on state)

### Phase 3: Advanced Features
1. Command merging
2. Optimistic updates
3. Error recovery
4. Performance optimizations

### Phase 4: Polish
1. History visualization (optional)
2. Persistent history (optional)
3. Command macros (optional)
4. Documentation and examples

## Configuration Options

```typescript
interface UndoRedoConfig {
  maxHistorySize: number;          // Default: 100
  enablePersistence: boolean;      // Default: false
  enableCommandMerging: boolean;   // Default: true
  mergeTimeWindow: number;         // Default: 2000ms
  enableOptimisticUpdates: boolean; // Default: true
  enableCheckpoints: boolean;      // Default: false
  checkpointInterval: number;      // Default: 10 commands
}
```

## Security Considerations

1. **Input Validation**: Validate all command data before execution
2. **Sanitization**: Sanitize identifiers and data to prevent injection
3. **Authorization**: Ensure user has permission to modify network (handled by backend)
4. **History Limits**: Prevent memory exhaustion attacks

## Accessibility

1. **Keyboard Navigation**: Full keyboard support (already implemented)
2. **Screen Readers**: Proper ARIA labels for undo/redo buttons
3. **Tooltips**: Clear descriptions of what will be undone/redone

## Future Enhancements

1. **Collaborative Editing**: Multi-user undo/redo with operational transformation
2. **Time-Travel Debugging**: Visual timeline of all changes
3. **Command Recording**: Record and replay workflows
4. **Command Templates**: Predefined command sequences
5. **Undo Groups**: Group related commands (e.g., all edits in one session)

## Visual Flow Diagram

### User Edit Flow (With Undo/Redo)

```
1. User Edits Cell
   │
   ├─> Track edit in `changes` Map
   │   │
   │   └─> Call `trackEdit()` → Updates `changes` Map
   │       │
   │       └─> Add to undo history stack
   │
   ├─> "Save Changes" button appears (when changeCount > 0)
   │
   └─> User can now:
       ├─> Edit more cells (adds to history)
       ├─> Press Cmd+Z (Undo) → Reverts last edit in `changes` Map (NO API CALL)
       ├─> Press Cmd+Shift+Z (Redo) → Re-applies undone edit (NO API CALL)
       └─> Click "Save Changes" → API CALLS → Backend sync → Clear history

2. User Clicks "Save Changes"
   │
   ├─> Loop through `changes` Map
   │   │
   │   ├─> Group by element type
   │   │
   │   └─> For each change:
   │       │
   │       └─> Call PowerFlowApp.modifyElement() ← BACKEND API CALL
   │
   ├─> Update SDK cache with saved data
   │
   ├─> Clear `changes` Map
   │
   └─> Clear undo/redo history (via clearHistory())
```

### Comparison: Old vs New Approach

**❌ OLD APPROACH (Not Used):**
```
Edit → Undo → API Call → Backend Update → Redo → API Call → Backend Update
     ↑ Slow, network latency, unnecessary API calls
```

**✅ NEW APPROACH (Current Design):**
```
Edit → Track in changes Map → Undo → Revert in changes Map (NO API CALL)
                                                              ↑ Fast, instant
     → Redo → Re-apply in changes Map (NO API CALL)
                                                              ↑ Fast, instant
     → Save Changes → API Calls → Backend Sync
                               ↑ Only one API call batch when user saves
```

## Conclusion

This design provides a robust, scalable, and maintainable undo/redo system that integrates seamlessly with the existing X-Flow architecture. The Command Pattern ensures clean separation of concerns, while the React hook provides a simple API for components. 

**Key Benefits:**
- ✅ **Fast & Responsive**: No network latency during undo/redo
- ✅ **Simple**: Works with existing "Save Changes" pattern
- ✅ **Efficient**: Minimal API calls (only on save)
- ✅ **User-Friendly**: Instant feedback, matches user expectations
- ✅ **Maintainable**: Clean separation, easy to test

The system is designed to handle both simple and complex scenarios, with room for future enhancements like command macros or history visualization.

## References

- **Command Pattern**: Design Patterns by Gang of Four
- **React Hooks Best Practices**: React Documentation
- **Undo/Redo Patterns**: Various open-source implementations (VS Code, Google Docs, etc.)
- **State Management**: Redux, Zustand documentation (for reference)

