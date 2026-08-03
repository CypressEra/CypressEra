import React, { useState, useRef, useEffect } from 'react';
import { ResizablePanel } from './ResizablePanel';
import { ResizableContainer } from './ResizableContainer';
import { VerticalResizer } from './VerticalResizer';
import { ProjectExplorer } from '../features/ProjectExplorer';
import { CommandLogger } from '../features/CommandLogger';
import { AIAssistant } from '../features/AIAssistant';
import { NetworkView, NetworkViewType } from '../features/NetworkView';
import type { NetworkDiagramRef } from '../features/NetworkDiagram';
import { FileViewer } from '../features/FileViewer';
import { PowerFlowApp } from '../../sdk';
import { useNotification } from '../../hooks';
import { useTranslation } from 'react-i18next';
import './GridLayout.css';


interface GridLayoutProps {
  onFileUpload?: (file: File, fileType?: 'model' | 'knowledge' | 'sub' | 'mon' | 'con' | 'diagram') => void;
  onRunAnalysis?: () => void;
  // Project Explorer props for user files
  onFileSelect?: (fileName: string) => void;
  modelFiles?: string[];
  knowledgeFiles?: string[];
  subFiles?: string[];
  monFiles?: string[];
  conFiles?: string[];
  loadedStudyFiles?: { sub: string | null; mon: string | null; con: string | null };
  onLoadStudyFile?: (fileType: 'sub' | 'mon' | 'con', fileName: string) => void;
  studyResults?: any[];
  onStudyResultClick?: (resultId: string) => void;
  onDeleteStudyResult?: (resultId: string, resultName: string) => Promise<void>;
  onRefreshFiles?: () => void;
  onRefreshKnowledge?: () => void;
  onRefreshStudyResults?: () => void;
  networkData?: any; // Original network data without power flow results
  powerFlowData?: any; // Power flow calculation results (separate from network data)
  /** True while a model/session is being opened and its network data is loading. */
  isNetworkLoading?: boolean;
  onDataUpdated?: () => void;
  currentFile?: File | null;
  sessionInfo?: { id?: string; model_file?: string } | null;
  baseURL?: string;
  // Expose file input triggers for menu bar
  onFileInputReady?: (triggers: { triggerModels: () => void; triggerKnowledge: () => void }) => void;
  onKnowledgeFileClick?: (fileName: string) => void;
  onDeleteFile?: (fileName: string, fileType: 'model' | 'knowledge' | 'sub' | 'mon' | 'con' | 'diagram') => Promise<void>;
  selectedFile?: string | null;
  onUndoRedoReady?: (handlers: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
  triggerLoadFile?: () => void; // Callback to trigger file load dialog
  onDiagramRefReady?: (ref: NetworkDiagramRef | null) => void;
  onDiagramElementsChanged?: (count: number) => void;
  onContextMenuOpenDiagram?: () => void;
  onContextMenuSaveDiagram?: () => void;
  /** Expose a setter that lets the app shell flip the network panel between
   *  'diagram' and 'table' (used by Open → Diagram to auto-switch). */
  onSetNetworkViewReady?: (setView: (view: NetworkViewType) => void) => void;
  onResetLayoutReady?: (resetFn: () => void) => void; // Expose reset layout function
  /** Callback when AI tool execution completes - used to update UI state */
  onToolResults?: (results: Array<{ call_id: string; name: string; success: boolean; error?: string }>) => void;
}

type FullscreenPanel = 'explorer' | 'main' | 'logger' | null;

export const GridLayout: React.FC<GridLayoutProps> = ({
  onFileUpload,
  onRunAnalysis,
  onFileSelect,
  modelFiles,
  knowledgeFiles,
  subFiles,
  monFiles,
  conFiles,
  loadedStudyFiles,
  onLoadStudyFile,
  studyResults,
  onStudyResultClick,
  onDeleteStudyResult,
  onDeleteFile,
  onRefreshFiles,
  onRefreshKnowledge,
  onRefreshStudyResults,
  baseURL,
  networkData,
  powerFlowData,
  isNetworkLoading,
  onDataUpdated,
  currentFile,
  sessionInfo,
  onFileInputReady,
  onKnowledgeFileClick,
  selectedFile,
  onUndoRedoReady,
  triggerLoadFile,
  onDiagramRefReady,
  onDiagramElementsChanged,
  onContextMenuOpenDiagram,
  onContextMenuSaveDiagram,
  onSetNetworkViewReady,
  onResetLayoutReady,
  onToolResults
}) => {
  // Detect if device is mobile - responsive to screen size changes
  const [isMobileDevice, setIsMobileDevice] = useState(() => {
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    return isMobileUA || isSmallScreen;
  });

  // Update mobile detection on resize
  useEffect(() => {
    const checkMobile = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobileDevice(isMobileUA || isSmallScreen);
    };

    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load saved panel widths from localStorage
  const getSavedWidth = (key: string, defaultWidth: number): number => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? parseInt(saved, 10) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  };

  // Load saved AI assistant collapsed state
  const getSavedCollapsedState = (): boolean => {
    try {
      const saved = localStorage.getItem('panel-ai-collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  };

  // Load saved knowledge base enabled state
  const getSavedKnowledgeBaseState = (): boolean => {
    try {
      const saved = localStorage.getItem('ai-use-knowledge-base');
      // Default to true if not set
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  };

  const [isAIAssistantCollapsed, setIsAIAssistantCollapsed] = useState(getSavedCollapsedState);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(getSavedKnowledgeBaseState);
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null);
  const [diagramHeightPercent, setDiagramHeightPercent] = useState<number>(() =>
    getSavedWidth('panel-diagram-height-percent', 75)
  );
  const [networkView, setNetworkView] = useState<NetworkViewType>('table');

  // Publish the network-view setter to the app shell so menu actions (e.g.
  // Open → Diagram) can flip the panel automatically.
  useEffect(() => {
    if (onSetNetworkViewReady) onSetNetworkViewReady(setNetworkView);
  }, [onSetNetworkViewReady]);
  const [panelTitle, setPanelTitle] = useState<string>('');
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [viewerFileName, setViewerFileName] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<
    'knowledge' | 'sub' | 'mon' | 'con'
  >('knowledge');

  // Panel widths - load from localStorage or use defaults
  // On mobile devices, use smaller defaults and ignore localStorage
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    if (isMobileDevice) return 200;
    return getSavedWidth('panel-left-width', 350);
  });
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    if (isMobileDevice) return 300;
    return getSavedWidth('panel-right-width', 650);
  });

  // Adjust panel widths when switching between mobile/desktop
  useEffect(() => {
    if (isMobileDevice) {
      // Clamp to mobile-appropriate widths
      setLeftPanelWidth(prev => Math.min(prev, 400));
      setRightPanelWidth(prev => Math.min(prev, 800));
    }
  }, [isMobileDevice]);

  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const knowledgeFileInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useTranslation();
  const { showError } = useNotification();

  // Save panel widths to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('panel-left-width', leftPanelWidth.toString());
    } catch (e) {
      console.warn('Failed to save left panel width:', e);
    }
  }, [leftPanelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('panel-right-width', rightPanelWidth.toString());
    } catch (e) {
      console.warn('Failed to save right panel width:', e);
    }
  }, [rightPanelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('panel-diagram-height-percent', diagramHeightPercent.toString());
    } catch (e) {
      console.warn('Failed to save diagram height percent:', e);
    }
  }, [diagramHeightPercent]);

  // Save AI assistant collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('panel-ai-collapsed', isAIAssistantCollapsed.toString());
    } catch (e) {
      console.warn('Failed to save AI assistant collapsed state:', e);
    }
  }, [isAIAssistantCollapsed]);

  // Save knowledge base enabled state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai-use-knowledge-base', useKnowledgeBase.toString());
    } catch (e) {
      console.warn('Failed to save knowledge base state:', e);
    }
  }, [useKnowledgeBase]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'model' | 'knowledge' = 'model') => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload?.(e.target.files[0], fileType);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  const handleAddFile = () => {
    fileInputRef.current?.click();
  };

  const handleAddKnowledge = () => {
    knowledgeFileInputRef.current?.click();
  };

  const openFileInViewer = (
    fileName: string,
    fileType: 'knowledge' | 'sub' | 'mon' | 'con',
  ) => {
    setViewerFileName(fileName);
    setViewerFileType(fileType);
    setFileViewerOpen(true);
  };

  const handleDownloadFile = async (
    fileName: string,
    fileType: 'model' | 'knowledge' | 'sub' | 'mon' | 'con',
  ) => {
    try {
      const blob = await PowerFlowApp.downloadUserFile(fileName, fileType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to download file:', err);
      showError('Download Failed', err?.message || `Failed to download ${fileName}`);
    }
  };

  const handleFileViewerClose = () => {
    setFileViewerOpen(false);
    setViewerFileName('');
  };

  // Expose file input triggers to parent component
  useEffect(() => {
    if (onFileInputReady) {
      onFileInputReady({
        triggerModels: () => fileInputRef.current?.click(),
        triggerKnowledge: () => knowledgeFileInputRef.current?.click()
      });
    }
  }, [onFileInputReady]);

  const toggleFullscreen = (panel: FullscreenPanel) => {
    setFullscreenPanel(fullscreenPanel === panel ? null : panel);
  };

  const handleVerticalResize = (newHeight: number) => {
    if (!mainContentRef.current) return;
    const containerHeight = mainContentRef.current.clientHeight;
    const percent = (newHeight / containerHeight) * 100;
    setDiagramHeightPercent(Math.max(30, Math.min(80, percent))); // Clamp between 30-80%
  };

  // Reset layout to default values
  const resetLayout = () => {
    setLeftPanelWidth(350);
    setRightPanelWidth(650);
    setDiagramHeightPercent(75);
    setIsAIAssistantCollapsed(false);
    setUseKnowledgeBase(true);
    setFullscreenPanel(null);
    // Clear localStorage
    try {
      localStorage.removeItem('panel-left-width');
      localStorage.removeItem('panel-right-width');
      localStorage.removeItem('panel-diagram-height-percent');
      localStorage.removeItem('panel-ai-collapsed');
      localStorage.removeItem('ai-use-knowledge-base');
    } catch (e) {
      console.warn('Failed to clear layout from localStorage:', e);
    }
  };

  // Expose reset layout function to parent component
  useEffect(() => {
    if (onResetLayoutReady) {
      onResetLayoutReady(resetLayout);
    }
  }, [onResetLayoutReady]);

  return (
    <div className={`grid-layout ${fullscreenPanel ? 'has-fullscreen' : ''}`}>
      {/* Hidden file inputs for ProjectExplorer.
          The study-case input accepts the model (.rawx) and the three
          study-case file kinds (.sub/.mon/.con); the kind is detected by
          extension so the correct upload route is used. .raw and .sav are
          included so users can pick them — App.handleFileUpload then shows
          the "rawx only" notice. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".rawx,.raw,.sav,.sub,.mon,.con"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const lower = file.name.toLowerCase();
          const fileType: 'model' | 'sub' | 'mon' | 'con' =
            lower.endsWith('.sub') ? 'sub' :
            lower.endsWith('.mon') ? 'mon' :
            lower.endsWith('.con') ? 'con' :
            'model';
          onFileUpload?.(file, fileType);
        }}
      />
      <input
        ref={knowledgeFileInputRef}
        type="file"
        accept="*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, 'knowledge')}
      />
      
      {/* Left Sidebar - Resizable - Always rendered, hidden when not in fullscreen or not explorer */}
      <ResizableContainer
        defaultWidth={leftPanelWidth}
        minWidth={isMobileDevice ? 150 : 280}
        maxWidth={isMobileDevice ? 400 : 600}
        resizeHandleSide="right"
        onResize={setLeftPanelWidth}
        className={`${fullscreenPanel === 'explorer' ? 'fullscreen-panel' : ''} ${fullscreenPanel && fullscreenPanel !== 'explorer' ? 'hidden-panel' : ''}`}
      >
        <ResizablePanel 
          title={t('layout.projectExplorer')} 
          resizable={false}
          onFullscreen={() => toggleFullscreen('explorer')}
          isFullscreen={fullscreenPanel === 'explorer'}
        >
          <ProjectExplorer 
            onFileSelect={onFileSelect || ((file) => console.log('Selected file:', file))}
            modelFiles={modelFiles || []}
            knowledgeFiles={knowledgeFiles || []}
            subFiles={subFiles || []}
            monFiles={monFiles || []}
            conFiles={conFiles || []}
            loadedStudyFiles={loadedStudyFiles}
            onLoadStudyFile={onLoadStudyFile}
            studyResults={studyResults}
            onStudyResultClick={onStudyResultClick}
            onDeleteStudyResult={onDeleteStudyResult}
            onRefresh={onRefreshFiles}
            onRefreshKnowledge={onRefreshKnowledge}
            onRefreshStudyResults={onRefreshStudyResults}
            onAddFile={handleAddFile}
            onAddKnowledge={handleAddKnowledge}
            onKnowledgeFileClick={
              onKnowledgeFileClick || ((name) => openFileInViewer(name, 'knowledge'))
            }
            onDownloadFile={handleDownloadFile}
            onViewFile={openFileInViewer}
            onDeleteFile={onDeleteFile}
            selectedFile={selectedFile}
          />
        </ResizablePanel>
      </ResizableContainer>

      {/* Main Content Area - Always rendered */}
      <div 
        ref={mainContentRef}
        className={`grid-main ${fullscreenPanel === 'main' || fullscreenPanel === 'logger' ? 'fullscreen-panel' : ''} ${fullscreenPanel === 'explorer' ? 'hidden-panel' : ''}`}
      >
        {/* Main Panel - Always rendered, hidden when logger is fullscreen */}
        <div 
          className={`grid-row diagram-row ${fullscreenPanel === 'logger' ? 'hidden-panel' : ''}`}
          style={{ 
            height: fullscreenPanel === 'main' ? '100%' : fullscreenPanel === 'logger' ? '0' : `calc(${diagramHeightPercent}% - 6px)`,
            marginBottom: fullscreenPanel === 'main' ? 0 : 0,
          }}
        >
          <ResizablePanel 
            title={<span>{panelTitle}</span>}
            className="main-panel full-width" 
            resizable={false}
            minWidth={100}
            onFullscreen={() => toggleFullscreen('main')}
            isFullscreen={fullscreenPanel === 'main'}
          >
            <NetworkView
              viewType={networkView}
              networkData={networkData}
              powerFlowData={powerFlowData}
              isLoading={isNetworkLoading}
              onElementSelect={undefined}
              onElementUpdate={undefined}
              onTitleChange={setPanelTitle}
              onViewChange={setNetworkView}
              onDataUpdated={onDataUpdated}
              currentFile={currentFile}
              sessionInfo={sessionInfo}
              onUndoRedoReady={onUndoRedoReady}
              triggerLoadFile={triggerLoadFile}
              onDiagramRefReady={onDiagramRefReady}
              onDiagramElementsChanged={onDiagramElementsChanged}
              onContextMenuOpenDiagram={onContextMenuOpenDiagram}
              onContextMenuSaveDiagram={onContextMenuSaveDiagram}
            />
          </ResizablePanel>
        </div>

        {/* Vertical Resizer - Hidden when in fullscreen */}
        {!fullscreenPanel && <VerticalResizer onResize={handleVerticalResize} containerRef={mainContentRef} />}

        {/* Command Logger - Always rendered, hidden when main is fullscreen */}
        <div 
          className={`grid-row logger-row ${fullscreenPanel === 'main' ? 'hidden-panel' : ''}`}
          style={{ 
            height: fullscreenPanel === 'logger' ? '100%' : fullscreenPanel === 'main' ? '0' : `calc(${100 - diagramHeightPercent}% - 6px)`,
            marginTop: fullscreenPanel === 'logger' ? 0 : 0,
          }}
        >
          <ResizablePanel 
            title={t('layout.commandLogger')} 
            className="logger-panel" 
            resizable={false}
            minWidth={100}
            onFullscreen={() => toggleFullscreen('logger')}
            isFullscreen={fullscreenPanel === 'logger'}
          >
            <CommandLogger />
          </ResizablePanel>
        </div>
      </div>

      {/* Right Sidebar - AI Assistant - Always rendered, hidden when in fullscreen */}
      <div className={fullscreenPanel ? 'hidden-panel' : ''}>
        <ResizableContainer
          defaultWidth={rightPanelWidth}
          minWidth={isMobileDevice ? 120 : 180}
          maxWidth={isMobileDevice ? 800 : 1200}
          resizeHandleSide="left"
          onResize={setRightPanelWidth}
          isExpanded={!isAIAssistantCollapsed}
          onToggleExpand={(isExpanded) => setIsAIAssistantCollapsed(!isExpanded)}
        >
          {(isExpanded, toggle, isTransitioning) => (
            <AIAssistant
              key="ai-assistant"
              isCollapsed={!isExpanded}
              onToggleCollapse={toggle}
              baseURL={baseURL}
              modelFiles={modelFiles || []}
              isTransitioning={isTransitioning}
              useKnowledgeBase={useKnowledgeBase}
              onKnowledgeBaseChange={setUseKnowledgeBase}
              onToolResults={onToolResults}
            />
          )}
        </ResizableContainer>
      </div>

      {/* File Viewer Modal */}
      <FileViewer
        isOpen={fileViewerOpen}
        onClose={handleFileViewerClose}
        fileName={viewerFileName}
        fileType={viewerFileType}
      />
    </div>
  );
};