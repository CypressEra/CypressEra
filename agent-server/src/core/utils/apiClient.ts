/**
 * API Server Client
 * 
 * HTTP client for MCP-Server to communicate with API-Server directly.
 * Handles service authentication, error handling, and retry logic.
 */

import { getConfig } from '../config/index.js';
import { getCachedServiceToken } from './serviceAuth.js';

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number; // HTTP status code (set on failed responses, drives retry logic)
  // api-server's machine-readable error code (e.g. "analysis_in_progress",
  // "job_not_found"). Preserved separately so callers can branch on the code
  // even when `error` holds the human-readable message.
  errorCode?: string;
}

// Session types
export interface SessionInfo {
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  file_name?: string;
  status: string;
}

export interface CreateSessionResponse {
  session_id: string;
  message: string;
}

export interface NetworkData {
  buses: unknown[];
  branches: unknown[];
  generators: unknown[];
  loads: unknown[];
  transformers: unknown[];
  shunts: unknown[];
  [key: string]: unknown;
}

// Mirror of api-server's StudyValidationResult / studyfile.Diagnostic.
// Returned by the validate endpoint and embedded in the load-study-file response.
export interface StudyDiagnostic {
  // The exact field set varies by the api-server's studyfile package; we
  // accept anything here and pass it through. Common fields: severity, message,
  // file, line, col.
  [key: string]: unknown;
}

export interface StudyValidationResult {
  has_files?: boolean;
  has_model?: boolean;
  diagnostics?: StudyDiagnostic[];
  errors?: number;
  warnings?: number;
}

export interface StudyFileLoadResponse extends StudyValidationResult {
  status: string;
  message: string;
  session_id: string;
  file_name: string;
  type: 'sub' | 'mon' | 'con';
}

// Mirror of api-server's services.AnalysisJob JSON (services/analysis_job.go:34).
// Fields are optional because some are only populated in certain states.
export interface AnalysisJobResponse {
  id: string;
  session_id: string;
  type?: string;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: { done: number; total: number; violations?: number; detail?: string };
  error?: string;
  created_at: string;
  updated_at: string;
  study_result_id?: string;
}

export interface PowerFlowResult {
  converged: boolean;
  iterations: number;
  buses: unknown[];
  branches: unknown[];
  summary: {
    total_generation_mw: number;
    total_load_mw: number;
    total_losses_mw: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Request options
interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  userId?: string; // User ID (for logging/context)
  userToken?: string; // User's JWT token for authentication
}

// Default timeout (30 seconds)
const DEFAULT_TIMEOUT = 30000;

// Default retries
const DEFAULT_RETRIES = 3;

// Token cache per user (to support multi-user scenarios)
const tokenCacheByUser = new Map<string, { token: string; expiresAt: number }>();

/**
 * Get or generate a cached service token for a specific user
 */
function getServiceTokenForUser(userId: string | undefined, secret: string): string {
  const config = getConfig();
  const { serviceAuth } = config;
  
  // Use provided userId or fall back to defaultUserId
  const effectiveUserId = userId || serviceAuth.defaultUserId;
  const cacheKey = effectiveUserId || 'anonymous';
  
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  
  // Check cache
  const cached = tokenCacheByUser.get(cacheKey);
  if (cached && cached.expiresAt > now + bufferMs) {
    return cached.token;
  }
  
  // Generate new token
  const token = getCachedServiceToken(
    'agent-server',
    ['session:read', 'session:write', 'network:read', 'network:write', 'powerflow:execute'],
    effectiveUserId,
    secret
  );
  
  // Cache the token
  tokenCacheByUser.set(cacheKey, {
    token,
    expiresAt: now + 3600 * 1000, // 1 hour
  });
  
  return token;
}

/**
 * Make an authenticated request to API-Server
 */
async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const config = getConfig();
  const { serviceAuth } = config;
  
  // Build URL
  const url = `${serviceAuth.apiServerUrl}${endpoint}`;
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Use user's JWT token if provided, otherwise fall back to service token
  if (options.userToken) {
    headers['Authorization'] = `Bearer ${options.userToken}`;
    console.log('[ApiClient] Using user JWT token for authentication');
  } else if (serviceAuth.enabled && serviceAuth.secret) {
    // Fallback to service token for headless mode
    const serviceToken = getServiceTokenForUser(options.userId, serviceAuth.secret);
    headers['X-Service-Token'] = serviceToken;
    console.log('[ApiClient] Using service token for authentication (headless mode)');
  }
  
  // Build request
  const requestInit: RequestInit = {
    method: options.method,
    headers,
  };
  
  // Add body for POST/PUT
  if (options.body && (options.method === 'POST' || options.method === 'PUT')) {
    requestInit.body = JSON.stringify(options.body);
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    console.log('[ApiClient] Making request to:', url);
    const response = await fetch(url, {
      ...requestInit,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    console.log('[ApiClient] Response status:', response.status);
    
    // Parse response
    const data = await response.json() as ApiResponse<T>;
    
    if (!response.ok) {
      console.log('[ApiClient] Error response:', data);
      return {
        success: false,
        status: response.status,
        // Prefer the human-readable `message` so the descriptive error
        // (e.g. "Bus 118 was not found in the network") reaches the caller
        // and the LLM — not just the terse code (e.g. "analysis_failed").
        error: (data as any).message || (data as any).error || `HTTP ${response.status}`,
        message: (data as any).message,
        errorCode: (data as any).error,
      };
    }
    
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }
    
    return {
      success: false,
      error: 'Unknown error',
    };
  }
}

/**
 * Make a request with retry logic
 */
async function makeRequestWithRetry<T>(
  endpoint: string,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: ApiResponse<T> = { success: false, error: 'Unknown error' };
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await makeRequest<T>(endpoint, options);
    
    if (result.success) {
      return result;
    }
    
    lastError = result;

    // Don't retry deterministic client errors (4xx) — a bad request will
    // fail identically on every attempt, so retrying just wastes time and
    // re-runs the solver. Transient failures (5xx, network errors, timeouts)
    // carry no 4xx status and still fall through to the retry path.
    if (result.status !== undefined && result.status >= 400 && result.status < 500) {
      return result;
    }

    // Wait before retry (exponential backoff)
    if (attempt < retries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return lastError;
}

/**
 * API Client for MCP-Server
 */
export const apiClient = {
  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================
  
  /**
   * Create a new session
   */
  async createSession(userId?: string, userToken?: string): Promise<ApiResponse<CreateSessionResponse>> {
    return makeRequestWithRetry<CreateSessionResponse>('/api/v1/session', {
      method: 'POST',
      body: userId ? { user_id: userId } : {},
      userId,
      userToken,
    });
  },
  
  /**
   * Get session info
   */
  async getSession(sessionId: string, userId?: string, userToken?: string): Promise<ApiResponse<SessionInfo>> {
    return makeRequestWithRetry<SessionInfo>('/api/v1/session/info', {
      method: 'POST',
      body: { session_id: sessionId },
      userId,
      userToken,
    });
  },
  
  /**
   * Create a session by loading a network case (RAWX) from the user library
   */
  async createSessionFromFile(fileName: string, userId?: string, userToken?: string): Promise<ApiResponse<CreateSessionResponse>> {
    return makeRequestWithRetry<CreateSessionResponse>('/api/v1/session/load-case', {
      method: 'POST',
      body: { file_name: fileName, user_id: userId },
      userId,
      userToken,
    });
  },
  
  /**
   * Delete session
   */
  async deleteSession(sessionId: string, userId?: string, userToken?: string): Promise<ApiResponse<void>> {
    return makeRequestWithRetry<void>('/api/v1/session', {
      method: 'DELETE',
      body: { session_id: sessionId },
      userId,
      userToken,
    });
  },
  
  /**
   * Get user sessions
   */
  async getUserSessions(userId?: string, userToken?: string): Promise<ApiResponse<SessionInfo[]>> {
    return makeRequestWithRetry<SessionInfo[]>('/api/v1/user/sessions', {
      method: 'POST',
      body: { user_id: userId },
      userId,
      userToken,
    });
  },
  
  // ===========================================
  // NETWORK OPERATIONS
  // ===========================================
  
  /**
   * Get network data for a session
   */
  async getNetwork(sessionId: string, userId?: string, userToken?: string): Promise<ApiResponse<NetworkData>> {
    return makeRequestWithRetry<NetworkData>('/api/v1/session/network', {
      method: 'POST',
      body: { session_id: sessionId },
      userId,
      userToken,
    });
  },
  
  /**
   * Edit network element
   */
  async editElement(
    sessionId: string,
    elementType: string,
    action: 'add' | 'modify' | 'delete',
    data: Record<string, unknown>,
    identifier: Record<string, unknown> | undefined,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<NetworkData>> {
    return makeRequestWithRetry<NetworkData>('/api/v1/session/edit', {
      method: 'POST',
      body: {
        session_id: sessionId,
        element_type: elementType,
        action,
        data,
        identifier,
      },
      userId,
      userToken,
    });
  },
  
  // ===========================================
  // POWER FLOW OPERATIONS
  // ===========================================
  
  /**
   * Calculate power flow
   */
  async calculatePowerFlow(
    sessionId: string,
    options?: {
      method?: string;
      // Optional AC area-interchange control mode. When omitted, the field is
      // not sent and the solver applies its default ("disabled"). Values must
      // align with react-ui / api-server: "disabled" | "tie_lines_only" | "tie_lines_and_loads".
      area_interchange_adjustment?: string;
    },
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<{ task_id: string }>> {
    return makeRequestWithRetry<{ task_id: string }>('/api/v1/session/solve-flow', {
      method: 'POST',
      body: {
        session_id: sessionId,
        config: {
          method: options?.method || 'fnsl',
          tolerance: 1e-3,
          max_iterations: 100,
          flat_start: false,
          max_outerloop_iterations: 20,
          control_tolerance: 0.1,
          ...(options?.area_interchange_adjustment !== undefined
            ? { area_interchange_adjustment: options.area_interchange_adjustment }
            : {}),
        },
      },
      timeout: 60000, // 60 seconds for power flow
      userId,
      userToken,
    });
  },
  
  /**
   * Get power flow results
   */
  async getPowerFlowResults(sessionId: string, userId?: string, userToken?: string): Promise<ApiResponse<PowerFlowResult>> {
    return makeRequestWithRetry<PowerFlowResult>('/api/v1/session/powerflow', {
      method: 'POST',
      body: { session_id: sessionId },
      userId,
      userToken,
    });
  },
  
  // ===========================================
  // FILE OPERATIONS
  // ===========================================
  
  /**
   * Upload user file
   */
  async uploadFile(
    fileName: string,
    fileContent: string,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<{ file_path: string }>> {
    return makeRequestWithRetry<{ file_path: string }>('/api/v1/user/upload', {
      method: 'POST',
      body: {
        file_name: fileName,
        file_content: fileContent,
        user_id: userId,
      },
      userId,
      userToken,
    });
  },
  
  /**
   * Get user files. The api-server accepts file_type of "model" | "knowledge"
   * | "sub" | "mon" | "con" — the study-file types live in separate folders
   * from the network case files.
   */
  async getUserFiles(
    userId?: string,
    fileType: 'model' | 'knowledge' | 'sub' | 'mon' | 'con' = 'model',
    userToken?: string,
  ): Promise<ApiResponse<{ files: Array<{ name: string; path: string; size: number }> }>> {
    return makeRequestWithRetry('/api/v1/user/files', {
      method: 'POST',
      body: { user_id: userId, file_type: fileType },
      userId,
      userToken,
    });
  },

  /**
   * Delete a user file. Used to clean up uploaded mon/con/sub or model files.
   */
  async deleteUserFile(
    fileType: 'model' | 'knowledge' | 'sub' | 'mon' | 'con',
    fileName: string,
    userId?: string,
    userToken?: string,
  ): Promise<ApiResponse<{ status: string; message: string; file_name: string }>> {
    return makeRequestWithRetry('/api/v1/user/files/delete', {
      method: 'POST',
      body: { file_type: fileType, file_name: fileName, user_id: userId },
      userId,
      userToken,
    });
  },

  /**
   * Load a study file (.sub / .mon / .con) from the user's library into an
   * existing session. The api-server runs validation as part of the load and
   * returns the diagnostics inline.
   */
  async loadStudyFile(
    sessionId: string,
    fileType: 'sub' | 'mon' | 'con',
    fileName: string,
    userId?: string,
    userToken?: string,
  ): Promise<ApiResponse<StudyFileLoadResponse>> {
    return makeRequestWithRetry<StudyFileLoadResponse>(`/api/v1/session/load-${fileType}`, {
      method: 'POST',
      body: { session_id: sessionId, file_name: fileName },
      userId,
      userToken,
    });
  },

  /**
   * Parse and validate the session's currently loaded study files
   * (.sub/.mon/.con). Returns diagnostics + has_files / has_model flags.
   */
  async validateStudyFiles(
    sessionId: string,
    userId?: string,
    userToken?: string,
  ): Promise<ApiResponse<StudyValidationResult>> {
    return makeRequestWithRetry<StudyValidationResult>('/api/v1/session/study/validate', {
      method: 'POST',
      body: { session_id: sessionId },
      userId,
      userToken,
    });
  },
  
  // ===========================================
  // GRAPH TRAVERSAL
  // ===========================================

  /**
   * Find the path with the fewest buses away between two buses.
   */
  async findShortestPath(
    sessionId: string,
    fromBus: number,
    toBus: number,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<{ status: string; session_id: string; found: boolean; path?: number[]; message?: string }>> {
    return makeRequestWithRetry('/api/v1/session/analysis/shortest-path', {
      method: 'POST',
      body: { session_id: sessionId, from_bus: fromBus, to_bus: toBus },
      userId,
      userToken,
    });
  },

  /**
   * Find all in-service elements within N bus-levels of an origin bus.
   */
  async findNeighbourElements(
    sessionId: string,
    originBus: number,
    n: number,
    elementTypes?: string[],
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<{ status: string; session_id: string; origin_bus: number; max_buses_away: number; elements: unknown[] }>> {
    return makeRequestWithRetry('/api/v1/session/analysis/neighbour-elements', {
      method: 'POST',
      body: {
        session_id: sessionId,
        origin_bus: originBus,
        n,
        ...(elementTypes && elementTypes.length > 0 ? { element_types: elementTypes } : {}),
      },
      userId,
      userToken,
    });
  },

  // ===========================================
  // CONTINGENCY ANALYSIS (async jobs)
  // ===========================================

  /**
   * Start an AC contingency analysis. Returns 202 + job descriptor immediately.
   * The api-server's 4xx errors are surfaced verbatim so the caller can branch
   * on `analysis_in_progress` / `contingency_not_ready` etc.
   */
  async startContingencyAnalysis(
    sessionId: string,
    settings: Record<string, unknown> | undefined,
    configOverrides: Record<string, unknown> | undefined,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<AnalysisJobResponse>> {
    // No retry on POST start — a 4xx is deterministic and a successful start
    // followed by a retry would double-submit the job.
    return makeRequest<AnalysisJobResponse>('/api/v1/session/analysis/contingency', {
      method: 'POST',
      body: {
        session_id: sessionId,
        ...(settings !== undefined ? { settings } : {}),
        ...(configOverrides !== undefined ? { config: configOverrides } : {}),
      },
      userId,
      userToken,
    });
  },

  /**
   * Get the current state and progress of an analysis job by id.
   */
  async getContingencyJobStatus(
    jobId: string,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<AnalysisJobResponse>> {
    return makeRequestWithRetry<AnalysisJobResponse>(`/api/v1/analysis/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      userId,
      userToken,
    });
  },

  /**
   * Fetch the report of a completed analysis job.
   * Returns the parsed report body (api-server streams the raw report.json).
   */
  async getContingencyReport(
    jobId: string,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<unknown>> {
    return makeRequestWithRetry<unknown>(`/api/v1/analysis/jobs/${encodeURIComponent(jobId)}/report`, {
      method: 'GET',
      userId,
      userToken,
    });
  },

  /**
   * Cancel a running analysis job. 409 here means the job is already terminal,
   * which still satisfies the caller's intent.
   */
  async cancelContingencyJob(
    jobId: string,
    userId?: string,
    userToken?: string
  ): Promise<ApiResponse<{ status: string; message: string }>> {
    // No retry — cancel is one-shot; the api-server itself is idempotent for
    // terminal states (returns 409), which we surface to the caller.
    return makeRequest<{ status: string; message: string }>(
      `/api/v1/analysis/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: 'POST',
        userId,
        userToken,
      }
    );
  },

  // ===========================================
  // HEALTH CHECK
  // ===========================================

  /**
   * Check API server health
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; uptime: number }>> {
    return makeRequestWithRetry<{ status: string; uptime: number }>('/heartbeat', {
      method: 'GET',
    });
  },
};

export default apiClient;
