/**
 * NetworkDiagram SDK Integration Hooks
 *
 * This module provides hooks for integrating the NetworkDiagram component
 * with the PowerFlow SDK. It handles automatic data synchronization when
 * network data or power flow results change in the SDK.
 *
 * PUBLIC API:
 * - useNetworkDiagram: Main hook for SDK integration with automatic data sync
 * - useNetworkDiagramHandle: Creates the imperative handle for diagram control
 *
 * @example
 * ```tsx
 * function MyPage() {
 *   const { handleRef, dataset } = useNetworkDiagram({
 *     onDataUpdate: (data) => console.log('Data updated:', data),
 *     enableMCPIntegration: true,
 *   });
 *
 *   return <NetworkDiagram ref={handleRef} data={dataset} />;
 * }
 * ```
 */

import { useRef, useEffect, useCallback } from 'react';
import { PowerFlowApp, SDK_EVENTS } from '@/sdk';
import type { NetworkData, PowerFlowData } from '@/sdk/types/index';
import {
  NetworkDataset,
  PowerFlowResults,
} from '@/components/features/NetworkDiagram/types/index';

/**
 * Imperative handle for controlling NetworkDiagram from external code
 * (e.g., MCP commands, keyboard shortcuts, toolbar buttons)
 */
export interface NetworkDiagramHandle {
  updateData: (data: NetworkDataset) => void;
  updatePowerFlowResults: (results: PowerFlowResults) => void;
  highlightElements: (elementIds: string[]) => void;
  selectElements: (elementIds: string[]) => void;
  resetView: () => void;
  exportAsPNG: () => void;
  fitToView: () => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
}

/**
 * Options for useNetworkDiagram hook
 */
export interface UseNetworkDiagramOptions {
  /** Callback when network data is updated from SDK */
  onDataUpdate?: (data: NetworkDataset) => void;
  /** Callback when power flow results are updated from SDK */
  onPowerFlowUpdate?: (results: PowerFlowResults) => void;
  /** Enable automatic data sync from SDK events (default: true) */
  enableMCPIntegration?: boolean;
}

/**
 * Transform SDK NetworkData to NetworkDataset format
 */
function transformNetworkData(networkData: NetworkData): NetworkDataset {
  const { network_data: nd } = networkData;

  return {
    buses: nd.bus || [],
    aclines: nd.acline || [],
    transformers: nd.transformer || [],
    loads: nd.load || [],
    generators: nd.generator || [],
    fixedShunts: (nd as any).fixshunt || [],
    switchedShunts: (nd as any).swshunt || [],
    areas: (nd as any).area || [],
    zones: (nd as any).zone || [],
    caseId: nd.caseid,
  };
}

/**
 * Transform SDK PowerFlowData to PowerFlowResults format
 */
function transformPowerFlowData(powerFlowData: PowerFlowData): PowerFlowResults {
  return {
    busResults: powerFlowData.bus_results,
    aclineResults: powerFlowData.acline_results,
    transformerResults: powerFlowData.transformer_results,
    generatorResults: powerFlowData.generator_results,
    twotermdcResults: (powerFlowData as any).twotermdc_results,
    fixshuntResults: powerFlowData.fixshunt_results,
    swshuntResults: powerFlowData.swshunt_results,
    converged: powerFlowData.converged,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Hook for managing power grid diagram with SDK integration
 */
export function useNetworkDiagram(
  options: UseNetworkDiagramOptions = {}
): {
  handleRef: React.MutableRefObject<NetworkDiagramHandle | null>;
  dataset: NetworkDataset | null;
  powerFlowResults: PowerFlowResults | null;
  loadDataFromSDK: () => Promise<void>;
  loadPowerFlowFromSDK: () => Promise<void>;
  refreshFromSDK: () => Promise<void>;
} {
  const {
    onDataUpdate,
    onPowerFlowUpdate,
    enableMCPIntegration = true,
  } = options;

  const handleRef = useRef<NetworkDiagramHandle | null>(null);
  const datasetRef = useRef<NetworkDataset | null>(null);
  const powerFlowResultsRef = useRef<PowerFlowResults | null>(null);

  // Listen for SDK events when MCP integration is enabled
  useEffect(() => {
    if (!enableMCPIntegration) return;

    // Handle network data updates (e.g., after add/modify/delete operations)
    const handleNetworkUpdated = () => {
      console.log('[useNetworkDiagram] Network updated, refreshing diagram...');
      refreshFromSDK();
    };

    // Handle power flow completion
    const handleSolveFlowComplete = async (data: any) => {
      console.log('[useNetworkDiagram] Power flow complete, updating diagram...');
      await loadPowerFlowFromSDK();
    };

    // Subscribe to SDK events
    PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
    PowerFlowApp.on(SDK_EVENTS.SOLVE_FLOW_COMPLETE, handleSolveFlowComplete);
    PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, handleNetworkUpdated);

    return () => {
      PowerFlowApp.off(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdated);
      PowerFlowApp.off(SDK_EVENTS.SOLVE_FLOW_COMPLETE, handleSolveFlowComplete);
      PowerFlowApp.off(SDK_EVENTS.EDIT_COMPLETE, handleNetworkUpdated);
    };
  }, [enableMCPIntegration]);

  /**
   * Load network data from SDK
   */
  const loadDataFromSDK = useCallback(async () => {
    try {
      const networkData = await PowerFlowApp.getNetwork();
      if (!networkData) {
        console.warn('[useNetworkDiagram] No network data available');
        return;
      }

      const dataset = transformNetworkData(networkData);
      datasetRef.current = dataset;
      onDataUpdate?.(dataset);

      // Update diagram through handle if available
      handleRef.current?.updateData(dataset);
    } catch (error) {
      console.error('[useNetworkDiagram] Failed to load network data:', error);
    }
  }, [onDataUpdate]);

  /**
   * Load power flow results from SDK
   */
  const loadPowerFlowFromSDK = useCallback(async () => {
    try {
      const powerFlowData = await PowerFlowApp.getPowerFlowData() as PowerFlowData | null;
      if (!powerFlowData) {
        console.warn('[useNetworkDiagram] No power flow data available');
        return;
      }

      const results = transformPowerFlowData(powerFlowData);
      powerFlowResultsRef.current = results;
      onPowerFlowUpdate?.(results);

      // Update diagram through handle if available
      handleRef.current?.updatePowerFlowResults(results);
    } catch (error) {
      console.error('[useNetworkDiagram] Failed to load power flow data:', error);
    }
  }, [onPowerFlowUpdate]);

  /**
   * Refresh both network and power flow data from SDK
   */
  const refreshFromSDK = useCallback(async () => {
    await Promise.all([
      loadDataFromSDK(),
      loadPowerFlowFromSDK(),
    ]);
  }, [loadDataFromSDK, loadPowerFlowFromSDK]);

  return {
    handleRef,
    get dataset() { return datasetRef.current; },
    get powerFlowResults() { return powerFlowResultsRef.current; },
    loadDataFromSDK,
    loadPowerFlowFromSDK,
    refreshFromSDK,
  };
}

/**
 * Hook that creates the actual handle implementation
 */
export function useNetworkDiagramHandle(
  dataset: NetworkDataset | null,
  powerFlowResults: PowerFlowResults | null,
  onTransformChange?: (transform: { scale: number; offsetX: number; offsetY: number }) => void
): NetworkDiagramHandle {
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });

  const updateData = useCallback((data: NetworkDataset) => {
    // Data is handled through props, this is for external triggers
    console.log('[NetworkDiagramHandle] updateData called', data);
  }, []);

  const updatePowerFlowResults = useCallback((results: PowerFlowResults) => {
    // Results are handled through props
    console.log('[NetworkDiagramHandle] updatePowerFlowResults called', results);
  }, []);

  const highlightElements = useCallback((elementIds: string[]) => {
    console.log('[NetworkDiagramHandle] highlightElements called', elementIds);
    // TODO: Implement highlighting logic
  }, []);

  const selectElements = useCallback((elementIds: string[]) => {
    console.log('[NetworkDiagramHandle] selectElements called', elementIds);
    // TODO: Implement selection logic
  }, []);

  const resetView = useCallback(() => {
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
    onTransformChange?.(transformRef.current);
  }, [onTransformChange]);

  const exportAsPNG = useCallback(() => {
    console.log('[NetworkDiagramHandle] exportAsPNG called');
    // TODO: Implement export
  }, []);

  const fitToView = useCallback(() => {
    console.log('[NetworkDiagramHandle] fitToView called');
    // TODO: Implement fit to view
  }, []);

  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    console.log('[NetworkDiagramHandle] setLayerVisibility called', layerId, visible);
    // TODO: Implement layer visibility
  }, []);

  return {
    updateData,
    updatePowerFlowResults,
    highlightElements,
    selectElements,
    resetView,
    exportAsPNG,
    fitToView,
    setLayerVisibility,
  };
}
