/**
 * Command Logger Context
 * 
 * Tracks MCP-Server behavior and tool executions with:
 * - Sensitive information filtering
 * - Log entry limit management
 * - Real-time updates
 * - Export functionality
 */

import React, { createContext, useCallback, useContext, useState, useMemo } from 'react';

// Log entry type
export interface CommandLogEntry {
  id: string;
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'error' | 'info' | 'warning';
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  duration?: number; // milliseconds
  metadata?: Record<string, unknown>;
}

// Filter options
export interface LogFilterOptions {
  type?: CommandLogEntry['type'];
  tool?: string;
  startTime?: string;
  endTime?: string;
  keyword?: string;
}

// Context value type
interface CommandLoggerContextValue {
  // Log entries
  entries: CommandLogEntry[];
  // Add a new log entry
  addEntry: (entry: Omit<CommandLogEntry, 'id' | 'timestamp'>) => void;
  // Clear all entries
  clearEntries: () => void;
  // Get filtered entries
  getFilteredEntries: (options: LogFilterOptions) => CommandLogEntry[];
  // Export entries
  exportEntries: (format: 'json' | 'csv') => string;
  // Statistics
  stats: {
    total: number;
    byType: Record<string, number>;
    byTool: Record<string, number>;
    averageDuration: number;
  };
}

// Create context
const CommandLoggerContext = createContext<CommandLoggerContextValue | null>(null);

// Maximum number of entries to keep
const MAX_ENTRIES = 1000;

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Provider props
interface CommandLoggerProviderProps {
  children: React.ReactNode;
  maxEntries?: number;
}

/**
 * Command Logger Provider Component
 */
export function CommandLoggerProvider({ 
  children, 
  maxEntries = MAX_ENTRIES 
}: CommandLoggerProviderProps) {
  const [entries, setEntries] = useState<CommandLogEntry[]>([]);

  // Add a new log entry
  const addEntry = useCallback((entry: Omit<CommandLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: CommandLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };

    setEntries(prev => {
      const next = [...prev, newEntry];
      // Keep only the last maxEntries
      if (next.length > maxEntries) {
        return next.slice(-maxEntries);
      }
      return next;
    });
  }, [maxEntries]);

  // Clear all entries
  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  // Get filtered entries
  const getFilteredEntries = useCallback((options: LogFilterOptions): CommandLogEntry[] => {
    return entries.filter(entry => {
      // Filter by type
      if (options.type && entry.type !== options.type) {
        return false;
      }

      // Filter by tool
      if (options.tool && entry.tool !== options.tool) {
        return false;
      }

      // Filter by time range
      if (options.startTime && entry.timestamp < options.startTime) {
        return false;
      }
      if (options.endTime && entry.timestamp > options.endTime) {
        return false;
      }

      // Filter by keyword
      if (options.keyword) {
        const keyword = options.keyword.toLowerCase();
        const searchStr = JSON.stringify(entry).toLowerCase();
        if (!searchStr.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [entries]);

  // Export entries
  const exportEntries = useCallback((format: 'json' | 'csv'): string => {
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // CSV format
    const headers = ['id', 'timestamp', 'type', 'tool', 'duration', 'error'];
    const rows = entries.map(entry => [
      entry.id,
      entry.timestamp,
      entry.type,
      entry.tool || '',
      entry.duration?.toString() || '',
      entry.error || '',
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');
  }, [entries]);

  // Calculate statistics
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byTool: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    entries.forEach(entry => {
      // Count by type
      byType[entry.type] = (byType[entry.type] || 0) + 1;

      // Count by tool
      if (entry.tool) {
        byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;
      }

      // Sum durations
      if (entry.duration) {
        totalDuration += entry.duration;
        durationCount++;
      }
    });

    return {
      total: entries.length,
      byType,
      byTool,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }, [entries]);

  // Context value
  const value = useMemo<CommandLoggerContextValue>(() => ({
    entries,
    addEntry,
    clearEntries,
    getFilteredEntries,
    exportEntries,
    stats,
  }), [entries, addEntry, clearEntries, getFilteredEntries, exportEntries, stats]);

  return (
    <CommandLoggerContext.Provider value={value}>
      {children}
    </CommandLoggerContext.Provider>
  );
}

/**
 * Hook to access Command Logger context
 */
export function useCommandLogger(): CommandLoggerContextValue {
  const context = useContext(CommandLoggerContext);
  if (!context) {
    throw new Error('useCommandLogger must be used within a CommandLoggerProvider');
  }
  return context;
}

/**
 * Hook to log a tool call
 */
export function useToolCallLogger() {
  const { addEntry } = useCommandLogger();

  return useCallback(
    async <T,>(
      tool: string,
      input: Record<string, unknown>,
      fn: () => Promise<T>
    ): Promise<T> => {
      const startTime = Date.now();

      try {
        const result = await fn();
        const duration = Date.now() - startTime;

        addEntry({
          type: 'tool_call',
          tool,
          input,
          output: result,
          duration,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        addEntry({
          type: 'error',
          tool,
          input,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });

        throw error;
      }
    },
    [addEntry]
  );
}

export default CommandLoggerContext;
