/**
 * Undo/Redo Types
 * 
 * TypeScript types for the undo/redo system
 */

/**
 * Represents an edit operation
 */
export interface EditCommandData {
  elementKey: string;    // e.g., "bus-0", "load-5"
  field: string;        // Field name that was edited
  previousValue: any;   // Value before edit (for undo)
  newValue: any;        // Value after edit
  timestamp: number;    // When edit was made
}

/**
 * History state information
 */
export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  undoStackSize: number;
  redoStackSize: number;
}

/**
 * Configuration for UndoRedoManager
 */
export interface UndoRedoConfig {
  maxHistorySize?: number;     // Maximum number of commands in history (default: 100)
  mergeTimeWindow?: number;    // Time window for merging commands in ms (default: 2000)
}

