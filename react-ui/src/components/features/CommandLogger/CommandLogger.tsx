import React, { useEffect, useRef, useState } from 'react';
import './CommandLogger.css';
import { useTranslation } from 'react-i18next';
import { PowerFlowApp } from '../../../sdk';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface CommandLoggerProps {
  logs?: LogEntry[];
  maxLogs?: number; // Maximum number of logs to keep
}

export const CommandLogger: React.FC<CommandLoggerProps> = ({ 
  logs = [], 
  maxLogs = 100 
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const [sdkLogs, setSdkLogs] = useState<LogEntry[]>([]);

  // Listen to SDK log events from singleton PowerFlowApp
  useEffect(() => {
    if (!PowerFlowApp) return;
    
    const handleLog = (logEntry: LogEntry) => {
      setSdkLogs(prevLogs => {
        const newLogs = [...prevLogs, logEntry];
        // Keep only the last maxLogs entries
        if (newLogs.length > maxLogs) {
          return newLogs.slice(newLogs.length - maxLogs);
        }
        return newLogs;
      });
    };
    
    // Subscribe to log events from PowerFlowApp singleton
    const unsubscribe = PowerFlowApp.on('log', handleLog);
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, sdkLogs]);

  const defaultLogs: LogEntry[] = [];

  // Merge SDK logs with provided logs, or use default logs if neither exists
  let displayLogs: LogEntry[];
  if (sdkLogs.length > 0 || logs.length > 0) {
    displayLogs = [...logs, ...sdkLogs];
  } else {
    displayLogs = defaultLogs;
  }
  
  // Translate log message by matching patterns
  const translateLogMessage = (message: string): string => {
    // Pattern matching for common log messages
    const patterns = [
      // File operations
      { pattern: /^Uploading file: (.+)$/i, key: 'logger.uploadingFile', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Successfully uploaded file: (.+)$/i, key: 'logger.fileUploadedSuccess', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Failed to upload file: (.+)$/i, key: 'logger.fileUploadFailed', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Opening file: (.+)$/i, key: 'logger.openingFile', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Successfully opened file: (.+)$/i, key: 'logger.fileOpenedSuccess', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Failed to open file: (.+)$/i, key: 'logger.fileOpenFailed', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Saving file\.\.\.$/i, key: 'logger.savingFile' },
      { pattern: /^File saved successfully$/i, key: 'logger.fileSavedSuccess' },
      { pattern: /^Failed to save file$/i, key: 'logger.fileSaveFailed' },
      { pattern: /^Deleting file: (.+)$/i, key: 'logger.deletingFile', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Successfully deleted file: (.+)$/i, key: 'logger.fileDeletedSuccess', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      { pattern: /^Failed to delete file: (.+)$/i, key: 'logger.fileDeleteFailed', params: (match: RegExpMatchArray) => ({ fileName: match[1] }) },
      
      // Element operations
      { pattern: /^Adding (.+?)\.\.\.$/i, key: 'logger.addingElement', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Successfully added (.+)$/i, key: 'logger.elementAddedSuccess', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Failed to add (.+)$/i, key: 'logger.elementAddFailed', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Modifying (.+?)\.\.\.$/i, key: 'logger.modifyingElement', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Successfully modified (.+)$/i, key: 'logger.elementModifiedSuccess', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Failed to modify (.+)$/i, key: 'logger.elementModifyFailed', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Deleting (.+?)\.\.\.$/i, key: 'logger.deletingElement', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Successfully deleted (.+)$/i, key: 'logger.elementDeletedSuccess', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      { pattern: /^Failed to delete (.+)$/i, key: 'logger.elementDeleteFailed', params: (match: RegExpMatchArray) => ({ elementType: match[1] }) },
      
      // Calculation operations
      { pattern: /^Starting (.+?) calculation\.\.\.$/i, key: 'logger.startingCalculation', params: (match: RegExpMatchArray) => ({ method: match[1] }) },
      { pattern: /^(.+?) completed successfully \((\d+) iterations\)$/i, key: 'logger.calculationSuccess', params: (match: RegExpMatchArray) => ({ method: match[1], iterations: match[2] }) },
      { pattern: /^(.+?) completed but did not converge \((\d+) iterations\)$/i, key: 'logger.calculationWarning', params: (match: RegExpMatchArray) => ({ method: match[1], iterations: match[2] }) },
      { pattern: /^(.+?) calculation failed$/i, key: 'logger.calculationFailed', params: (match: RegExpMatchArray) => ({ method: match[1] }) },
      { pattern: /^Starting batch calculation with (\d+) methods?\.\.\.$/i, key: 'logger.batchCalculationStart', params: (match: RegExpMatchArray) => ({ count: match[1] }) },
      { pattern: /^Batch calculation completed successfully$/i, key: 'logger.batchCalculationSuccess' },
      { pattern: /^Batch calculation failed$/i, key: 'logger.batchCalculationFailed' },
      
      // Network data
      { pattern: /^Loading network data\.\.\.$/i, key: 'logger.loadingNetworkData' },
      { pattern: /^Network data loaded successfully$/i, key: 'logger.networkDataLoaded' },
      { pattern: /^Failed to load network data$/i, key: 'logger.networkDataFailed' },
      
      // Session operations
      { pattern: /^Clearing session\.\.\.$/i, key: 'logger.clearingSession' },
      { pattern: /^Session cleared$/i, key: 'logger.sessionCleared' },
      
      // SDK operations
      { pattern: /^SDK initialized successfully$/i, key: 'logger.sdkInitialized' },
      { pattern: /^Connected to backend: (.+)$/i, key: 'logger.connectedToBackend' },
      { pattern: /^Resetting SDK\.\.\.$/i, key: 'logger.resettingSDK' },
      { pattern: /^SDK reset complete$/i, key: 'logger.sdkResetComplete' },
      { pattern: /^Cannot connect to backend: (.+)$/i, key: 'logger.cannotConnectBackend', params: (match: RegExpMatchArray) => ({ url: match[1] }) },
      { pattern: /^SDK initialization failed: (.+)$/i, key: 'logger.sdkInitFailed', params: (match: RegExpMatchArray) => ({ error: match[1] }) },
    ];

    // Try to match message against patterns
    for (const { pattern, key, params } of patterns) {
      const match = message.match(pattern);
      if (match) {
        const translationParams = params ? params(match) : {};
        const translated = t(key, translationParams);
        // Only return translation if it's different from the key (meaning translation exists)
        if (translated !== key) {
          return translated;
        }
      }
    }

    // If no pattern matches, return original message
    return message;
  };

  // Format timestamp for display (convert ISO to readable format)
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        // Use current i18n language for locale
        const locale = i18n.language === 'zh' ? 'zh-CN' : i18n.language === 'es' ? 'es-ES' : i18n.language === 'fr' ? 'fr-FR' : 'en-US';
        return date.toLocaleTimeString(locale, { 
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
    } catch (e) {
      // If parsing fails, return as is
    }
    return timestamp;
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      default:
        return '→';
    }
  };

  return (
    <div className="command-logger">
      <div className="logger-content" ref={logContainerRef}>
        {displayLogs.map((log, index) => (
          <div key={index} className={`log-entry log-${log.level}`}>
            <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
            <span className="log-icon">{getLogIcon(log.level)}</span>
            <span className="log-message">{translateLogMessage(log.message)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};