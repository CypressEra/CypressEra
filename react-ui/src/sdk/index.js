/**
 * XFlow SDK - Main Entry Point
 * 
 * Modular, scalable SDK for Power Flow Analysis
 * 
 * Architecture:
 * - Core: HttpClient, SessionManager, Xolution
 * - Services: UploadService, AnalysisService
 * - Utils: EventEmitter, Logger, Errors
 * - Types: Constants, Event types
 * 
 * Usage:
 *   import { PowerFlowApp } from '@/sdk';
 *   
 *   await PowerFlowApp.initialize({ userId: 'user123' });
 *   await PowerFlowApp.uploadFile(file);
 *   const results = await PowerFlowApp.solve('dc');
 */

import { Xolution } from './Xolution.js';

// Create singleton instance - The heart of XFlow
const PowerFlowApp = new Xolution();

// Export singleton as default and named export
export { PowerFlowApp };
export default PowerFlowApp;

// Export Xolution class for advanced usage (creating multiple instances)
export { Xolution } from './Xolution.js';

// Export types and constants
export {
  ANALYSIS_METHODS,
  SDK_EVENTS,
  API_ENDPOINTS,
  STATUS,
  ERROR_CODES,
} from './types/index.js';

// Export edit constants
export {
  ELEMENT_TYPES,
  EDIT_ACTIONS,
} from './services/EditService.js';

// Export error classes
export {
  SDKError,
  InitializationError,
  SolveError,
  NetworkError,
  SessionError,
  ValidationError,
} from './utils/errors.js';

// Export utilities
export { EventEmitter } from './utils/EventEmitter.js';
export {
  aggregateNetworkData,
  aggregateBusData,
  aggregateAclineData,
  getAggregatedBuses,
  getAggregatedLines,
} from './utils/dataAggregator.js';

// Export core components for advanced usage
export { HttpClient } from './core/HttpClient.js';
export { SessionManager } from './core/SessionManager.js';

// Export services for advanced usage
export { SessionService } from './services/SessionService.js';
export { AnalysisService } from './services/AnalysisService.js';
export { EditService } from './services/EditService.js';