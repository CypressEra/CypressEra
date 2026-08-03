import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NetworkDiagram } from '../NetworkDiagram';
import type { NetworkDiagramRef } from '../NetworkDiagram';
import { NetworkDataTable } from '../NetworkDataTable/NetworkDataTable';
import { convertSDKNetworkData, convertSDKPowerFlowData } from '../NetworkDiagram/utils/dataConverter';
import { ShortestPathModal } from '../../common/Modal/variants/shortest-path/ShortestPathModal';
import { NeighbourElementsModal } from '../../common/Modal/variants/neighbour-elements/NeighbourElementsModal';
import './NetworkView.css';

export type NetworkViewType = 'diagram' | 'table';

export interface NetworkViewProps {
  viewType: NetworkViewType;
  networkData?: any; // Original network data without power flow results
  powerFlowData?: any; // Power flow calculation results (separate from network data)
  /** True while a model/session is being opened and its network data is loading.
   *  Drives a loading overlay so large models don't look like a frozen page. */
  isLoading?: boolean;
  onElementSelect?: (elements: any) => void;
  onElementUpdate?: (element: any) => void;
  onTitleChange?: (title: string) => void;
  onViewChange?: (viewType: NetworkViewType) => void;
  onDataUpdated?: () => void;
  currentFile?: File | null;
  sessionInfo?: { id?: string; model_file?: string } | null;
  onUndoRedoReady?: (handlers: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
  triggerLoadFile?: () => void; // Callback to trigger file load dialog
  /** Receive the underlying NetworkDiagram ref once it's mounted. Used by the
   *  app shell to drive Save / Load Diagram actions from the menu bar. */
  onDiagramRefReady?: (ref: NetworkDiagramRef | null) => void;
  /** Fired whenever the live diagram element count changes. Drives the menu
   *  bar's disabled state on Save → Diagram items. */
  onDiagramElementsChanged?: (count: number) => void;
  /** Right-click context menu → Open Diagram. */
  onContextMenuOpenDiagram?: () => void;
  /** Right-click context menu → Save Diagram. */
  onContextMenuSaveDiagram?: () => void;
}

const NetworkView: React.FC<NetworkViewProps> = React.memo(({
  viewType,
  networkData,
  powerFlowData,
  isLoading,
  onElementSelect,
  onTitleChange,
  onViewChange,
  onDataUpdated,
  currentFile,
  sessionInfo,
  onUndoRedoReady,
  triggerLoadFile,
  onDiagramRefReady,
  onDiagramElementsChanged,
  onContextMenuOpenDiagram,
  onContextMenuSaveDiagram,
}) => {
  const { t } = useTranslation();

  // Track when diagram view becomes active to trigger canvas resize
  const diagramRef = useRef<HTMLDivElement>(null);
  // Ref to access NetworkDiagram methods (e.g., plotBuses)
  const diagramComponentRef = useRef<NetworkDiagramRef>(null);

  // Publish the diagram ref to the parent once the canvas has mounted so the
  // app shell (menu bar) can drive Save / Load Diagram. We re-publish on
  // unmount with null so stale refs don't survive route changes.
  useEffect(() => {
    if (onDiagramRefReady) onDiagramRefReady(diagramComponentRef.current);
    return () => { if (onDiagramRefReady) onDiagramRefReady(null); };
  }, [onDiagramRefReady]);

  // Graph analysis modal state
  const [isShortestPathModalOpen, setIsShortestPathModalOpen] = useState(false);
  const [shortestPathSourceBus, setShortestPathSourceBus] = useState<number | null>(null);
  const [isNeighbourElementsModalOpen, setIsNeighbourElementsModalOpen] = useState(false);
  const [neighbourElementsSourceBus, setNeighbourElementsSourceBus] = useState<number | null>(null);

  // Convert SDK NetworkData format to NetworkDataset format for NetworkDiagram
  const convertedNetworkData = useMemo(() => {
    if (!networkData) return null;
    console.log('[NetworkView] Converting networkData, aclines:', networkData.network_data?.acline?.length || 0);
    const converted = convertSDKNetworkData(networkData);
    console.log('[NetworkView] Converted data, aclines:', converted.aclines?.length || 0);
    return converted;
  }, [networkData]);

  // Convert SDK PowerFlowData format to PowerFlowResults format for NetworkDiagram
  const convertedPowerFlowData = useMemo(() => {
    if (!powerFlowData) return undefined;
    return convertSDKPowerFlowData(powerFlowData);
  }, [powerFlowData]);

  useEffect(() => {
    // When switching to diagram view, trigger a resize
    if (viewType === 'diagram' && diagramRef.current) {
      // Small delay to ensure display:block has been applied
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  }, [viewType]);

  useEffect(() => {
    if (onTitleChange) {
      const baseTitle = t('layout.caseNetwork');

      // Get file name from currentFile or sessionInfo.model_file (already a basename)
      let fileName: string | null = null;
      if (currentFile?.name) {
        fileName = currentFile.name;
      } else if (sessionInfo?.model_file) {
        fileName = sessionInfo.model_file;
      }

      const title = fileName
        ? `${baseTitle}: ${fileName}`
        : baseTitle;
      onTitleChange(title);
    }
  }, [onTitleChange, t, currentFile, sessionInfo]);

  // Generate a unique session key from sessionInfo or networkData
  // This is used to preserve plot state during data refresh (e.g., after modify/add/delete operations)
  const sessionKey = useMemo(() => {
    // Prefer the session id (unique and stable per session)
    if (sessionInfo?.id) {
      return sessionInfo.id;
    }
    // Fallback to session_id from networkData
    if (networkData?.session_id) {
      return networkData.session_id;
    }
    // Fallback to currentFile name
    if (currentFile?.name) {
      return currentFile.name;
    }
    // Default: undefined (will reset on every data change)
    return undefined;
  }, [sessionInfo?.id, networkData?.session_id, currentFile?.name]);

  return (
    <div className="network-view">
      <div className="view-tabs">
        <button
          className={`view-tab ${viewType === 'table' ? 'active' : ''}`}
          onClick={() => onViewChange?.('table')}
        >
          {t('buttons.table')}
        </button>
        <button
          className={`view-tab ${viewType === 'diagram' ? 'active' : ''}`}
          onClick={() => onViewChange?.('diagram')}
        >
          {t('buttons.diagram')}
        </button>
      </div>
      <div className="view-content">
        <div ref={diagramRef} className={`view-panel ${viewType === 'diagram' ? 'active' : ''}`}>
          <NetworkDiagram
            ref={diagramComponentRef}
            data={convertedNetworkData || undefined}
            powerFlowResults={convertedPowerFlowData}
            onElementClick={(element) => {
              // Convert single element click to selection format
              onElementSelect?.([element]);
            }}
            onSelectionChange={onElementSelect}
            triggerLoadFile={triggerLoadFile}
            sessionKey={sessionKey}
            onElementsChanged={onDiagramElementsChanged}
            onContextMenuOpenDiagram={onContextMenuOpenDiagram}
            onContextMenuSaveDiagram={onContextMenuSaveDiagram}
          />
        </div>
        <div className={`view-panel ${viewType === 'table' ? 'active' : ''}`}>
          <NetworkDataTable
            networkData={networkData}
            powerFlowData={powerFlowData}
            onDataUpdated={onDataUpdated}
            onUndoRedoReady={onUndoRedoReady}
            triggerLoadFile={triggerLoadFile}
            diagramRef={diagramComponentRef}
            onViewChange={onViewChange}
            onFindShortestPath={(busNumber) => {
              setShortestPathSourceBus(busNumber);
              setIsShortestPathModalOpen(true);
            }}
            onFindNeighbourElements={(busNumber) => {
              setNeighbourElementsSourceBus(busNumber);
              setIsNeighbourElementsModalOpen(true);
            }}
          />
        </div>

        {/* Loading overlay shown while a model/session is being opened so a large
            model's fetch doesn't make the network panel look frozen. */}
        {isLoading && (
          <div className="network-view__loading" role="status" aria-live="polite">
            <div className="network-view__loading-card">
              <div className="network-view__spinner" aria-hidden="true" />
              <div className="network-view__loading-text">
                {t('messages.loadingNetworkData')}
              </div>
            </div>
          </div>
        )}
      </div>

      {convertedNetworkData && isShortestPathModalOpen && (
        <ShortestPathModal
          isOpen={isShortestPathModalOpen}
          onClose={() => {
            setIsShortestPathModalOpen(false);
            setShortestPathSourceBus(null);
          }}
          sourceBusNumber={shortestPathSourceBus}
          buses={convertedNetworkData.buses || []}
          data={convertedNetworkData}
        />
      )}

      {convertedNetworkData && isNeighbourElementsModalOpen && (
        <NeighbourElementsModal
          isOpen={isNeighbourElementsModalOpen}
          onClose={() => {
            setIsNeighbourElementsModalOpen(false);
            setNeighbourElementsSourceBus(null);
          }}
          sourceBusNumber={neighbourElementsSourceBus}
          data={convertedNetworkData}
        />
      )}
    </div>
  );
});
NetworkView.displayName = 'NetworkView';

export default NetworkView;
