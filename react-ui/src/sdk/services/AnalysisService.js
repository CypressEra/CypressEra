/**
 * Analysis Service
 * 
 * Handles power flow analysis operations
 */

import { EventEmitter } from '../utils/EventEmitter.js';
import { SolveError, SessionError, ValidationError } from '../utils/errors.js';
import { SDK_EVENTS, API_ENDPOINTS, ANALYSIS_METHODS } from '../types/index.js';

export class AnalysisService extends EventEmitter {
  constructor(httpClient, sessionManager) {
    super();
    this.http = httpClient;
    this.session = sessionManager;
    this.currentAnalysis = null;
  }

  /**
   * Solve power flow
   * @param {string} method - Power flow method (dc, fnsl, fdns)
   * @param {object} options - Solve options
   * @returns {Promise<object>} Response with success status
   */
  async solveFlow(method = ANALYSIS_METHODS.FNSL, options = {}) {
    // Validate method
    const validMethods = Object.values(ANALYSIS_METHODS);
    if (!validMethods.includes(method)) {
      throw new ValidationError(
        `Invalid method: ${method}. Valid methods: ${validMethods.join(', ')}`
      );
    }

    // Get session ID
    const sessionId = options.sessionId || this.session.getSessionId();
    if (!sessionId) {
      throw new SessionError('No session ID. Upload a file first.');
    }

    console.log(`[XFlow:Analysis] ℹ️ Solving ${method.toUpperCase()} power flow...`);
    this.emit(SDK_EVENTS.SOLVE_FLOW_START, { method, sessionId });

    try {
      // Prepare request — caller passes full solver settings, fallback only for legacy calls
      const cfg = options.config ?? {};
      const config = {
        method,
        max_iterations: cfg.max_iterations ?? 100,
        flat_start: cfg.flat_start ?? false,
        max_outerloop_iterations: cfg.max_outerloop_iterations ?? 20,
        control_tolerance: cfg.control_tolerance ?? 0.1,
        tap_adjustment: cfg.tap_adjustment ?? 'stepping',
        phase_shift_adjustment: cfg.phase_shift_adjustment ?? true,
        dc_tap_adjustment: cfg.dc_tap_adjustment ?? true,
        switched_shunt_adjustment: cfg.switched_shunt_adjustment ?? 'enable_all',
        area_interchange_adjustment: cfg.area_interchange_adjustment ?? 'disabled',
      };
      // Only send `tolerance` when the caller actually specified one. Omitting it
      // lets the solver fall back to the RAWX NEWTON `toln`, then its own default
      // (1e-8) — see flow-solver get_tolerance precedence.
      if (cfg.tolerance !== undefined && cfg.tolerance !== null && cfg.tolerance !== '') {
        config.tolerance = cfg.tolerance;
      }
      
      const requestData = {
        session_id: sessionId,
        config,
      };

      // When the caller supplies a requestId, carry it in the BODY (not a custom
      // header) so the solve stays a CORS "simple request" — a header would force
      // a preflight the server's CORS allowlist rejects. The server echoes it
      // into the powerflow:completed event so this client self-skips the
      // duplicate WS-driven refetch.
      if (options.requestId) {
        requestData.request_id = options.requestId;
      }

      // Send request
      const data = await this.http.post(API_ENDPOINTS.SESSION_SOLVE_FLOW, requestData);

      // Validate response
      if (typeof data.success === 'undefined' || typeof data.converged === 'undefined') {
        throw new SolveError('Invalid response format from server');
      }

      // Store method for reference
      this.session.setData('lastMethod', method);

      const statusMsg = data.success 
        ? (data.converged ? 'Converged' : 'Failed to converge')
        : 'Failed';
      console.log(`[XFlow:Analysis] ✅ Power flow solve ${statusMsg}`);
      
      this.emit(SDK_EVENTS.SOLVE_FLOW_COMPLETE, { 
        success: data.success,
        converged: data.converged,
        method, 
        sessionId 
      });

      return data;
    } catch (error) {
      console.error('[XFlow:Analysis] ❌ Power flow solve failed:', error);
      this.emit(SDK_EVENTS.SOLVE_FLOW_ERROR, { error, method });
      
      if (error instanceof SolveError || error instanceof SessionError || error instanceof ValidationError) {
        throw error;
      }
      throw new SolveError(error.message, { originalError: error, method });
    }
  }

  /**
   * Get power flow results
   * @param {object} options - Options for retrieving results
   * @param {string} options.sessionId - Session ID (optional, uses current session if not provided)
   * @param {number[]} options.busNumbers - Filter by bus numbers (optional, empty = all buses)
   * @param {Array<{from_bus: number, to_bus: number, id?: string}>} options.branches - Filter by branches (optional, empty = all branches)
   * @returns {Promise<object>} Power flow results
   */
  async getPowerFlowData(options = {}) {
    const sessionId = options.sessionId || this.session.getSessionId();
    if (!sessionId) {
      throw new SessionError('No session ID provided');
    }

    console.log('[XFlow:Analysis] 🔍 Fetching power flow data for session:', sessionId);

    try {
      const requestData = {
        session_id: sessionId,
      };

      // Add filters if provided
      if (options.busNumbers && options.busNumbers.length > 0) {
        requestData.bus_numbers = options.busNumbers;
      }
      if (options.branches && options.branches.length > 0) {
        requestData.branches = options.branches;
      }

      const data = await this.http.post(API_ENDPOINTS.SESSION_POWERFLOW, requestData);

      // Store results for caching
      this.session.setData('lastPowerFlowData', data);

      const aclineCount = data.acline_results?.length ?? 0;
      const xfmrCount = data.transformer_results?.length ?? 0;
      console.log(`[XFlow:Analysis] ✅ Retrieved power flow data: ${data.bus_results?.length || 0} buses, ${aclineCount} aclines, ${xfmrCount} transformers`);

      return data;
    } catch (error) {
      if (error.details?.status === 404) {
        console.warn('[XFlow:Analysis] ⚠️ No power flow results found for session:', sessionId);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get cached results (from session info) - deprecated, use getPowerFlowData instead
   * @deprecated Use getPowerFlowData() instead
   */
  async getResults(sessionId = null) {
    console.warn('[XFlow:Analysis] ⚠️ getResults() is deprecated. Use getPowerFlowData() instead.');
    return this.getPowerFlowData({ sessionId });
  }
}