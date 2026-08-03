/**
 * Command Logger Component
 * 
 * Displays MCP-Server tool execution logs with:
 * - Real-time updates
 * - Filtering by type, tool, time range, and keyword
 * - JSON formatting for details
 * - Export functionality
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useCommandLogger, CommandLogEntry, LogFilterOptions } from '../../../contexts/CommandLoggerContext';
import { filterSensitive } from '../../../utils/sensitiveFilter';
import styles from './CommandLogger.module.css';

// Type colors
const TYPE_COLORS: Record<CommandLogEntry['type'], string> = {
  tool_call: '#4CAF50',
  tool_result: '#2196F3',
  error: '#f44336',
  info: '#9E9E9E',
  warning: '#FF9800',
};

// Type labels
const TYPE_LABELS: Record<CommandLogEntry['type'], string> = {
  tool_call: 'Tool Call',
  tool_result: 'Result',
  error: 'Error',
  info: 'Info',
  warning: 'Warning',
};

/**
 * Command Logger Component
 */
export function CommandLogger() {
  const { entries, clearEntries, getFilteredEntries, exportEntries, stats } = useCommandLogger();
  
  // Filter state
  const [filters, setFilters] = useState<LogFilterOptions>({});
  const [selectedEntry, setSelectedEntry] = useState<CommandLogEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Get filtered entries
  const filteredEntries = useMemo(() => {
    return getFilteredEntries(filters);
  }, [getFilteredEntries, filters]);

  // Handle export
  const handleExport = useCallback((format: 'json' | 'csv') => {
    const content = exportEntries(format);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `command-logs-${new Date().toISOString()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportEntries]);

  // Format duration
  const formatDuration = (ms?: number) => {
    if (ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Get unique tools for filter dropdown
  const uniqueTools = useMemo(() => {
    const tools = new Set<string>();
    entries.forEach((entry: CommandLogEntry) => {
      if (entry.tool) tools.add(entry.tool);
    });
    return Array.from(tools).sort();
  }, [entries]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>Command Logger</h3>
        <div className={styles.stats}>
          <span title="Total entries">{stats.total} entries</span>
          <span title="Average duration">Avg: {formatDuration(stats.averageDuration)}</span>
        </div>
        <div className={styles.actions}>
          <button 
            className={styles.button}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button 
            className={styles.button}
            onClick={() => handleExport('json')}
          >
            Export JSON
          </button>
          <button 
            className={styles.button}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </button>
          <button 
            className={`${styles.button} ${styles.danger}`}
            onClick={clearEntries}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={filters.type || ''}
            onChange={(e) => setFilters({ ...filters, type: e.target.value as CommandLogEntry['type'] || undefined })}
          >
            <option value="">All Types</option>
            <option value="tool_call">Tool Call</option>
            <option value="tool_result">Tool Result</option>
            <option value="error">Error</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
          </select>

          <select
            className={styles.select}
            value={filters.tool || ''}
            onChange={(e) => setFilters({ ...filters, tool: e.target.value || undefined })}
          >
            <option value="">All Tools</option>
            {uniqueTools.map(tool => (
              <option key={tool} value={tool}>{tool}</option>
            ))}
          </select>

          <input
            type="text"
            className={styles.input}
            placeholder="Search keyword..."
            value={filters.keyword || ''}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value || undefined })}
          />

          <button 
            className={styles.button}
            onClick={() => setFilters({})}
          >
            Reset
          </button>
        </div>
      )}

      {/* Main content */}
      <div className={styles.content}>
        {/* Entry list */}
        <div className={styles.entryList}>
          {filteredEntries.length === 0 ? (
            <div className={styles.empty}>No entries</div>
          ) : (
            filteredEntries.map((entry: CommandLogEntry) => (
              <div
                key={entry.id}
                className={`${styles.entry} ${selectedEntry?.id === entry.id ? styles.selected : ''}`}
                onClick={() => setSelectedEntry(entry)}
              >
                <div className={styles.entryHeader}>
                  <span 
                    className={styles.type}
                    style={{ backgroundColor: TYPE_COLORS[entry.type] }}
                  >
                    {TYPE_LABELS[entry.type]}
                  </span>
                  {entry.tool && <span className={styles.tool}>{entry.tool}</span>}
                  <span className={styles.time}>{formatTimestamp(entry.timestamp)}</span>
                </div>
                <div className={styles.entryMeta}>
                  {entry.duration !== undefined && (
                    <span className={styles.duration}>{formatDuration(entry.duration)}</span>
                  )}
                  {entry.error && <span className={styles.error}>{entry.error}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Entry detail */}
        {selectedEntry && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <h4>Entry Details</h4>
              <button 
                className={styles.closeButton}
                onClick={() => setSelectedEntry(null)}
              >
                ×
              </button>
            </div>
            <div className={styles.detailContent}>
              <div className={styles.detailSection}>
                <strong>ID:</strong> {selectedEntry.id}
              </div>
              <div className={styles.detailSection}>
                <strong>Timestamp:</strong> {selectedEntry.timestamp}
              </div>
              <div className={styles.detailSection}>
                <strong>Type:</strong> {TYPE_LABELS[selectedEntry.type]}
              </div>
              {selectedEntry.tool && (
                <div className={styles.detailSection}>
                  <strong>Tool:</strong> {selectedEntry.tool}
                </div>
              )}
              {selectedEntry.duration !== undefined && (
                <div className={styles.detailSection}>
                  <strong>Duration:</strong> {formatDuration(selectedEntry.duration)}
                </div>
              )}
              {selectedEntry.input !== undefined && selectedEntry.input !== null && (
                <div className={styles.detailSection}>
                  <strong>Input:</strong>
                  <pre className={styles.json}>
                    {JSON.stringify(filterSensitive(selectedEntry.input), null, 2)}
                  </pre>
                </div>
              )}
              {selectedEntry.output !== undefined && selectedEntry.output !== null && (
                <div className={styles.detailSection}>
                  <strong>Output:</strong>
                  <pre className={styles.json}>
                    {JSON.stringify(filterSensitive(selectedEntry.output), null, 2)}
                  </pre>
                </div>
              )}
              {selectedEntry.error && (
                <div className={styles.detailSection}>
                  <strong>Error:</strong>
                  <pre className={styles.errorText}>{selectedEntry.error}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CommandLogger;
