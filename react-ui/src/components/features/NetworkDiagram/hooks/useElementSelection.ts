/**
 * useElementSelection Hook
 * Manages element selection state
 */

import { useState, useCallback } from 'react';

interface UseElementSelectionReturn {
  selectedElements: Set<string>;
  setSelectedElements: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelection: (elementId: string) => void;
  clearSelection: () => void;
  selectSingle: (elementId: string) => void;
  selectMultiple: (elementIds: string[]) => void;
  isSelected: (elementId: string) => boolean;
}

export function useElementSelection(): UseElementSelectionReturn {
  const [selectedElements, setSelectedElements] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((elementId: string) => {
    setSelectedElements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(elementId)) {
        newSet.delete(elementId);
      } else {
        newSet.add(elementId);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElements(new Set());
  }, []);

  const selectSingle = useCallback((elementId: string) => {
    setSelectedElements(new Set([elementId]));
  }, []);

  const selectMultiple = useCallback((elementIds: string[]) => {
    setSelectedElements(new Set(elementIds));
  }, []);

  const isSelected = useCallback((elementId: string) => {
    return selectedElements.has(elementId);
  }, [selectedElements]);

  return {
    selectedElements,
    setSelectedElements,
    toggleSelection,
    clearSelection,
    selectSingle,
    selectMultiple,
    isSelected,
  };
}
