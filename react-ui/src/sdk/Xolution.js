/**
 * Xolution - Main Class
 * 
 * Orchestrates all SDK services and provides the main API
 */

import { EventEmitter } from './utils/EventEmitter.js';
import { HttpClient } from './core/HttpClient.js';
import { SessionManager } from './core/SessionManager.js';
import { SessionService } from './services/SessionService.js';
import { AnalysisService } from './services/AnalysisService.js';
import { EditService } from './services/EditService.js';
import { getElementSchema as getElementSchemaFromData } from './data/elementSchema.js';
import { InitializationError } from './utils/errors.js';
import { SDK_EVENTS, STATUS, API_ENDPOINTS } from './types/index.js';

function decodeJwtPayload(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    // Base64url decode
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function inferUserIdFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  // Prefer backend UUID if present, fall back to email as last resort
  const id = payload.uid || payload.sub || payload.email;
  return typeof id === 'string' && id.trim() !== '' ? id : null;
}

export class Xolution extends EventEmitter {
  constructor() {
    super();
    
    // Core components
    this.http = null;
    this.sessionManager = null;
    
    // Services
    this.sessions = null;
    this.analysis = null;
    this.edit = null;
    
    // State
    this.baseURL = null;
    this.userId = null;
    this.status = STATUS.IDLE;
    this.connected = false;
    
    // Cached data
    this.networkData = null;
    this.calculationStatus = null;
    
    // Configuration
    this.config = {};
    
    console.log('[XFlow] 🔍 SDK instance created');
  }

  /**
   * Initialize the SDK
   */
  async initialize(config = {}) {
    // Guard against double initialization (e.g., from React StrictMode)
    if (this.status === STATUS.CONNECTED) {
      console.warn('[XFlow] ⚠️ SDK already initialized');
      return true;
    }

    // Guard against concurrent initialization calls
    if (this.status === STATUS.CONNECTING) {
      console.warn('[XFlow] ⚠️ SDK initialization already in progress');
      return true;
    }

    this.status = STATUS.CONNECTING;
    console.log('[XFlow] ℹ️ Initializing SDK...');

    try {
      // Get base URL
      this.baseURL = config.apiBaseURL || 'http://localhost:8080';
      this.config = config;

      // Initialize core components
      this.http = new HttpClient(this.baseURL, config);
      if (config.accessToken) {
        this.http.setAccessToken(config.accessToken);
      }
      // Derive userId from explicit config or from access token claims
      if (typeof config.userId === 'string' && config.userId.trim() !== '') {
        this.userId = config.userId;
      } else if (config.accessToken) {
        this.userId = inferUserIdFromToken(config.accessToken) || 'anonymous';
      } else {
        this.userId = 'anonymous';
      }
      this.sessionManager = new SessionManager();
      
      // Initialize services
      this.sessions = new SessionService(this.http, this.sessionManager);
      this.analysis = new AnalysisService(this.http, this.sessionManager);
      this.edit = new EditService(this.http, this.sessionManager);

      // Forward events from services
      this._setupEventForwarding();

      // Load session from localStorage if enabled
      if (config.persistSession) {
        this.sessionManager.loadFromLocalStorage();
      }

      // Check backend health
      const health = await this.checkHealth();
      this.connected = health.status === 'ok' || health.status === 'healthy';

      if (!this.connected) {
        this.log(`Cannot connect to backend: ${this.baseURL}`, 'error');
        throw new InitializationError('Backend health check failed', { health });
      }

      this.status = STATUS.CONNECTED;
      this.log('SDK initialized successfully', 'success');
      this.log(`Connected to backend: ${this.baseURL}`, 'info');

      this.emit(SDK_EVENTS.INITIALIZED, {
        connected: this.connected,
        baseURL: this.baseURL,
        userId: this.userId,
      });

      return true;
    } catch (error) {
      this.status = STATUS.ERROR;
      this.connected = false;
      
      // Only log to UI if it's not already been logged (e.g., health check failure)
      // InitializationError from health check is already logged above
      if (!(error instanceof InitializationError && error.message.includes('health check'))) {
        this.log(`SDK initialization failed: ${error.message}`, 'error');
      }
      
      this.emit(SDK_EVENTS.ERROR, { type: 'initialization', error });
      
      throw error;
    }
  }

  /**
   * Check if SDK is initialized
   */
  _ensureInitialized() {
    if (!this.connected || this.status !== STATUS.CONNECTED) {
      throw new InitializationError('SDK not initialized. Call initialize() first.');
    }
  }

  /**
   * Forward events from services to main emitter
   */
  _setupEventForwarding() {
    // Forward events from all services
    Object.values(SDK_EVENTS).forEach(event => {
      if (event.startsWith('solveflow:')) {
        this.analysis.on(event, (data) => this.emit(event, data));
      }
      if (event.startsWith('edit:')) {
        this.edit.on(event, (data) => this.emit(event, data));
      }
      if (event.startsWith('session:')) {
        this.sessions.on(event, (data) => this.emit(event, data));
        this.sessionManager.on(event, (data) => this.emit(event, data));
      }
    });
  }

  // ==================== Health & Status ====================

  /**
   * Check backend health
   */
  async checkHealth() {
    try {
      const data = await this.http.get(API_ENDPOINTS.HEALTH);
      this.emit(SDK_EVENTS.HEALTH_CHECK, { status: 'ok', data });
      return { status: 'ok', ...data };
    } catch (error) {
      console.warn('[XFlow] ⚠️ Health check failed:', error.message);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.connected && this.status === STATUS.CONNECTED;
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get base URL
   */
  getBaseURL() {
    return this.baseURL;
  }

  // ==================== Session Operations ====================

  /**
   * Get session information
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async getSessionInfo(sessionId = null) {
    this._ensureInitialized();
    return this.sessions.getInfo(sessionId);
  }

  /**
   * Get network data from session.
   * getNetwork(sessionId) — full network (replaces cache).
   * getNetwork(sessionId, elementType, identifier) — fetch one type or one element; only that part is updated in cache (other types/elements kept).
   */
  async getNetwork(sessionId = null, elementType = null, identifier = null) {
    this._ensureInitialized();

    this.log('Loading network data...', 'info');

    try {
      const response = await this.sessions.getNetwork(sessionId, elementType, identifier);

      if (!elementType) {
        this.networkData = response;
        console.log('[XFlow] 🔍 Network data cached in SDK (full)');
        this.emit(SDK_EVENTS.NETWORK_UPDATED, { networkData: response });
        this.log('Network data loaded successfully', 'success');
        return response;
      }

      // Partial fetch: update only the retrieved element(s) in cache (find by identifier, update that item)
      const receivedNd = (response && (response.network_data ?? response)) || {};
      let receivedArr = Array.isArray(receivedNd[elementType]) ? receivedNd[elementType] : (receivedNd[elementType]?.data ?? []);
      if (!Array.isArray(receivedArr)) receivedArr = [];

      const base = this.networkData && typeof this.networkData === 'object'
        ? { ...this.networkData, network_data: { ...(this.networkData.network_data ?? this.networkData) } }
        : { status: response?.status, session_id: response?.session_id, network_data: {} };
      if (!base.network_data || typeof base.network_data !== 'object') base.network_data = {};

      const existingArr = Array.isArray(base.network_data[elementType]) ? [...base.network_data[elementType]] : [];
      const schema = getElementSchemaFromData(elementType);
      const idKeys = schema?.identifierKeys ?? [];
      this._updateElementArray(existingArr, receivedArr, idKeys);
      base.network_data[elementType] = existingArr;

      this.networkData = base;
      console.log('[XFlow] 🔍 Network data cache updated (', elementType, ')');
      this.emit(SDK_EVENTS.NETWORK_UPDATED, { networkData: base });
      this.log('Network data loaded successfully', 'success');

      const outNd = { [elementType]: receivedArr };
      return { ...(typeof response === 'object' && response !== null ? response : {}), network_data: outNd };
    } catch (error) {
      this.log('Failed to load network data', 'error');
      throw error;
    }
  }

  /**
   * Update existing array in place: for each received item, find element by identifier and replace its data. No append.
   * @private
   */
  _updateElementArray(existingArr, receivedArr, idKeys) {
    if (!idKeys.length) return;
    for (const item of receivedArr) {
      const id = {};
      for (const k of idKeys) {
        if (item[k] !== undefined && item[k] !== null) id[k] = item[k];
      }
      const idx = existingArr.findIndex((el) => Object.keys(id).every((k) => el[k] === id[k]));
      if (idx >= 0) existingArr[idx] = item;
    }
  }

  /**
   * Get cached network data without making an API call
   */
  getCachedNetwork() {
    return this.networkData;
  }

  /**
   * Update cached network data without making an API call
   * Useful for updating the cache after local edits
   */
  updateCachedNetwork(networkData) {
    if (!networkData) {
      console.warn('[XFlow] ⚠️ Cannot update cache with null/undefined network data');
      return;
    }
    
    this.networkData = networkData;
    console.log('[XFlow] 🔍 Network data cache updated locally');
    this.emit(SDK_EVENTS.NETWORK_UPDATED, { networkData });
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions() {
    this._ensureInitialized();
    return this.sessions.getUserSessions(this.userId);
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions() {
    this._ensureInitialized();
    return this.sessions.deleteUserSessions(this.userId);
  }

  // ==================== User File Management ====================

  /**
   * Upload a file to user's folder
   * @param {File} file - The file to upload
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  async uploadUserFile(file, fileType = 'model') {
    this._ensureInitialized();
    
    this.log(`Uploading file: ${file.name} (type: ${fileType})`, 'info');
    
    try {
      const result = await this.sessions.uploadUserFile(file, this.userId, fileType);
      this.log(`Successfully uploaded file: ${file.name}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to upload file: ${file.name}`, 'error');
      throw error;
    }
  }

  /**
   * Get list of files for a user
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  /**
   * Call style: getUserFiles(fileType) or getUserFiles({ fileType }) for MCP.
   */
  async getUserFiles(fileTypeOrOptions = 'model') {
    this._ensureInitialized();
    const isOptions = fileTypeOrOptions != null && typeof fileTypeOrOptions === 'object' && !Array.isArray(fileTypeOrOptions);
    const fileType = isOptions ? (fileTypeOrOptions.fileType ?? 'model') : fileTypeOrOptions;
    return this.sessions.getUserFiles(this.userId, fileType);
  }

  /**
   * Download a user file
   * @param {string} fileName - Name of the file to download
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'knowledge')
   * @param {object} options - Optional headers for cache validation (If-None-Match, If-Modified-Since, Range)
   * @returns {Promise<Blob>} The file as a Blob
   */
  async downloadUserFile(fileName, fileType = 'knowledge', options = {}) {
    this._ensureInitialized();
    
    this.log(`Downloading file: ${fileName} (type: ${fileType})`, 'info');
    
    try {
      const blob = await this.sessions.downloadUserFile(fileName, this.userId, fileType, options);
      this.log(`Successfully downloaded file: ${fileName}`, 'success');
      return blob;
    } catch (error) {
      this.log(`Failed to download file: ${fileName}`, 'error');
      throw error;
    }
  }

  /**
   * Create a session from a user's file
   */
  async createSessionFromFile(fileName) {
    this._ensureInitialized();

    this.log(`Opening file: ${fileName}`, 'info');
    this.clearCache();

    try {
      const result = await this.sessions.createSessionFromFile(fileName, this.userId);
      this.log(`Successfully opened file: ${fileName}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to open file: ${fileName}`, 'error');
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.networkData = null;
    this.calculationStatus = null;
    console.log('[XFlow] 🔍 SDK cache cleared');
  }

  /**
   * Save session working file back to original user file
   */
  async saveSessionToUserFile(sessionId = null) {
    this._ensureInitialized();

    this.log('Saving file...', 'info');

    try {
      const result = await this.sessions.saveSessionToUserFile(sessionId);
      this.log('File saved successfully', 'success');
      return result;
    } catch (error) {
      this.log('Failed to save file', 'error');
      throw error;
    }
  }

  /**
   * Save session working file as a new user file
   * @param {string} newFileName - Name for the new file
   * @param {string} sessionId - Session ID (optional, uses current session if not provided)
   */
  async saveSessionAsUserFile(newFileName, sessionId = null) {
    this._ensureInitialized();

    if (!newFileName) {
      throw new Error('New file name is required');
    }

    this.log(`Saving file as: ${newFileName}`, 'info');

    try {
      const result = await this.sessions.saveSessionAsUserFile(newFileName, sessionId);
      this.log('File saved as new file successfully', 'success');
      return result;
    } catch (error) {
      this.log('Failed to save file as new file', 'error');
      throw error;
    }
  }

  /**
   * Delete a user file
   * @param {string} fileName - Name of the file to delete
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  async deleteUserFile(fileName, fileType = 'model') {
    this._ensureInitialized();
    
    this.log(`Deleting file: ${fileName} (type: ${fileType})`, 'info');
    
    try {
      const result = await this.sessions.deleteUserFile(fileName, this.userId, fileType);
      this.log(`Successfully deleted file: ${fileName}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to delete file: ${fileName}`, 'error');
      throw error;
    }
  }

  /**
   * Get user file info
   */
  async getUserFileInfo(fileName) {
    this._ensureInitialized();
    return this.sessions.getUserFileInfo(fileName, this.userId);
  }


  // ==================== Study Files (.sub/.mon/.con) ====================

  /**
   * Load a study file (.sub/.mon/.con) from the user library into a session.
   * @param {'sub'|'mon'|'con'} fileType - Study-file type
   * @param {string} fileName - Name of the library file to load
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async loadStudyFile(fileType, fileName, sessionId = null) {
    this._ensureInitialized();
    this.log(`Loading ${fileType} file: ${fileName}`, 'info');
    try {
      const result = await this.sessions.loadStudyFile(fileType, fileName, sessionId);
      this.log(`Successfully loaded ${fileType} file: ${fileName}`, 'success');
      // The load response carries the validation result for all study files.
      this._logStudyValidation(result);
      return result;
    } catch (error) {
      this.log(`Failed to load ${fileType} file: ${fileName}`, 'error');
      throw error;
    }
  }

  /**
   * Load a .sub subsystem file into the session.
   * @param {string} fileName - Name of the library file to load
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async loadSub(fileName, sessionId = null) {
    return this.loadStudyFile('sub', fileName, sessionId);
  }

  /**
   * Load a .mon monitor file into the session.
   * @param {string} fileName - Name of the library file to load
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async loadMon(fileName, sessionId = null) {
    return this.loadStudyFile('mon', fileName, sessionId);
  }

  /**
   * Load a .con contingency file into the session.
   * @param {string} fileName - Name of the library file to load
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async loadCon(fileName, sessionId = null) {
    return this.loadStudyFile('con', fileName, sessionId);
  }

  /**
   * Parse and resolve the session's loaded study files without solving.
   * Returns `{ status, has_files, diagnostics }`.
   * @param {string} [sessionId] - Session ID (optional, uses current session if not provided)
   */
  async validateStudyFiles(sessionId = null) {
    this._ensureInitialized();
    const result = await this.sessions.validateStudyFiles(sessionId);
    this._logStudyValidation(result);
    return result;
  }

  /**
   * Log a study-file validation result to the command logger — a summary line
   * plus one line per diagnostic. Accepts either a load response or a validate
   * response; both embed the validation result. Tolerates an older backend
   * that returns no validation payload.
   * @private
   */
  _logStudyValidation(result) {
    if (!result || !Array.isArray(result.diagnostics)) {
      return;
    }
    if (result.has_files === false) {
      // No study files attached is a non-event (e.g. the Run Analysis modal
      // just opened and checked) — don't clutter the command logger with a
      // line that reads like a problem.
      return;
    }
    const diags = result.diagnostics;
    const errors = result.errors || 0;
    const warnings = result.warnings || 0;
    if (diags.length === 0) {
      this.log('Study file validation: no issues', 'success');
      return;
    }
    this.log(
      `Study file validation: ${errors} error(s), ${warnings} warning(s)`,
      errors > 0 ? 'error' : 'warning',
    );
    for (const d of diags) {
      const loc = d.line ? `${d.file}:${d.line}` : d.file;
      this.log(`  ${loc} — ${d.message}`, d.severity === 'error' ? 'error' : 'warning');
    }
  }

  // ==================== AC Contingency Analysis ====================

  /**
   * Start an AC contingency analysis run; returns the async analysis job.
   * @param {string} [sessionId] - Session ID (optional, uses current session)
   * @param {object} [settings] - Run settings: report_scope, loading_threshold_pct,
   *   transformer_loading_basis, nontransformer_loading_basis. Omitted fields
   *   take the engine defaults.
   * @param {object} [config] - Power flow configuration (the same AC solution
   *   options a standalone solve uses). The run is always solved AC. Omitted
   *   means an AC default.
   */
  async startContingencyAnalysis(sessionId = null, settings = null, config = null) {
    this._ensureInitialized();
    this.log('Starting AC contingency analysis…', 'info');
    return this.sessions.startContingencyAnalysis(sessionId, settings, config);
  }

  /** Get an analysis job's status and progress. */
  async getAnalysisJob(jobId) {
    this._ensureInitialized();
    return this.sessions.getAnalysisJob(jobId);
  }

  /** Get a completed analysis job's report. */
  async getAnalysisReport(jobId) {
    this._ensureInitialized();
    return this.sessions.getAnalysisReport(jobId);
  }

  /** Cancel a running analysis job. */
  async cancelAnalysisJob(jobId) {
    this._ensureInitialized();
    this.log('Cancelling analysis job…', 'info');
    return this.sessions.cancelAnalysisJob(jobId);
  }

  /** List the user's stored study results (durable analysis history). */
  async listStudyResults() {
    this._ensureInitialized();
    return this.sessions.listStudyResults();
  }

  /** Open one stored study result — its metadata and full report. */
  async getStudyResult(resultId) {
    this._ensureInitialized();
    return this.sessions.getStudyResult(resultId);
  }

  /** Delete a stored study result. */
  async deleteStudyResult(resultId) {
    this._ensureInitialized();
    this.log('Deleting study result…', 'info');
    return this.sessions.deleteStudyResult(resultId);
  }


  // ==================== Edit Operations ====================

  /**
   * Edit a network element
   */
  async editElement(elementType, action, options = {}) {
    this._ensureInitialized();
    return this.edit.editElement(elementType, action, options);
  }

  /**
   * Add a network element
   */
  async addElement(elementType, data, options = {}) {
    this._ensureInitialized();

    this.log(`Adding ${elementType}...`, 'info');

    try {
      const result = await this.edit.addElement(elementType, data, options);
      this.log(`Successfully added ${elementType}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to add ${elementType}`, 'error');
      throw error;
    }
  }

  /**
   * Modify a network element
   */
  async modifyElement(elementType, identifier, data, options = {}) {
    this._ensureInitialized();

    this.log(`Modifying ${elementType}...`, 'info');

    try {
      const result = await this.edit.modifyElement(elementType, identifier, data, options);
      this.log(`Successfully modified ${elementType}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to modify ${elementType}`, 'error');
      throw error;
    }
  }

  /**
   * Delete a network element
   */
  async deleteElement(elementType, identifier, options = {}) {
    this._ensureInitialized();

    this.log(`Deleting ${elementType}...`, 'info');

    try {
      const result = await this.edit.deleteElement(elementType, identifier, options);
      this.log(`Successfully deleted ${elementType}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed to delete ${elementType}`, 'error');
      throw error;
    }
  }

  /**
   * Get the schema for an element type: identifier keys and data keys.
   * Does not require initialization.
   */
  getElementSchema(elementType) {
    return getElementSchemaFromData(elementType);
  }

  // ==================== Calculation Operations ====================

  /**
   * Solve power flow calculation
   */
  async solveFlow(method, options) {
    this._ensureInitialized();

    // Map method names to display names
    const methodNames = {
      'dc': 'DC Power Flow',
      'fnsl': 'Full Newton (fnsl) Power Flow',
      'fdns': 'Fast Decoupled (fdns) Power Flow'
    };
    const displayMethod = methodNames[method] || method.toUpperCase();

    this.log(`Starting ${displayMethod} calculation...`, 'info');

    try {
      const result = await this.analysis.solveFlow(method, options);

      // Cache the calculation status
      this.calculationStatus = result;
      console.log('[XFlow] 🔍 Calculation status cached in SDK');
      
      // Check if converged
      const converged = result.converged;
      const success = result.success;

      // Solve-health enrichment (`surface-solve-telemetry`): the calculate
      // response now carries iterations / solution_time_ms / fdns_fallback
      // directly — use them and skip the legacy getPowerFlowData round-trip.
      // The fetch remains as a fallback for older api-servers that don't
      // surface the fields yet (mixed-deployment tolerance).
      let iterations = typeof result.iterations === 'number' ? result.iterations : null;
      const solveMs = typeof result.solution_time_ms === 'number' ? result.solution_time_ms : null;
      const fdnsFallback = result.fdns_fallback === true;
      const isAcMethod = (method || '').toLowerCase() !== 'dc';
      if (iterations === null && success && converged && isAcMethod && result.session_id) {
        try {
          const data = await this.analysis.getPowerFlowData({ sessionId: result.session_id });
          if (data && typeof data.iterations === 'number') {
            iterations = data.iterations;
          }
        } catch (e) {
          // If fetching detailed results fails, just fall back to basic logging
          console.warn('[XFlow] ⚠️ Failed to fetch power flow data for iteration count:', e?.message || e);
        }
      }

      if (success && converged) {
        // Health line: method + iterations + wall time, with an explicit
        // (calm) note when fast-decoupled fell back to full Newton — that is
        // the solver's never-worse contract working, not an error.
        const parts = [];
        if (isAcMethod && typeof iterations === 'number') {
          parts.push(`${iterations} iteration${iterations === 1 ? '' : 's'}`);
        }
        if (solveMs !== null) {
          parts.push(solveMs >= 1000 ? `${(solveMs / 1000).toFixed(1)} s` : `${Math.round(solveMs)} ms`);
        }
        const health = parts.length ? ` in ${parts.join(', ')}` : '';
        const fallbackNote = fdnsFallback
          ? ' (fast-decoupled fell back to full Newton)'
          : '';
        this.log(`${displayMethod} completed successfully${health}${fallbackNote}`, 'success');
      } else if (success && !converged) {
        this.log(`${displayMethod} completed but did not converge`, 'warning');
      } else {
        this.log(`${displayMethod} calculation failed`, 'error');
      }
      
      return result;
    } catch (error) {
      this.log(`${displayMethod} calculation failed`, 'error');
      throw error;
    }
  }

  /**
   * Get power flow calculation results
   * @param {object} options - Options for retrieving results
   * @param {string} options.sessionId - Session ID (optional)
   * @param {number[]} options.busNumbers - Filter by bus numbers (optional)
   * @param {Array<{from_bus: number, to_bus: number, id?: string}>} options.branches - Filter by branches (optional)
   */
  async getPowerFlowData(options = {}) {
    this._ensureInitialized();
    return this.analysis.getPowerFlowData(options);
  }

  /**
   * Get cached calculation status without making an API call
   */
  getCachedCalculationStatus() {
    return this.calculationStatus;
  }

  /**
   * Get cached calculation result - deprecated, use getPowerFlowData instead
   * @deprecated Use getPowerFlowData() instead
   */
  getCachedCalculationResult() {
    console.warn('[XFlow] ⚠️ getCachedCalculationResult() is deprecated. Use getPowerFlowData() instead.');
    return this.calculationResult;
  }

  /**
   * Get cached results - deprecated, use getPowerFlowData instead
   * @deprecated Use getPowerFlowData() instead
   */
  async getResults(sessionId) {
    this._ensureInitialized();
    return this.analysis.getResults(sessionId);
  }

  /**
   * Run batch calculation
   */
  async batchCalculate(methods, options) {
    this._ensureInitialized();
    
    this.log(`Starting batch calculation with ${methods.length} methods...`, 'info');
    
    try {
      const results = await this.analysis.batchCalculate(methods, options);
      this.log(`Batch calculation completed successfully`, 'success');
      return results;
    } catch (error) {
      this.log(`Batch calculation failed`, 'error');
      throw error;
    }
  }

  /**
   * Alias for backward compatibility
   */
  async batchSolve(methods, options) {
    return this.batchCalculate(methods, options);
  }

  /**
   * Compare multiple calculation methods
   */
  async compareAnalysis(methods) {
    this._ensureInitialized();
    return this.analysis.compareAnalysis(methods);
  }

  // ==================== Convenience Methods ====================

  /**
   * Complete user-centric workflow: upload to user folder, create session, calculate
   */
  async uploadAndCalculate(file, method, options = {}) {
    this._ensureInitialized();
    
    this.log(`Starting complete workflow for ${file.name}...`, 'info');
    
    try {
      // Upload file to user folder
      const uploadResult = await this.uploadUserFile(file);
      
      // Create session from the uploaded file
      const sessionResult = await this.createSessionFromFile(uploadResult.file_name);
      
      // Solve power flow
      const result = await this.solveFlow(method, {
        ...options,
        sessionId: sessionResult.session_id,
      });
      
      this.log(`Workflow completed successfully for ${file.name}`, 'success');
      
      return result;
    } catch (error) {
      this.log(`Workflow failed for ${file.name}`, 'error');
      throw error;
    }
  }


  // ==================== Session Management ====================

  /**
   * Get current session ID
   */
  getSession() {
    return this.sessionManager.getSessionId();
  }

  /**
   * Set session ID
   */
  setSession(sessionId) {
    this.sessionManager.setSessionId(sessionId);
  }

  /**
   * Clear current session
   */
  clearSession() {
    this.log('Clearing session...', 'info');
    this.sessionManager.clearSession();
    if (this.config.persistSession) {
      this.sessionManager.clearLocalStorage();
    }
    this.log('Session cleared', 'success');
  }

  /**
   * Check if session exists
   */
  hasSession() {
    return this.sessionManager.hasSession();
  }

  /**
   * Get session data
   */
  getSessionData(key) {
    return this.sessionManager.getData(key);
  }

  // ==================== Configuration ====================

  /**
   * Update configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    
    if (config.apiBaseURL && this.http) {
      this.http.setBaseURL(config.apiBaseURL);
      this.baseURL = config.apiBaseURL;
    }

    if ('accessToken' in config && this.http) {
      this.http.setAccessToken(config.accessToken);
    }

    // Prefer explicit userId when provided; otherwise derive from access token if available.
    if (typeof config.userId === 'string' && config.userId.trim() !== '') {
      this.userId = config.userId;
    } else if ('accessToken' in config && config.accessToken) {
      const inferred = inferUserIdFromToken(config.accessToken);
      if (inferred) {
        this.userId = inferred;
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig() {
    // Always expose the resolved userId so consumers (MCP, AI assistant, etc.)
    // can reliably know which authenticated user the SDK is operating on,
    // even if userId was inferred from the access token.
    return { ...this.config, userId: this.userId };
  }

  // ==================== Public Logging ====================

  /**
   * Public logging method that emits log events for UI components
   * @param {string} message - Log message
   * @param {string} level - Log level: 'info' | 'success' | 'warning' | 'error' | 'debug'
   * @returns {Object} Log entry
   */
  log(message, level = 'info') {
    // Create timestamp
    const timestamp = new Date().toISOString();
    
    // Create log entry
    const logEntry = {
      timestamp,
      level,
      message
    };
    
    // Emit event for UI components to listen
    this.emit(SDK_EVENTS.LOG, logEntry);
    
    // Also log to console with formatting
    const prefix = '[XFlow]';
    const icons = {
      error: '❌',
      warning: '⚠️',
      success: '✅',
      info: 'ℹ️',
      debug: '🔍'
    };
    const icon = icons[level] || icons.info;
    
    switch(level) {
      case 'error':
        console.error(`${prefix} ${icon}`, message);
        break;
      case 'warning':
        console.warn(`${prefix} ${icon}`, message);
        break;
      case 'debug':
        console.log(`${prefix} ${icon}`, message);
        break;
      case 'success':
      case 'info':
      default:
        console.log(`${prefix} ${icon}`, message);
        break;
    }
    
    return logEntry;
  }

  // ==================== Reset & Cleanup ====================

  /**
   * Reset SDK to initial state
   */
  reset() {
    this.log('Resetting SDK...', 'info');
    
    this.sessionManager.clearSession();
    this.connected = false;
    this.status = STATUS.IDLE;
    
    if (this.config.persistSession) {
      this.sessionManager.clearLocalStorage();
    }
    
    this.removeAllListeners();
    
    this.emit(SDK_EVENTS.RESET);
    this.log('SDK reset complete', 'success');
  }

  /**
   * Destroy SDK instance
   */
  destroy() {
    this.reset();
    this.http = null;
    this.sessionManager = null;
    this.sessions = null;
    this.upload = null;
    this.analysis = null;
    this.edit = null;
    console.log('[XFlow] ℹ️ SDK destroyed');
  }
}