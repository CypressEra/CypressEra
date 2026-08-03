/**
 * Session Service
 * 
 * Handles session lifecycle and operations
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { SessionError, ValidationError } from '../utils/errors.js';
import { SDK_EVENTS, API_ENDPOINTS } from '../types/index.js';

// User-file library categories. Study files (.sub/.mon/.con) are the analysis
// inputs; model/knowledge are the case and reference libraries; diagram is the
// saved network-diagram layout (.cyd / .cyd.gz).
const STUDY_FILE_TYPES = ['sub', 'mon', 'con'];
const USER_FILE_TYPES = ['model', 'knowledge', 'diagram', ...STUDY_FILE_TYPES];

export class SessionService extends EventEmitter {
  constructor(httpClient, sessionManager) {
    super();
    this.http = httpClient;
    this.session = sessionManager;
  }


  /**
   * Get session information
   */
  async getInfo(sessionId = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }

    console.log('Fetching session info:', sid);

    try {
      const data = await this.http.post(API_ENDPOINTS.SESSION_INFO, {
        session_id: sid,
      });

      return data;
    } catch (error) {
      console.error('Failed to get session info:', error);
      throw new SessionError(error.message, { originalError: error, sessionId: sid });
    }
  }

  /**
   * Get network data from session.
   * @param {string|null} sessionId - Session ID
   * @param {string|null} elementType - Optional: bus, load, generator, acline, transformer (sent to API; backend may filter or SDK filters client-side)
   * @param {object|null} identifier - Optional: filter to one element (sent to API when provided)
   */
  async getNetwork(sessionId = null, elementType = null, identifier = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }

    console.log('Fetching network data for session:', sid, elementType ? { elementType, identifier } : '');

    try {
      const requestData = {
        session_id: sid,
      };
      if (elementType != null) requestData.element_type = elementType;
      if (identifier != null && typeof identifier === 'object' && Object.keys(identifier).length > 0) {
        requestData.identifier = identifier;
      }

      const data = await this.http.post(API_ENDPOINTS.SESSION_NETWORK, requestData);

      return data;
    } catch (error) {
      console.error('Failed to get network data:', error);
      throw new SessionError(error.message, { originalError: error, sessionId: sid });
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId) {
    console.log('Fetching sessions for authenticated user');

    try {
      const data = await this.http.post(API_ENDPOINTS.USER_SESSIONS, {});

      return data;
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      throw new SessionError(error.message, { originalError: error });
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId) {
    console.log('Deleting sessions for authenticated user');

    try {
      const data = await this.http.delete(API_ENDPOINTS.USER_SESSIONS, {
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // user_id is inferred from JWT on the server
        }),
      });

      console.log('Sessions deleted');
      return data;
    } catch (error) {
      console.error('Failed to delete user sessions:', error);
      throw new SessionError(error.message, { originalError: error });
    }
  }

  // ==================== Study Files (.sub/.mon/.con) ====================

  /**
   * Load a study file (.sub/.mon/.con) from the user library into a session.
   * @param {'sub'|'mon'|'con'} fileType - Study-file type
   * @param {string} fileName - Name of the library file to load
   * @param {string|null} sessionId - Session ID (uses current session if omitted)
   */
  async loadStudyFile(fileType, fileName, sessionId = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }
    if (!fileName) {
      throw new ValidationError('File name is required');
    }
    const endpoints = {
      sub: API_ENDPOINTS.SESSION_LOAD_SUB,
      mon: API_ENDPOINTS.SESSION_LOAD_MON,
      con: API_ENDPOINTS.SESSION_LOAD_CON,
    };
    const endpoint = endpoints[fileType];
    if (!endpoint) {
      throw new ValidationError('fileType must be "sub", "mon", or "con"');
    }

    console.log('Loading study file into session:', { fileType, fileName, sessionId: sid });

    try {
      const data = await this.http.post(endpoint, {
        session_id: sid,
        file_name: fileName,
      });
      console.log('Study file loaded into session:', data);
      return data;
    } catch (error) {
      console.error('Failed to load study file:', error);
      throw new SessionError(error.message, { originalError: error, fileType, fileName, sessionId: sid });
    }
  }

  /** Load a .sub subsystem file into the session. */
  async loadSub(fileName, sessionId = null) {
    return this.loadStudyFile('sub', fileName, sessionId);
  }

  /** Load a .mon monitor file into the session. */
  async loadMon(fileName, sessionId = null) {
    return this.loadStudyFile('mon', fileName, sessionId);
  }

  /** Load a .con contingency file into the session. */
  async loadCon(fileName, sessionId = null) {
    return this.loadStudyFile('con', fileName, sessionId);
  }

  /**
   * Start an AC contingency analysis run for the session. Returns the
   * analysis job (`{ id, state, progress, ... }`); the run is asynchronous.
   * @param {string|null} sessionId - Session ID (uses current session if omitted)
   */
  async startContingencyAnalysis(sessionId = null, settings = null, config = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }
    try {
      const body = { session_id: sid };
      if (settings) {
        body.settings = settings;
      }
      if (config) {
        body.config = config;
      }
      return await this.http.post(API_ENDPOINTS.SESSION_CONTINGENCY, body);
    } catch (error) {
      throw new SessionError(error.message, { originalError: error, sessionId: sid });
    }
  }

  /** Get an analysis job's status and latest progress. */
  async getAnalysisJob(jobId) {
    if (!jobId) {
      throw new ValidationError('Job ID is required');
    }
    return await this.http.get(`${API_ENDPOINTS.ANALYSIS_JOBS}/${jobId}`);
  }

  /** Get a completed analysis job's report. */
  async getAnalysisReport(jobId) {
    if (!jobId) {
      throw new ValidationError('Job ID is required');
    }
    return await this.http.get(`${API_ENDPOINTS.ANALYSIS_JOBS}/${jobId}/report`);
  }

  /** Cancel a running analysis job. */
  async cancelAnalysisJob(jobId) {
    if (!jobId) {
      throw new ValidationError('Job ID is required');
    }
    return await this.http.post(`${API_ENDPOINTS.ANALYSIS_JOBS}/${jobId}/cancel`, {});
  }

  // ==================== Study Results (durable history) ====================

  /** List the current user's stored study results (metadata summaries). */
  async listStudyResults() {
    return await this.http.get(API_ENDPOINTS.STUDY_RESULTS);
  }

  /** Fetch one study result — its metadata and full report. */
  async getStudyResult(resultId) {
    if (!resultId) {
      throw new ValidationError('Result ID is required');
    }
    return await this.http.get(`${API_ENDPOINTS.STUDY_RESULTS}/${resultId}`);
  }

  /** Delete a stored study result. */
  async deleteStudyResult(resultId) {
    if (!resultId) {
      throw new ValidationError('Result ID is required');
    }
    return await this.http.delete(`${API_ENDPOINTS.STUDY_RESULTS}/${resultId}`);
  }

  /**
   * Parse and resolve the session's loaded study files without running a
   * power flow. Returns `{ status, has_files, diagnostics }`.
   * @param {string|null} sessionId - Session ID (uses current session if omitted)
   */
  async validateStudyFiles(sessionId = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }
    try {
      return await this.http.post(API_ENDPOINTS.SESSION_STUDY_VALIDATE, { session_id: sid });
    } catch (error) {
      throw new SessionError(error.message, { originalError: error, sessionId: sid });
    }
  }

  // ==================== User File Management ====================

  /**
   * Upload a file to user's folder
   * @param {File} file - The file to upload
   * @param {string} userId - User ID
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  async uploadUserFile(file, userId, fileType = 'model') {
    if (!file) {
      throw new ValidationError('File is required');
    }
    if (!USER_FILE_TYPES.includes(fileType)) {
      throw new ValidationError(`fileType must be one of: ${USER_FILE_TYPES.join(', ')}`);
    }

    console.log('Uploading file to user folder:', { fileName: file.name, fileType });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', fileType);

      const data = await this.http.postFormData(API_ENDPOINTS.USER_UPLOAD, formData);

      console.log('File uploaded to user folder:', data);
      return data;
    } catch (error) {
      console.error('Failed to upload file to user folder:', error);
      throw new SessionError(error.message, { originalError: error, fileName: file.name, fileType });
    }
  }


  /**
   * Create a session from a user's file
   */
  async createSessionFromFile(fileName, userId) {
    if (!fileName) {
      throw new ValidationError('File name is required');
    }

    console.log('Creating session from user file:', { fileName });

    try {
      const data = await this.http.post(API_ENDPOINTS.SESSION_LOAD_CASE, {
        file_name: fileName,
      });

      if (!data.session_id) {
        throw new SessionError('No session ID returned from server');
      }

      // Store session
      this.session.setSessionId(data.session_id);
      this.session.setData('originalFileName', fileName);
      this.session.setData('createdAt', new Date().toISOString());

      console.log('Session created from file:', data.session_id);
      this.emit(SDK_EVENTS.SESSION_CREATED, {
        sessionId: data.session_id,
        originalFileName: fileName,
      });

      return data;
    } catch (error) {
      console.error('Failed to create session from file:', error);
      this.emit(SDK_EVENTS.ERROR, { type: 'session_create_from_file', error });
      
      if (error instanceof SessionError || error instanceof ValidationError) {
        throw error;
      }
      throw new SessionError(error.message, { originalError: error, fileName });
    }
  }

  /**
   * Save session working file back to original user file
   */
  async saveSessionToUserFile(sessionId = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }

    console.log('Saving session to user file:', sid);

    try {
      const data = await this.http.post(API_ENDPOINTS.SESSION_SAVE_CASE, {
        session_id: sid,
      });

      console.log('Session saved to user file:', data);
      return data;
    } catch (error) {
      console.error('Failed to save session to user file:', error);
      throw new SessionError(error.message, { originalError: error, sessionId: sid });
    }
  }

  /**
   * Save session working file as a new user file
   * @param {string} newFileName - Name for the new file
   * @param {string} sessionId - Session ID (optional, uses current session if not provided)
   */
  async saveSessionAsUserFile(newFileName, sessionId = null) {
    const sid = sessionId || this.session.getSessionId();
    if (!sid) {
      throw new SessionError('No session ID provided');
    }
    if (!newFileName) {
      throw new ValidationError('New file name is required');
    }

    console.log('Saving session as new user file:', { sessionId: sid, newFileName });

    try {
      const data = await this.http.post(API_ENDPOINTS.SESSION_SAVE_CASE_AS, {
        session_id: sid,
        new_file_name: newFileName,
      });

      console.log('Session saved as new user file:', data);
      
      // Update session data with new file name if available
      if (data.file_name) {
        this.session.setData('originalFileName', data.file_name);
      }

      // Emit SESSION_CHANGED event to notify listeners (like usePowerFlowSDK hook)
      // This ensures state updates work whether called from UI or MCP
      this.emit(SDK_EVENTS.SESSION_CHANGED, {
        sessionId: sid,
        fileName: data.file_name || newFileName,
        action: 'save_as'
      });

      return data;
    } catch (error) {
      console.error('Failed to save session as new user file:', error);
      throw new SessionError(error.message, { originalError: error, sessionId: sid, newFileName });
    }
  }

  /**
   * Get all user files
   * @param {string} userId - User ID (optional, uses session user if not provided)
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  async getUserFiles(userId = undefined, fileType = 'model') {
    if (!USER_FILE_TYPES.includes(fileType)) {
      throw new ValidationError(`fileType must be one of: ${USER_FILE_TYPES.join(', ')}`);
    }

    console.log('Fetching user files for authenticated user, fileType:', fileType);

    try {
      const data = await this.http.post(API_ENDPOINTS.USER_FILES, {
        file_type: fileType,
      });

      console.log('User files retrieved:', data.files?.length || 0);
      return data;
    } catch (error) {
      console.error('Failed to get user files:', error);
      throw new SessionError(error.message, { originalError: error, fileType });
    }
  }

  /**
   * Delete a user file
   * @param {string} fileName - Name of the file to delete
   * @param {string} userId - User ID (optional, uses current user if not provided)
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'model')
   */
  async deleteUserFile(fileName, userId = undefined, fileType = 'model') {
    if (!fileName) {
      throw new ValidationError('File name is required');
    }
    if (!USER_FILE_TYPES.includes(fileType)) {
      throw new ValidationError(`fileType must be one of: ${USER_FILE_TYPES.join(', ')}`);
    }

    console.log('Deleting user file:', fileName, 'type:', fileType);

    try {
      const data = await this.http.post(API_ENDPOINTS.USER_FILES_DELETE, {
        file_type: fileType,
        file_name: fileName,
      });

      console.log('User file deleted:', fileName);
      this.emit(SDK_EVENTS.FILE_DELETED, { fileName, fileType });
      return data;
    } catch (error) {
      console.error('Failed to delete user file:', error);
      throw new SessionError(error.message, { originalError: error, fileName, fileType });
    }
  }

  /**
   * Get user file info
   */
  async getUserFileInfo(fileName, userId = undefined) {
    if (!fileName) {
      throw new ValidationError('File name is required');
    }

    console.log('Getting user file info:', fileName);

    try {
      const data = await this.http.get(`${API_ENDPOINTS.USER_FILES}/${encodeURIComponent(fileName)}`);

      return data;
    } catch (error) {
      console.error('Failed to get user file info:', error);
      throw new SessionError(error.message, { originalError: error, fileName });
    }
  }

  /**
   * Download a user file
   * @param {string} fileName - Name of the file to download
   * @param {string} userId - User ID (optional, uses current user if not provided)
   * @param {string} fileType - File type: 'model' or 'knowledge' (default: 'knowledge')
   * @param {object} options - Optional headers for cache validation (If-None-Match, If-Modified-Since, Range)
   * @returns {Promise<Blob>} The file as a Blob
   */
  async downloadUserFile(fileName, userId = undefined, fileType = 'knowledge', options = {}) {
    if (!fileName) {
      throw new ValidationError('File name is required');
    }
    if (!USER_FILE_TYPES.includes(fileType)) {
      throw new ValidationError(`fileType must be one of: ${USER_FILE_TYPES.join(', ')}`);
    }

    console.log('Downloading user file:', fileName, 'type:', fileType);

    try {
      const headers = {};
      
      // Add cache validation headers if provided
      if (options.ifNoneMatch) {
        headers['If-None-Match'] = options.ifNoneMatch;
      }
      if (options.ifModifiedSince) {
        headers['If-Modified-Since'] = options.ifModifiedSince;
      }
      if (options.range) {
        headers['Range'] = options.range;
      }

      const blob = await this.http.postBlob(API_ENDPOINTS.USER_FILES_DOWNLOAD, {
        file_type: fileType,
        file_name: fileName,
      }, { headers });

      console.log('User file downloaded:', fileName, 'size:', blob.size);
      return blob;
    } catch (error) {
      console.error('Failed to download user file:', error);
      throw new SessionError(error.message, { originalError: error, fileName, fileType });
    }
  }
}
