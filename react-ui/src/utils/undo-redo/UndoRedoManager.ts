/**
 * UndoRedoManager
 * 
 * Manages undo/redo history for local state changes.
 * Operates on changes Map only - NO backend API calls.
 */

import { EventEmitter } from '../../sdk/utils/EventEmitter.js';
import { EditCommand } from './EditCommand';
import type { EditCommandData, UndoRedoState, UndoRedoConfig } from './types';

export class UndoRedoManager extends EventEmitter {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private maxHistorySize: number;
  private mergeTimeWindow: number;
  private currentChanges: Map<string, Map<string, any>> = new Map();

  constructor(config: UndoRedoConfig = {}) {
    super();
    this.maxHistorySize = config.maxHistorySize || 100;
    this.mergeTimeWindow = config.mergeTimeWindow || 2000;
  }

  /**
   * Track an edit and apply it to changes Map
   */
  trackEdit(edit: Omit<EditCommandData, 'timestamp'>): Map<string, Map<string, any>> {
    const command = new EditCommand({
      ...edit,
      timestamp: Date.now(),
    });

    // Try to merge with last command (if same field edited quickly)
    const lastCommand = this.undoStack[this.undoStack.length - 1];
    if (lastCommand && lastCommand.canMergeWith(command)) {
      // Merge with last command
      const merged = lastCommand.merge(command);
      this.undoStack[this.undoStack.length - 1] = merged;

      // Update changes with merged command
      this.currentChanges = merged.execute(this.currentChanges);
    } else {
      // Create new command
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

  /**
   * Undo last edit - manipulates changes Map only, no backend calls
   */
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

  /**
   * Redo last undone edit - manipulates changes Map only, no backend calls
   */
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

  /**
   * Clear all history - call after successful save
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentChanges = new Map();
    this.emit('history:cleared', undefined);
    this.emit('history:changed', this.getHistoryState());
  }

  /**
   * Update reference to current changes Map (sync with React state)
   */
  setChanges(changes: Map<string, Map<string, any>>): void {
    this.currentChanges = changes;
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get current history state
   */
  getHistoryState(): UndoRedoState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
    };
  }

  /**
   * Get all commands in undo stack (for debugging)
   */
  getHistory(): EditCommand[] {
    return [...this.undoStack];
  }

  /**
   * Get all commands in redo stack (for debugging)
   */
  getRedoHistory(): EditCommand[] {
    return [...this.redoStack];
  }

  /**
   * Trim history to stay within memory limits
   */
  private trimHistory(): void {
    while (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift(); // Remove oldest command
    }
  }
}

