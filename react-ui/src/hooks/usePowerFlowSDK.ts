/**
 * React Hook for XFlow SDK
 * 
 * Provides easy access to SDK functionality in React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PowerFlowApp, ANALYSIS_METHODS, SDK_EVENTS, ELEMENT_TYPES, API_ENDPOINTS } from '../sdk';
import type { 
  CalculationResult, 
  SessionInfo, 
  NetworkData,
  SolveFlowResult,
  PowerFlowData
} from '../sdk/types/index';
import { aggregateNetworkData, getAggregatedBuses as getAggregatedBusesUtil, getAggregatedLines as getAggregatedLinesUtil } from '../sdk/utils/dataAggregator.js';

// User-file library categories. Study files (.sub/.mon/.con) are analysis
// inputs; model/knowledge are the case and reference libraries; diagram is the
// saved network-diagram layout (.cyd / .cyd.gz).
type StudyFileType = 'sub' | 'mon' | 'con';
type UserFileType = 'model' | 'knowledge' | StudyFileType | 'diagram';

interface UsePowerFlowSDKOptions {
  apiBaseURL?: string;
  autoInitialize?: boolean;
  accessToken?: string | null;
}

interface SDKState {
  initialized: boolean;
  connected: boolean;
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  currentFile: File | null;
  networkData: NetworkData | null;
  powerFlowData: PowerFlowData | null; // Store power flow data separately
  calculationResult: CalculationResult | null;
  sessionInfo: SessionInfo | null;
  // File libraries
  modelFiles: string[];
  knowledgeFiles: string[];
  // Study files (.sub/.mon/.con) libraries
  subFiles: string[];
  monFiles: string[];
  conFiles: string[];
  // Diagram (.cyd / .cyd.gz) library
  diagramFiles: string[];
}

export function usePowerFlowSDK(options: UsePowerFlowSDKOptions = {}) {
  const {
    apiBaseURL = 'http://localhost:8080',
    autoInitialize = true,
    accessToken = null,
  } = options;

  const [state, setState] = useState<SDKState>({
    initialized: false,
    connected: false,
    loading: false,
    error: null,
    sessionId: null,
    currentFile: null,
    networkData: null,
    powerFlowData: null, // Store power flow data separately
    calculationResult: null,
    sessionInfo: null,
    modelFiles: [],
    knowledgeFiles: [],
    subFiles: [],
    monFiles: [],
    conFiles: [],
    diagramFiles: [],
  });

  // True only while a power flow solve is in progress. Distinct from the generic
  // `loading` so the Run Power Flow control reflects solving specifically.
  const [isSolving, setIsSolving] = useState(false);
  // Ref mirror of the solving state for a synchronous concurrency guard that
  // works regardless of entry point (button, keyboard shortcut, MCP/agent).
  const solvingRef = useRef(false);
  // Request ids of solves THIS client originated. The server echoes the id into
  // the powerflow:completed event, and App passes this set to
  // useInvalidationEvent's seenRequestIds so the originating client self-skips
  // the WS-driven refetch (it already refetched via SOLVE_FLOW_COMPLETE). Agent
  // and other-client solves carry unknown ids and still refresh. Bounded to
  // avoid unbounded growth over a long session.
  const seenSolveRequestIdsRef = useRef<Set<string>>(new Set());

  // Initialize SDK
  const initialize = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      await PowerFlowApp.initialize({
        apiBaseURL,
        accessToken: accessToken || undefined,
        logLevel: 'INFO',
        persistSession: false
      });

      const connected = PowerFlowApp.isConnected();

      setState(prev => ({
        ...prev,
        initialized: true,
        connected,
        loading: false
      }));

      return true;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        initialized: false,
        connected: false,
        loading: false,
        error: error.message || 'Failed to initialize SDK'
      }));
      return false;
    }
  }, [apiBaseURL, accessToken]);

  // Auto-initialize on mount (once). Token changes are applied separately via
  // AuthProvider -> PowerFlowApp.updateConfig, so re-initializing when the
  // access token changes is redundant and triggers "SDK already initialized".
  const didAutoInit = useRef(false);
  useEffect(() => {
    if (autoInitialize && !didAutoInit.current) {
      didAutoInit.current = true;
      initialize();
    }
  }, [autoInitialize, initialize]);

  // Set up event listeners to update React state when SDK is called (including by MCP)
  useEffect(() => {
    // Handle solve flow start - set loading state
    // This is needed when SDK is called directly (e.g., by MCP), not through hook's solveFlow
    const handleSolveFlowStart = (data: any) => {
      console.log('[usePowerFlowSDK] Solve flow start event:', data);
      setState(prev => ({ ...prev, loading: true, error: null }));
    };

    // Handle solve flow error - needed when SDK is called directly (e.g., by MCP)
    const handleSolveFlowError = (data: any) => {
      console.error('[usePowerFlowSDK] Solve flow error event:', data);
      setState(prev => ({
        ...prev,
        loading: false,
        error: data.error?.message || 'Solve flow failed',
      }));
    };

    // Handle solve flow complete - update calculation result and aggregate data
    // This handles both hook calls and direct SDK calls (e.g., from MCP)
    const handleSolveFlowComplete = (data: any) => {
      // The event data contains success/converged status
      // Format: { success, converged, method, sessionId }
      const { success, converged, method, sessionId } = data || {};

      // Update state with calculation status immediately
      setState(prev => ({
        ...prev,
        calculationResult: {
          success,
          converged,
          method,
          sessionId,
        } as any,
        loading: false,
        error: null,
      }));

      // If calculation succeeded, automatically fetch full power flow data
      // This ensures network data table updates even when SDK is called directly (e.g., by MCP)
      if (success && converged) {
        // Defer to avoid blocking the message handler
        setTimeout(async () => {
          // Use a small delay to ensure the solveFlow API call has completed
          await new Promise(resolve => setTimeout(resolve, 100));

          try {
            const powerFlowData = await PowerFlowApp.getPowerFlowData() as PowerFlowData | null;

            if (powerFlowData) {
              // Store power flow data separately (don't merge with networkData)
              const calculationResult: CalculationResult = {
                status: 'success',
                message: 'Power flow data retrieved successfully',
                session_id: sessionId || powerFlowData.session_id || '',
                method: powerFlowData.method || 'fnsl',
                results: {
                  converged: powerFlowData.converged,
                  solution_time_ms: powerFlowData.solution_time_ms,
                  iterations: powerFlowData.iterations || 0,
                  bus_results: powerFlowData.bus_results,
                  generator_results: powerFlowData.generator_results,
                  acline_results: powerFlowData.acline_results,
                  transformer_results: powerFlowData.transformer_results,
                  system_summary: powerFlowData.system_summary,
                },
              };

              setState(prev => ({
                ...prev,
                powerFlowData, // Store separately
                calculationResult,
              }));
            }
          } catch (err) {
            console.warn('[usePowerFlowSDK] Failed to fetch power flow data after calculation:', err);
          }
        }, 0);
      }
    };

    // Handle session created - update session info and load network data
    const handleSessionCreated = (data: any) => {
      console.log('[usePowerFlowSDK] Session created event received:', data);

      // Defer heavy work to avoid blocking the message handler
      // Use setTimeout instead of requestAnimationFrame to properly defer async operations
      setTimeout(async () => {
        try {
          // Get session info
          const sessionInfo = await PowerFlowApp.getSessionInfo();
          const sessionId = sessionInfo?.id || sessionInfo?.session_id || data?.session_id || null;
          console.log('[usePowerFlowSDK] Session info retrieved:', sessionInfo);

          // Delay to ensure session is fully created on server and network data is ready
          // Increased to 500ms to ensure server-side processing is complete
          await new Promise(resolve => setTimeout(resolve, 500));

          // Load network data with retry logic
          console.log('[usePowerFlowSDK] Fetching network data...');
          let networkData = null;
          let retries = 3;
          while (retries > 0 && !networkData) {
            try {
              networkData = await PowerFlowApp.getNetwork();
              if (networkData) {
                console.log('[usePowerFlowSDK] Network data loaded successfully');
                break;
              } else {
                console.log(`[usePowerFlowSDK] Network data is null, retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 200));
                retries--;
              }
            } catch (err) {
              console.error(`[usePowerFlowSDK] Error fetching network data, retrying... (${retries} attempts left):`, err);
              await new Promise(resolve => setTimeout(resolve, 200));
              retries--;
            }
          }

          console.log('[usePowerFlowSDK] Network data load result:', networkData ? 'Success' : 'Failed after retries');

          setState(prev => ({
            ...prev,
            sessionId,
            sessionInfo,
            networkData,
            loading: false,
            error: null,
          }));
        } catch (err: any) {
          console.error('[usePowerFlowSDK] Failed to load data after session creation:', err);
          setState(prev => ({
            ...prev,
            loading: false,
            error: err?.message || 'Failed to load session data',
          }));
        }
      }, 0);
    };

    // Handle session changed
    const handleSessionChanged = (data: any) => {
      console.log('[usePowerFlowSDK] Session changed:', data);

      // Defer to avoid blocking the message handler
      setTimeout(async () => {
        try {
          const sessionInfo = await PowerFlowApp.getSessionInfo();
          const sessionId = sessionInfo?.id || sessionInfo?.session_id || null;

          setState(prev => ({
            ...prev,
            sessionId,
            sessionInfo,
          }));
        } catch (err: any) {
          console.error('[usePowerFlowSDK] Failed to load session info:', err);
        }
      }, 0);
    };

    // Handle network updated - refresh network data (keep separate from power flow data)
    const handleNetworkUpdated = (data: any) => {
      console.log('[usePowerFlowSDK] Network data updated in SDK:', data);

      // Return immediately to avoid blocking the message handler
      // Use setImmediate equivalent (setTimeout with 0) to defer state update
      const scheduleUpdate = () => {
        // Get fresh network data from SDK cache (don't aggregate with power flow data)
        const cachedNetwork = PowerFlowApp.getCachedNetwork();
        if (cachedNetwork) {
          // Don't deep clone - just update the reference
          // Deep cloning is expensive and unnecessary since we don't mutate the data
          setState(prev => ({
            ...prev,
            networkData: cachedNetwork,
          }));
        }
      };

      // Use the browser's scheduling mechanism
      // Message channel posts a task to the event loop
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        scheduleUpdate();
      };
      channel.port2.postMessage(undefined);
    };

    // Handle edit complete - refresh network data from server (cache is stale after add/modify/delete)
    const handleEditComplete = (data: any) => {
      console.log('[usePowerFlowSDK] Edit complete:', data);

      // Use MessageChannel to defer without blocking
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();

        // Fetch fresh network data from backend; cache is not updated by edit API (e.g. MCP edits)
        PowerFlowApp.getNetwork()
          .then((freshNetwork) => {
            console.log('[usePowerFlowSDK] Fresh network data received:', freshNetwork ? 'yes' : 'no');
            if (freshNetwork) {
              // Create a new object reference to ensure React detects the change
              // This is important because the SDK may return the same cached object
              const newNetworkData = {
                ...freshNetwork,
                network_data: freshNetwork.network_data ? {
                  ...freshNetwork.network_data,
                  // Force new array references for element lists
                  bus: freshNetwork.network_data.bus ? [...freshNetwork.network_data.bus] : [],
                  load: freshNetwork.network_data.load ? [...freshNetwork.network_data.load] : [],
                  generator: freshNetwork.network_data.generator ? [...freshNetwork.network_data.generator] : [],
                  acline: freshNetwork.network_data.acline ? [...freshNetwork.network_data.acline] : [],
                  transformer: freshNetwork.network_data.transformer ? [...freshNetwork.network_data.transformer] : [],
                } : undefined,
                _lastUpdated: Date.now(), // Add timestamp to force change detection
              };
              console.log('[usePowerFlowSDK] Updating networkData state with new data');
              setState(prev => ({
                ...prev,
                networkData: newNetworkData,
                loading: false,
              }));
            } else {
              setState(prev => ({ ...prev, loading: false }));
            }
          })
          .catch((err) => {
            console.warn('[usePowerFlowSDK] Failed to refresh network after edit:', err);
            setState(prev => ({ ...prev, loading: false }));
          });
      };
      channel.port2.postMessage(undefined);
    };

    // Handle edit start - set loading state
    const handleEditStart = (data: any) => {
      console.log('[usePowerFlowSDK] Edit start:', data);
      setState(prev => ({ ...prev, loading: true, error: null }));
    };

    // Handle general errors
    const handleError = (data: any) => {
      console.error('[usePowerFlowSDK] SDK error:', data);
      setState(prev => ({
        ...prev,
        error: data.error?.message || data.message || 'An error occurred',
        loading: false,
      }));
    };

    // Handle health check - update connected status
    const handleHealthCheck = (data: any) => {
      const isHealthy = data?.status === 'ok' || data?.status === 'healthy';
      setState(prev => ({
        ...prev,
        connected: isHealthy,
      }));
    };

    // Handle SDK initialized - update connected status
    const handleInitialized = (data: any) => {
      console.log('[usePowerFlowSDK] SDK initialized:', data);
      setState(prev => ({
        ...prev,
        initialized: true,
        connected: data?.connected || PowerFlowApp.isConnected(),
      }));
    };

    // Subscribe to all relevant events
    PowerFlowApp.on(SDK_EVENTS.INITIALIZED, handleInitialized);
    PowerFlowApp.on(SDK_EVENTS.SOLVE_FLOW_START, handleSolveFlowStart);
    PowerFlowApp.on(SDK_EVENTS.SOLVE_FLOW_COMPLETE, handleSolveFlowComplete);
    PowerFlowApp.on(SDK_EVENTS.SOLVE_FLOW_ERROR, handleSolveFlowError);
    PowerFlowApp.on(SDK_EVENTS.SESSION_CREATED, handleSessionCreated);
    PowerFlowApp.on(SDK_EVENTS.SESSION_CHANGED, handleSessionChanged);
    PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
    PowerFlowApp.on(SDK_EVENTS.EDIT_START, handleEditStart);
    PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, handleEditComplete);
    PowerFlowApp.on(SDK_EVENTS.HEALTH_CHECK, handleHealthCheck);
    PowerFlowApp.on(SDK_EVENTS.ERROR, handleError);

    // Cleanup
    return () => {
      PowerFlowApp.off(SDK_EVENTS.INITIALIZED, handleInitialized);
      PowerFlowApp.off(SDK_EVENTS.SOLVE_FLOW_START, handleSolveFlowStart);
      PowerFlowApp.off(SDK_EVENTS.SOLVE_FLOW_COMPLETE, handleSolveFlowComplete);
      PowerFlowApp.off(SDK_EVENTS.SOLVE_FLOW_ERROR, handleSolveFlowError);
      PowerFlowApp.off(SDK_EVENTS.SESSION_CREATED, handleSessionCreated);
      PowerFlowApp.off(SDK_EVENTS.SESSION_CHANGED, handleSessionChanged);
      PowerFlowApp.off(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
      PowerFlowApp.off(SDK_EVENTS.EDIT_START, handleEditStart);
      PowerFlowApp.off(SDK_EVENTS.EDIT_COMPLETE, handleEditComplete);
      PowerFlowApp.off(SDK_EVENTS.HEALTH_CHECK, handleHealthCheck);
      PowerFlowApp.off(SDK_EVENTS.ERROR, handleError);
    };
  }, []);

  // Create session from file
  const createSessionFromFile = useCallback(async (fileName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.createSessionFromFile(fileName);
      // Session ID will be updated by handleSessionCreated event handler
      // Network data will also be loaded by handleSessionCreated event handler
      // No need to manually load here to avoid duplicate loading
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to create session from file'
      }));
      throw error;
    }
  }, []);

  // Upload file to user folder
  const uploadUserFile = useCallback(async (file: File, fileType: UserFileType = 'model') => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.uploadUserFile(file, fileType);
      
      // Only set currentFile for model files, not knowledge base files
      setState(prev => ({
        ...prev,
        currentFile: fileType === 'model' ? file : prev.currentFile,
        loading: false
      }));

      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to upload file to user folder'
      }));
      throw error;
    }
  }, []);

  // Get user files
  const getUserFiles = useCallback(async (fileType: UserFileType = 'model') => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const files = await PowerFlowApp.getUserFiles(fileType);
      setState(prev => ({ ...prev, loading: false }));
      return files;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to get user files'
      }));
      throw error;
    }
  }, []);

  // Delete user file
  const deleteUserFile = useCallback(async (fileName: string, fileType: UserFileType = 'model') => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.deleteUserFile(fileName, fileType);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to delete user file'
      }));
      throw error;
    }
  }, []);

  // Get user file info
  const getUserFileInfo = useCallback(async (fileName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const info = await PowerFlowApp.getUserFileInfo(fileName);
      setState(prev => ({ ...prev, loading: false }));
      return info;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to get user file info'
      }));
      throw error;
    }
  }, []);

  // Get network data
  const getNetwork = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const network = await PowerFlowApp.getNetwork();
      setState(prev => ({ ...prev, networkData: network, loading: false }));
      return network;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to get network data'
      }));
      throw error;
    }
  }, []);

  // Get power flow data
  const getPowerFlowData = useCallback(async (options: any = {}) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const powerFlowData = await PowerFlowApp.getPowerFlowData(options) as PowerFlowData | null;
      
      if (!powerFlowData) {
        setState(prev => ({ ...prev, loading: false }));
        return null;
      }

      // Store power flow data separately (don't merge with networkData)
      const calculationResult: CalculationResult = {
        status: 'success',
        message: 'Power flow data retrieved successfully',
        session_id: state.sessionId || powerFlowData.session_id || '',
        method: powerFlowData.method || 'fnsl',
        results: {
          converged: powerFlowData.converged,
          solution_time_ms: powerFlowData.solution_time_ms,
          iterations: powerFlowData.iterations || 0,
          bus_results: powerFlowData.bus_results,
          generator_results: powerFlowData.generator_results,
          acline_results: powerFlowData.acline_results,
          transformer_results: powerFlowData.transformer_results,
          system_summary: powerFlowData.system_summary,
        },
      };
      
      setState(prev => ({
        ...prev,
        powerFlowData, // Store separately
        calculationResult,
        loading: false,
        error: null,
      }));

      return powerFlowData;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to get power flow data'
      }));
      throw error;
    }
  }, [state.sessionId]);

  // Solve power flow calculation
  const solveFlow = useCallback(async (method: 'dc' | 'fnsl' = 'fnsl', options: any = {}) => {
    // Ignore a solve request while one is already running (prevents overlapping
    // solves from rapid clicks, keyboard shortcuts, or programmatic callers).
    if (solvingRef.current) {
      return undefined;
    }
    solvingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    setIsSolving(true);

    // Tag this solve with a request id and remember it BEFORE the request is
    // sent, so the powerflow:completed WS event (which can arrive before the
    // HTTP response resolves) is reliably recognized as self-originated.
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `solve-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const seen = seenSolveRequestIdsRef.current;
    seen.add(requestId);
    if (seen.size > 50) {
      // Set preserves insertion order — drop the oldest.
      seen.delete(seen.values().next().value as string);
    }

    try {
      const result = await PowerFlowApp.solveFlow(method, {
        sessionId: options.sessionId,
        config: options.config || {},
        requestId,
      }) as SolveFlowResult;

      // Power flow data is fetched once by handleSolveFlowComplete when SOLVE_FLOW_COMPLETE
      // is emitted (avoids duplicate getPowerFlowData call from both hook and event handler).
      if (!result.success || !result.converged) {
        setState(prev => ({
          ...prev,
          calculationResult: {
            status: result.status,
            message: result.message,
            session_id: result.session_id,
            method: result.method,
            results: {
              converged: result.converged,
              solution_time_ms: 0,
              iterations: 0,
            },
          } as CalculationResult,
          loading: false,
          error: null,
        }));
      }

      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to solve power flow'
      }));
      throw error;
    } finally {
      // Always clear the solving flags, whether the solve succeeded or failed.
      solvingRef.current = false;
      setIsSolving(false);
    }
  }, []);

  // Get session info
  const getSessionInfo = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const info = await PowerFlowApp.getSessionInfo();
      setState(prev => ({ ...prev, sessionInfo: info, loading: false }));
      return info;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to get session info'
      }));
      throw error;
    }
  }, []);

  // Add element
  const addElement = useCallback(async (
    elementType: keyof typeof ELEMENT_TYPES,
    data: any
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.addElement(elementType, data);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to add element'
      }));
      throw error;
    }
  }, []);

  // Modify element
  const modifyElement = useCallback(async (
    elementType: keyof typeof ELEMENT_TYPES,
    identifier: any,
    data: any
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.modifyElement(elementType, identifier, data);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to modify element'
      }));
      throw error;
    }
  }, []);

  // Delete element
  const deleteElement = useCallback(async (
    elementType: keyof typeof ELEMENT_TYPES,
    identifier: any
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.deleteElement(elementType, identifier);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to delete element'
      }));
      throw error;
    }
  }, []);

  // Save session to user file
  const saveSessionToUserFile = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.saveSessionToUserFile();
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to save session to user file'
      }));
      throw error;
    }
  }, []);

  // Load a study file (.sub/.mon/.con) from the user library into a session
  const loadStudyFile = useCallback(async (
    fileType: StudyFileType,
    fileName: string,
    sessionId?: string,
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await PowerFlowApp.loadStudyFile(fileType, fileName, sessionId);
      setState(prev => ({ ...prev, loading: false }));
      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || `Failed to load ${fileType} file`,
      }));
      throw error;
    }
  }, []);

  // Complete workflow: upload and calculate
  const uploadAndCalculate = useCallback(async (
    file: File,
    method: 'dc' | 'fnsl'  = 'fnsl'
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Use the new user-centric workflow
      // No need to create session manually - uploadAndCalculate handles it

      // Upload and calculate
      const result = await PowerFlowApp.uploadAndCalculate(file, method) as SolveFlowResult;

      setState(prev => ({
        ...prev,
        currentFile: file,
        calculationResult: {
          status: result.status,
          message: result.message,
          session_id: result.session_id,
          method: result.method,
          results: {
            converged: result.converged,
            solution_time_ms: 0,
            iterations: 0,
          },
        } as CalculationResult,
        loading: false
      }));

      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to upload and calculate'
      }));
      throw error;
    }
  }, []);

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const health = await PowerFlowApp.checkHealth();
      setState(prev => ({ ...prev, connected: health.status === 'ok' || health.status === 'healthy' }));
      return health;
    } catch (error: any) {
      setState(prev => ({ ...prev, connected: false }));
      throw error;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Reset session
  const resetSession = useCallback(() => {
    setState(prev => ({
      ...prev,
      sessionId: null,
      currentFile: null,
      networkData: null,
      powerFlowData: null, // Clear power flow data separately
      calculationResult: null,
      sessionInfo: null,
      error: null
    }));
    PowerFlowApp.clearSession();
    PowerFlowApp.clearCache();
  }, []);

  // Get cached network data from SDK
  const getCachedNetwork = useCallback(() => {
    return PowerFlowApp.getCachedNetwork();
  }, []);

  // Get cached calculation result from SDK
  const getCachedCalculationResult = useCallback(() => {
    return PowerFlowApp.getCachedCalculationResult();
  }, []);

  // Get combined display data (networkData + powerFlowData merged for display only)
  // This combines them for display without modifying the original data
  const getDisplayNetworkData = useCallback(() => {
    if (!state.networkData) {
      return null;
    }
    
    // If no power flow data, return network data as-is
    if (!state.powerFlowData) {
      return state.networkData;
    }
    
    // Combine for display only (create new object, don't modify originals)
    const calculationResultForDisplay = {
      results: {
        converged: state.powerFlowData.converged,
        solution_time_ms: state.powerFlowData.solution_time_ms,
        iterations: state.powerFlowData.iterations || 0,
        bus_results: state.powerFlowData.bus_results,
        generator_results: state.powerFlowData.generator_results,
        acline_results: state.powerFlowData.acline_results,
        transformer_results: state.powerFlowData.transformer_results,
        twotermdc_results: (state.powerFlowData as any).twotermdc_results,
        vscdc_results: (state.powerFlowData as any).vscdc_results,
        system_summary: state.powerFlowData.system_summary,
      }
    };
    
    // Use aggregateNetworkData to create a combined view (doesn't modify originals)
    return aggregateNetworkData(state.networkData, calculationResultForDisplay) as NetworkData;
  }, [state.networkData, state.powerFlowData]);

  // Get aggregated bus data (network data + calculation results)
  const getAggregatedBuses = useCallback(() => {
    if (!state.networkData || !state.calculationResult) {
      return state.networkData?.network_data?.bus || [];
    }
    return getAggregatedBusesUtil(state.networkData, state.calculationResult);
  }, [state.networkData, state.calculationResult]);

  // Get aggregated AC line data (network data + power flows)
  const getAggregatedLines = useCallback(() => {
    if (!state.networkData || !state.calculationResult) {
      return state.networkData?.network_data?.acline || [];
    }
    return getAggregatedLinesUtil(state.networkData, state.calculationResult);
  }, [state.networkData, state.calculationResult]);

  // Load the model-file library
  const loadModelFileList = useCallback(async () => {
    try {
      const response = await getUserFiles('model');
      console.log('[usePowerFlowSDK] Loaded model files:', response.files);
      setState(prev => ({ ...prev, modelFiles: response.files || [] }));
      return response.files || [];
    } catch (err) {
      console.error('[usePowerFlowSDK] Failed to load model files:', err);
      return [];
    }
  }, [getUserFiles]);

  // Load knowledge base files
  const loadKnowledgeFileList = useCallback(async () => {
    try {
      const response = await getUserFiles('knowledge');
      console.log('[usePowerFlowSDK] Loaded knowledge files:', response.files);
      setState(prev => ({ ...prev, knowledgeFiles: response.files || [] }));
      return response.files || [];
    } catch (err) {
      console.error('[usePowerFlowSDK] Failed to load knowledge files:', err);
      return [];
    }
  }, [getUserFiles]);

  // Load the diagram-file library (.cyd / .cyd.gz)
  const loadDiagramFileList = useCallback(async () => {
    try {
      const response = await getUserFiles('diagram');
      console.log('[usePowerFlowSDK] Loaded diagram files:', response.files);
      setState(prev => ({ ...prev, diagramFiles: response.files || [] }));
      return response.files || [];
    } catch (err) {
      console.error('[usePowerFlowSDK] Failed to load diagram files:', err);
      return [];
    }
  }, [getUserFiles]);

  // Load a study-file library (.sub/.mon/.con) into the matching state slice
  const loadStudyFileList = useCallback(async (fileType: StudyFileType) => {
    const stateKey: 'subFiles' | 'monFiles' | 'conFiles' =
      fileType === 'sub' ? 'subFiles' : fileType === 'mon' ? 'monFiles' : 'conFiles';
    try {
      const response = await getUserFiles(fileType);
      console.log(`[usePowerFlowSDK] Loaded ${fileType} files:`, response.files);
      setState(prev => ({ ...prev, [stateKey]: response.files || [] }));
      return response.files || [];
    } catch (err) {
      console.error(`[usePowerFlowSDK] Failed to load ${fileType} files:`, err);
      return [];
    }
  }, [getUserFiles]);

  /**
   * Handle AI tool execution results - update UI state based on which tools were executed
   * This is called when tools complete execution in mcp-server
   */
  const handleToolResults = useCallback(async (
    results: Array<{ call_id: string; name: string; success: boolean; error?: string; result?: any }>
  ) => {
    console.log('[usePowerFlowSDK] Tool results received:', results);

    // Precondition failures (e.g. AI calls a tool before a session exists) are
    // not bugs — they show up as a normal part of multi-step tool planning.
    // Surface them as warnings so users don't think something is broken.
    const isExpectedToolFailure = (errMsg: string) =>
      /\bis required\b|\bnot found\b|\bno (active |current )?session\b|\bsession.*not (exist|set)\b/i.test(errMsg);

    results.forEach(r => {
      if (r.success) {
        PowerFlowApp.log(`Tool ${r.name} executed successfully`, 'success');
        return;
      }
      const errMsg = r.error || 'Unknown error';
      const level = isExpectedToolFailure(errMsg) ? 'warning' : 'error';
      PowerFlowApp.log(`Tool ${r.name} failed: ${errMsg}`, level);
    });

    // Group tools by type for batch updates
    const successfulTools = results.filter(r => r.success);
    const failedTools = results.filter(r => !r.success);

    if (failedTools.length > 0) {
      console.warn('[usePowerFlowSDK] Some tools failed:', failedTools);
    }

    // Determine which updates are needed based on tool names
    const needsSessionUpdate = successfulTools.some(r =>
      ['createSession', 'createSessionFromFile'].includes(r.name)
    );
    const needsNetworkUpdate = successfulTools.some(r =>
      ['createSession', 'createSessionFromFile', 'getNetwork', 'modifyElement', 'addElement', 'deleteElement'].includes(r.name)
    );
    const needsPowerFlowUpdate = successfulTools.some(r =>
      r.name === 'solveFlow'
    );
    const needsFilesUpdate = successfulTools.some(r =>
      ['saveSessionToUserFile', 'uploadUserFile', 'deleteUserFile'].includes(r.name)
    );

    // Execute updates with small delays to ensure server has processed the changes
    try {
      if (needsSessionUpdate) {
        console.log('[usePowerFlowSDK] Updating session info...');
        PowerFlowApp.log('Updating session info...', 'info');

        // Extract session_id directly from tool result
        const sessionTool = successfulTools.find(r =>
          ['createSession', 'createSessionFromFile'].includes(r.name)
        );

        if (sessionTool?.result?.session_id) {
          const sessionId = sessionTool.result.session_id;
          console.log('[usePowerFlowSDK] Session ID from tool result:', sessionId);

          // Update SDK's session ID
          PowerFlowApp.setSession(sessionId);
          console.log('[usePowerFlowSDK] Session ID set in SDK:', sessionId);

          // Get session info
          try {
            const sessionInfo = await PowerFlowApp.getSessionInfo();
            console.log('[usePowerFlowSDK] Session info retrieved:', sessionInfo);

            setState(prev => ({
              ...prev,
              sessionId,
              sessionInfo,
              loading: true,
            }));
            PowerFlowApp.log(`Session created: ${sessionId}`, 'success');
          } catch (err) {
            console.error('[usePowerFlowSDK] Failed to get session info:', err);
            // Still set the session ID even if getSessionInfo fails
            setState(prev => ({
              ...prev,
              sessionId,
              loading: true,
            }));
            PowerFlowApp.log(`Session created: ${sessionId}`, 'success');
          }

          // Fetch network data
          await new Promise(resolve => setTimeout(resolve, 300));
          await getNetwork();
        } else {
          console.warn('[usePowerFlowSDK] No session_id in tool result');
          PowerFlowApp.log('No session_id in tool result', 'warning');
        }
      }

      if (needsNetworkUpdate && !needsSessionUpdate) {
        console.log('[usePowerFlowSDK] Updating network data...');
        PowerFlowApp.log('Updating network data...', 'info');
        await new Promise(resolve => setTimeout(resolve, 200));
        await getNetwork();
      }

      if (needsPowerFlowUpdate) {
        console.log('[usePowerFlowSDK] Updating power flow data...');
        PowerFlowApp.log('Updating power flow data...', 'info');
        await new Promise(resolve => setTimeout(resolve, 300));
        // The hook's handleSolveFlowComplete event handler will update power flow data
        // Force a refresh here as backup
        try {
          const data = await PowerFlowApp.getPowerFlowData() as PowerFlowData | null;
          if (data) {
            setState(prev => ({
              ...prev,
              powerFlowData: data,
            }));
            PowerFlowApp.log('Power flow data updated', 'success');
          }
          console.log('[usePowerFlowSDK] Power flow data refreshed:', data ? 'success' : 'no data');
        } catch (err) {
          console.warn('[usePowerFlowSDK] Failed to refresh power flow data:', err);
          PowerFlowApp.log('Failed to refresh power flow data', 'error');
        }
      }

      if (needsFilesUpdate) {
        console.log('[usePowerFlowSDK] Refreshing user files...');
        PowerFlowApp.log('Refreshing user files...', 'info');
        await loadModelFileList();
        PowerFlowApp.log('User files refreshed', 'success');
      }
    } catch (err) {
      console.error('[usePowerFlowSDK] Error updating state after tool execution:', err);
      PowerFlowApp.log(`Error updating state: ${err}`, 'error');
    }
  }, [getNetwork, loadModelFileList]);

  return {
    // State
    ...state,
    // True while a power flow solve is running (drives the Run control's busy UI)
    isSolving,

    // Actions
    initialize,
    createSessionFromFile,
    uploadUserFile,
    getUserFiles,
    deleteUserFile,
    getUserFileInfo,
    getNetwork,
    solveFlow,
    getPowerFlowData,
    seenSolveRequestIds: seenSolveRequestIdsRef.current,
    getSessionInfo,
    addElement,
    modifyElement,
    deleteElement,
    saveSessionToUserFile,
    uploadAndCalculate,

    // Study files (.sub/.mon/.con): generic, parameterized by file type.
    // loadStudyFile loads one file into the session; loadStudyFileList
    // refreshes the library list for a type.
    loadStudyFile,
    loadStudyFileList,

    checkHealth,
    clearError,
    resetSession,
    getCachedNetwork,
    getCachedCalculationResult,

    // File management
    loadModelFileList,
    loadKnowledgeFileList,
    loadDiagramFileList,

    // Tool results handler (for AI tool execution)
    handleToolResults,

    // Aggregated data helpers
    getAggregatedBuses,
    getAggregatedLines,

    // Display data (combined for table view)
    getDisplayNetworkData,

    // SDK instance (for advanced usage)
    sdk: PowerFlowApp,

    // Constants
    ANALYSIS_METHODS,
    ELEMENT_TYPES,
  };
}
