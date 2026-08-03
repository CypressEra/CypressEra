import React, { useState } from 'react';
import './ProjectExplorer.css';
import { useTranslation } from 'react-i18next';
import { ContextMenu, useContextMenu, MenuItem } from '../../common/ContextMenu';
import { AlertModal } from '../../common';

type StudyFileType = 'sub' | 'mon' | 'con';

interface ProjectExplorerProps {
  onFileSelect?: (fileName: string) => void;
  modelFiles: string[];
  knowledgeFiles?: string[];
  /** Subsystem (.sub) study-case library files */
  subFiles?: string[];
  /** Monitor (.mon) study-case library files */
  monFiles?: string[];
  /** Contingency (.con) study-case library files */
  conFiles?: string[];
  /** File currently loaded into the session for each study-file type */
  loadedStudyFiles?: { sub: string | null; mon: string | null; con: string | null };
  /** Load a .sub/.mon/.con file into the current session */
  onLoadStudyFile?: (fileType: StudyFileType, fileName: string) => void;
  onRefresh?: () => void;
  onRefreshKnowledge?: () => void;
  /** Reload the stored study-result history. */
  onRefreshStudyResults?: () => void;
  onAddFile?: () => void;
  onAddKnowledge?: () => void;
  onKnowledgeFileClick?: (fileName: string) => void;
  /** Download a model, sub/mon/con or knowledge file to the user's machine. */
  onDownloadFile?: (fileName: string, fileType: 'model' | 'knowledge' | StudyFileType) => void;
  /** Open a sub/mon/con or knowledge file in the file viewer. */
  onViewFile?: (fileName: string, fileType: 'knowledge' | StudyFileType) => void;
  onDeleteFile?: (fileName: string, fileType: 'model' | 'knowledge' | StudyFileType) => Promise<void>;
  /** Stored study results (durable analysis history). */
  studyResults?: any[];
  /** Open a study result by its id. */
  onStudyResultClick?: (resultId: string) => void;
  /** Delete a stored study result by its id. */
  onDeleteStudyResult?: (resultId: string, resultName: string) => Promise<void>;
  selectedFile?: string | null;
}

export const ProjectExplorer: React.FC<ProjectExplorerProps> = ({ 
  onFileSelect,
  modelFiles,
  knowledgeFiles = [],
  subFiles = [],
  monFiles = [],
  conFiles = [],
  loadedStudyFiles = { sub: null, mon: null, con: null },
  onLoadStudyFile,
  onRefresh,
  onRefreshKnowledge,
  onRefreshStudyResults,
  onAddFile,
  onAddKnowledge,
  onKnowledgeFileClick,
  onDownloadFile,
  onViewFile,
  onDeleteFile,
  studyResults = [],
  onStudyResultClick,
  onDeleteStudyResult,
  selectedFile
}) => {
  const [clickedFile, setClickedFile] = useState<string | null>(null);
  const { t } = useTranslation();
  
  // Context menu for file operations
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
    items: [],
  });

  // Delete confirmation modal state. A study-result deletion carries a
  // studyResultId (and a null fileType); a file deletion carries a fileType.
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    fileName: string;
    fileType: 'model' | 'knowledge' | StudyFileType | null;
    studyResultId: string | null;
  }>({
    isOpen: false,
    fileName: '',
    fileType: null,
    studyResultId: null,
  });

  // Error notification state
  const [errorNotification, setErrorNotification] = useState<{
    isOpen: boolean;
    message: string;
  }>({
    isOpen: false,
    message: '',
  });

  // Build file tree with dynamic models from the model-file library
  const buildFileTree = () => {
    const modelsChildren = modelFiles.map(file => ({
      id: file,
      name: file,
      type: 'file',
      icon: '/model.png',
      indent: true,
      placeholder: false,
    }));

    if (modelFiles.length === 0) {
      modelsChildren.push({
        id: 'no_models',
        name: t('layout.noFilesFound'),
        type: 'file',
        icon: '/model.png',
        indent: true,
        placeholder: true,
      });
    }

    // Build a study-case category (.sub/.mon/.con). Clicking a file loads it
    // into the current session; the studyType drives the load + highlight.
    const buildCategory = (categoryId: string, files: string[], studyType: StudyFileType) => {
      if (files.length === 0) {
        return [{
          id: `no_${categoryId}`,
          name: t('layout.noItemsFound'),
          type: 'file',
          icon: '/file.png',
          indent: true,
          placeholder: true,
        }];
      }
      return files.map(file => ({
        id: `${categoryId}_${file}`,
        name: file,
        type: 'file',
        icon: '/file.png',
        indent: true,
        placeholder: false,
        studyType,
      }));
    };

    return [
      {
        id: 'model',
        name: t('layout.model'),
        type: 'folder',
        icon: '/folder.png',
        children: modelsChildren,
      },
      {
        id: 'subsystem',
        name: t('layout.subsystem'),
        type: 'folder',
        icon: '/folder.png',
        children: buildCategory('subsystem', subFiles, 'sub'),
      },
      {
        id: 'monitor',
        name: t('layout.monitor'),
        type: 'folder',
        icon: '/folder.png',
        children: buildCategory('monitor', monFiles, 'mon'),
      },
      {
        id: 'contingency',
        name: t('layout.contingency'),
        type: 'folder',
        icon: '/folder.png',
        children: buildCategory('contingency', conFiles, 'con'),
      },
    ];
  };

  // Build knowledge base tree from API data
  const buildKnowledgeBaseTree = () => {
    const kbItems = knowledgeFiles.map(file => ({
      id: `kb_${file}`,
      name: file,
      type: 'file',
      icon: '/file.png',
      indent: true,
      placeholder: false,
    }));

    if (knowledgeFiles.length === 0) {
      kbItems.push({
        id: 'no_kb_files',
        name: t('layout.noKnowledgeFilesFound'),
        type: 'file',
        icon: '/file.png',
        indent: true,
        placeholder: true,
      });
    }

    return [
      {
        id: 'knowledgeBase',
        name: t('layout.knowledgeBase'),
        type: 'folder',
        icon: '/folder.png',
        children: kbItems,
      },
    ];
  };

  // Build the study-result tree from the user's stored analysis history.
  // Each entry opens its report; an empty history shows a placeholder.
  const buildStudyResultTree = () => {
    if (!studyResults || studyResults.length === 0) {
      return [{
        id: 'no_study_results',
        name: t('layout.noItemsFound'),
        type: 'file',
        icon: '/file.png',
        indent: false,
        placeholder: true,
      }];
    }
    // Format a timestamp as `YYYY-MM-DD HH:MM:SS` — no '/', ',' or '.'.
    const formatWhen = (iso: string): string => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    };
    return studyResults.map((r: any) => {
      const label =
        r.type === 'ac_contingency_analysis' ? 'AC Contingency Analysis' : r.type || 'Study Result';
      const when = r.created_at ? formatWhen(r.created_at) : '';
      return {
        id: `sr_${r.id}`,
        studyResultId: r.id,
        name: when ? `${label} - ${when}` : label,
        type: 'file',
        icon: '/file.png',
        indent: false,
        placeholder: false,
      };
    });
  };

  const staticFileTree = buildFileTree();
  const knowledgeBaseTree = buildKnowledgeBaseTree();
  const studyResultTree = buildStudyResultTree();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['model', 'knowledgeBase'])
  );

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleStaticFileClick = (file: any, isNetworkFile: boolean = false) => {
    if (file.type === 'folder') {
      toggleFolder(file.id);
      return;
    }
    // Placeholder rows ("No items found") are not interactive
    if (file.placeholder) {
      return;
    }
    // Study-case files (.sub/.mon/.con): load into the current session.
    // App.tsx enforces that a study model is loaded first.
    if (file.studyType) {
      onLoadStudyFile?.(file.studyType, file.name);
      return;
    }
    // Study-result history entries: open the saved result viewer.
    if (file.studyResultId) {
      onStudyResultClick?.(file.studyResultId);
      return;
    }
    // Network/model files: selection managed externally via selectedFile prop
    if (isNetworkFile) {
      onFileSelect?.(file.id);
      return;
    }
    // Knowledge base files: open the file viewer
    if (onKnowledgeFileClick && file.id.startsWith('kb_')) {
      onKnowledgeFileClick(file.name);
      return;
    }
    // Other non-network files: brief click effect
    setClickedFile(file.id);
    setTimeout(() => setClickedFile(null), 200);
  };

  const handleFileContextMenu = (e: React.MouseEvent, file: any, isNetworkFile: boolean = false) => {
    // No context menu for folders or placeholder ("No items found") rows
    if (file.type === 'folder' || file.placeholder) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const fileName = file.name;
    const isStudyResult = !!file.studyResultId;
    // Study-case files carry a studyType ('sub'|'mon'|'con'); files in the
    // Model folder are network files; everything else is a knowledge file.
    const fileType: 'model' | 'knowledge' | StudyFileType = file.studyType
      ? file.studyType
      : isNetworkFile
        ? 'model'
        : 'knowledge';

    const menuItems: MenuItem[] = [];

    // Study results (e.g. ACCC) open their saved report — same action as single-click.
    if (isStudyResult) {
      menuItems.push({
        id: 'view',
        label: t('contextMenu.view', 'View'),
        action: () => {
          hideContextMenu();
          if (!onStudyResultClick) {
            setErrorNotification({
              isOpen: true,
              message: 'View functionality is not available. Please refresh the page.',
            });
            return;
          }
          onStudyResultClick(file.studyResultId);
        },
      });
    }

    // Study files (.sub/.mon/.con) and knowledge files can be opened in the viewer.
    // Model files have their own editor flow and are excluded.
    const isStudyFile =
      !isStudyResult && (fileType === 'sub' || fileType === 'mon' || fileType === 'con');
    const canView = !isStudyResult && (isStudyFile || fileType === 'knowledge');
    if (canView) {
      menuItems.push({
        id: 'view',
        label: t('contextMenu.view', 'View'),
        action: () => {
          hideContextMenu();
          if (!onViewFile) {
            setErrorNotification({
              isOpen: true,
              message: 'View functionality is not available. Please refresh the page.',
            });
            return;
          }
          onViewFile(fileName, fileType as 'knowledge' | StudyFileType);
        },
      });
    }

    // Download is offered for every concrete user file (model + study + knowledge).
    const canDownload = !isStudyResult && (canView || isNetworkFile);
    if (canDownload) {
      menuItems.push({
        id: 'download',
        label: t('contextMenu.download', 'Download'),
        action: () => {
          hideContextMenu();
          if (!onDownloadFile) {
            setErrorNotification({
              isOpen: true,
              message: 'Download functionality is not available. Please refresh the page.',
            });
            return;
          }
          onDownloadFile(fileName, fileType as 'model' | 'knowledge' | StudyFileType);
        },
      });
    }

    // Add delete option - always show it, handle error if the handler is missing
    menuItems.push({
      id: 'delete',
      label: t('contextMenu.delete', 'Delete'),
      action: () => {
        hideContextMenu(); // Close menu before showing confirmation

        const handlerAvailable = isStudyResult ? !!onDeleteStudyResult : !!onDeleteFile;
        if (!handlerAvailable) {
          setErrorNotification({
            isOpen: true,
            message: 'Delete functionality is not available. Please refresh the page.',
          });
          return;
        }

        // Show confirmation modal
        setDeleteConfirmation({
          isOpen: true,
          fileName,
          fileType: isStudyResult ? null : fileType,
          studyResultId: isStudyResult ? file.studyResultId : null,
        });
      },
    });

    showContextMenu(e, menuItems);
  };

  const renderStaticFileNode = (node: any, isNetworkFile: boolean = false) => {
    const isExpanded = expandedFolders.has(node.id);
    // Highlight the study-case file currently loaded into the session
    const isStudyLoaded = !!node.studyType
      && loadedStudyFiles[node.studyType as StudyFileType] === node.name;
    // Show selected state for network files (models) and the loaded study file
    const isSelected = (isNetworkFile && selectedFile === node.id) || isStudyLoaded;
    // Show click effect for non-network, non-study files
    const isClicked = !isNetworkFile && !node.studyType && clickedFile === node.id;

    return (
      <div key={node.id}>
        <div
          className={`file-item ${node.indent ? 'indent' : ''} ${isSelected ? 'selected' : ''} ${isClicked ? 'clicked' : ''}`}
          onClick={() => handleStaticFileClick(node, isNetworkFile)}
          onContextMenu={(e) => handleFileContextMenu(e, node, isNetworkFile)}
        >
          {node.type === 'folder' && (
            <span className="folder-arrow">{isExpanded ? '▼' : '▶'}</span>
          )}
          <span className="file-icon">
            {typeof node.icon === 'string' && node.icon.startsWith('/') && node.icon.endsWith('.png')
              ? <img src={node.icon} alt="" style={{ width: '14px', height: '14px', objectFit: 'contain' }} />
              : node.icon}
          </span>
          <span className="file-name">{node.name}</span>
        </div>
        {node.type === 'folder' && isExpanded && node.children && (
          <div className="folder-children">
            {node.children.map((child: any) => renderStaticFileNode(child, isNetworkFile))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="project-explorer">
      <div className="section-header">
        <span>{t('layout.networkFiles')}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            className="refresh-btn" 
            onClick={onRefresh}
            title="Refresh study cases"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button 
            className="add-file-btn" 
            title={t('layout.addFile')}
            onClick={(e) => {
              e.stopPropagation();
              onAddFile?.();
            }}
          >+</button>
        </div>
      </div>
      
      <div className="file-tree">
        {/* Study Cases: only the Model folder holds selectable network files;
            the .sub/.mon/.con categories are display-only libraries */}
        {staticFileTree.map((node) => renderStaticFileNode(node, node.id === 'model'))}
      </div>

      <div className="section-divider"></div>

      <div className="section-header">
        <span>{t('layout.aiKnowledgeBase')}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            className="refresh-btn" 
            onClick={onRefreshKnowledge || onRefresh}
            title="Refresh knowledge base"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button 
            className="add-file-btn" 
            title={t('layout.addFile')}
            onClick={(e) => {
              e.stopPropagation();
              onAddKnowledge?.();
            }}
          >+</button>
        </div>
      </div>
      
      <div className="file-tree">
        {/* Knowledge base items - no selection state, only hover/click */}
        {knowledgeBaseTree.map((node) => renderStaticFileNode(node, false))}
      </div>

      <div className="section-divider"></div>

      <div className="section-header">
        <span>{t('layout.studyResult')}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="refresh-btn"
            onClick={onRefreshStudyResults}
            title="Refresh study results"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="file-tree">
        {/* Study Result - UI only, no data source yet */}
        {studyResultTree.map((node) => renderStaticFileNode(node, false))}
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.position && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={hideContextMenu}
        />
      )}

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, fileName: '', fileType: null, studyResultId: null })}
        title={t('contextMenu.delete', 'Delete')}
        message={t('confirmations.deleteFile', `Are you sure you want to delete "${deleteConfirmation.fileName}"? This action cannot be undone.`, { 
          fileName: deleteConfirmation.fileName 
        })}
        type="warning"
        width={450}
        confirmMode={true}
        confirmText={t('contextMenu.delete', 'Delete')}
        cancelText={t('contextMenu.cancel', 'Cancel')}
        onConfirm={async () => {
          try {
            if (deleteConfirmation.studyResultId) {
              if (!onDeleteStudyResult) return;
              await onDeleteStudyResult(deleteConfirmation.studyResultId, deleteConfirmation.fileName);
            } else {
              if (!onDeleteFile || !deleteConfirmation.fileType) return;
              await onDeleteFile(deleteConfirmation.fileName, deleteConfirmation.fileType);
            }
            // Note: list refresh is handled by the caller in App.tsx
            // Close confirmation modal
            setDeleteConfirmation({ isOpen: false, fileName: '', fileType: null, studyResultId: null });
          } catch (error) {
            console.error('Failed to delete file:', error);
            // Close confirmation modal
            setDeleteConfirmation({ isOpen: false, fileName: '', fileType: null, studyResultId: null });
            // Show error notification
            setErrorNotification({
              isOpen: true,
              message: t('errors.deleteFileFailed', `Failed to delete file: {{error}}`, { 
                error: error instanceof Error ? error.message : 'Unknown error' 
              }),
            });
          }
        }}
      />

      {/* Error Notification Modal */}
      <AlertModal
        isOpen={errorNotification.isOpen}
        onClose={() => setErrorNotification({ isOpen: false, message: '' })}
        title={t('notifications.deleteFileFailed', 'Delete Failed')}
        message={errorNotification.message}
        type="error"
        width={450}
      />
    </div>
  );
};

