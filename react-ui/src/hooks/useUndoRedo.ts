/**
 * useUndoRedo Hook
 * 
 * React hook providing undo/redo functionality for local state changes.
 * All operations are local-only (no backend API calls).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UndoRedoManager } from '../utils/undo-redo';
import type { EditCommandData, UndoRedoState } from '../utils/undo-redo/types';

export interface UseUndoRedoOptions {
  maxHistorySize?: number;
  mergeTimeWindow?: number;
}

export interface UseUndoRedoReturn {
  // State
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  redoStackSize: number;

  // Actions (all operate on LOCAL STATE ONLY, no backend calls)
  trackEdit: (edit: Omit<EditCommandData, 'timestamp'>) => Map<string, Map<string, any>>;
  undo: () => Map<string, Map<string, any>> | null;
  redo: () => Map<string, Map<string, any>> | null;
  clearHistory: () => void;

  // Sync with React state
  setChanges: (changes: Map<string, Map<string, any>>) => void;
}

/**
 * React hook for undo/redo functionality
 */
export function useUndoRedo(options: UseUndoRedoOptions = {}): UseUndoRedoReturn {
  const managerRef = useRef<UndoRedoManager | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historySize, setHistorySize] = useState(0);
  const [redoStackSize, setRedoStackSize] = useState(0);

  // Initialize manager (singleton)
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new UndoRedoManager({
        maxHistorySize: options.maxHistorySize || 100,
        mergeTimeWindow: options.mergeTimeWindow || 2000,
      });

      // Listen to history changes
      const handleHistoryChanged = (state: UndoRedoState) => {
        setCanUndo(state.canUndo);
        setCanRedo(state.canRedo);
        setHistorySize(state.undoStackSize);
        setRedoStackSize(state.redoStackSize);
      };

      managerRef.current.on('history:changed', handleHistoryChanged);

      // Initial state
      handleHistoryChanged(managerRef.current.getHistoryState());
    }

    return () => {
      // Cleanup if needed
      if (managerRef.current) {
        managerRef.current.removeAllListeners();
      }
    };
  }, [options.maxHistorySize, options.mergeTimeWindow]);

  // Track an edit (called when user edits a cell)
  const trackEdit = useCallback((edit: Omit<EditCommandData, 'timestamp'>) => {
    if (!managerRef.current) {
      throw new Error('UndoRedoManager not initialized');
    }
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

