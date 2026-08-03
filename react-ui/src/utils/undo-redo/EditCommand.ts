/**
 * EditCommand
 * 
 * Represents a single edit operation on the changes Map.
 * This command knows how to execute (apply edit) and undo (revert edit).
 */

import type { EditCommandData } from './types';

export class EditCommand implements EditCommandData {
  elementKey: string;
  field: string;
  previousValue: any;
  newValue: any;
  timestamp: number;

  constructor(data: EditCommandData) {
    this.elementKey = data.elementKey;
    this.field = data.field;
    this.previousValue = data.previousValue;
    this.newValue = data.newValue;
    this.timestamp = data.timestamp;
  }

  /**
   * Execute the command - apply the edit to changes Map
   */
  execute(changes: Map<string, Map<string, any>>): Map<string, Map<string, any>> {
    const newChanges = new Map(changes);
    
    if (!newChanges.has(this.elementKey)) {
      newChanges.set(this.elementKey, new Map());
    }
    
    const elementChanges = newChanges.get(this.elementKey)!;
    elementChanges.set(this.field, this.newValue);
    
    return newChanges;
  }

  /**
   * Undo the command - revert the edit in changes Map
   * Note: After save, the changes Map is empty, so we need to restore the change
   * by adding it back with the previous value
   */
  undo(changes: Map<string, Map<string, any>>): Map<string, Map<string, any>> {
    const newChanges = new Map(changes);
    
    // If elementKey doesn't exist (e.g., after save when changes Map is cleared),
    // we need to create it to restore the previous state
    if (!newChanges.has(this.elementKey)) {
      // If previousValue is undefined, nothing to restore (original was undefined)
      if (this.previousValue === undefined) {
        return newChanges;
      }
      // Create the elementKey entry to restore the previous value
      newChanges.set(this.elementKey, new Map());
    }
    
    const elementChanges = newChanges.get(this.elementKey)!;
    
    if (this.previousValue === undefined) {
      // If previous value was undefined, remove the change entirely
      elementChanges.delete(this.field);
      if (elementChanges.size === 0) {
        newChanges.delete(this.elementKey);
      }
    } else {
      // Restore previous value (this works whether elementKey existed or not)
      elementChanges.set(this.field, this.previousValue);
    }
    
    return newChanges;
  }

  /**
   * Check if this command can be merged with another command
   */
  canMergeWith(other: EditCommand): boolean {
    if (!(other instanceof EditCommand)) return false;
    if (other.elementKey !== this.elementKey) return false;
    if (other.field !== this.field) return false;
    
    // Merge if within time window (default: 2 seconds)
    const timeDiff = other.timestamp - this.timestamp;
    return timeDiff < 2000; // 2 seconds
  }

  /**
   * Merge this command with another command
   * Keeps original previousValue, updates newValue to latest
   */
  merge(other: EditCommand): EditCommand {
    return new EditCommand({
      elementKey: this.elementKey,
      field: this.field,
      previousValue: this.previousValue, // Keep original
      newValue: other.newValue,          // Use latest
      timestamp: other.timestamp,        // Use latest timestamp
    });
  }

  /**
   * Get human-readable description
   */
  get description(): string {
    return `Edit ${this.field} in ${this.elementKey}`;
  }
}

