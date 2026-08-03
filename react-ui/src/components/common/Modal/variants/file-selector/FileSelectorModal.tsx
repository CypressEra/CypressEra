import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import { ContextMenu, useContextMenu, MenuItem } from '../../../ContextMenu';
import { AlertModal } from '../notification/AlertModal';
import { useDialog, DIALOG_IDS } from '../../../Dialog';
import { DEFAULT_FILE_CATEGORIES, getCategoryByPath } from './fileCategories';
import type { FileCategory } from './fileCategories';
import styles from './FileSelectorModal.module.css';

export interface FileItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  modified?: Date;
  icon?: string;
}

export interface FileSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onSelect?: (file: FileItem) => void;
  onSelectMultiple?: (files: FileItem[]) => void;
  onDelete?: (file: FileItem) => Promise<void> | void;
  /** View a file's contents in the FileViewer. Shown in the right-click menu
   *  for sub/mon/con and knowledge files. No-op for model files / folders. */
  onView?: (file: FileItem) => void;
  /** Download a file to the user's machine. Shown in the right-click menu for
   *  every file that resolves to a known category (model/knowledge/sub/mon/con/diagram). */
  onDownload?: (file: FileItem) => Promise<void> | void;
  initialPath?: string;
  allowMultiple?: boolean;
  fileFilter?: (file: FileItem) => boolean;
  // File system provider - allows different backends
  getFiles?: (path: string) => Promise<FileItem[]> | FileItem[];
  // Default file system (mock for now, can be replaced with real API)
  defaultFiles?: FileItem[];
  // Refresh callback - called when files need to be refreshed
  onRefresh?: () => void | Promise<void>;
  width?: number | string;
  height?: number | string;
  mode?: 'open' | 'save'; // 'open' for opening files, 'save' for save as
  defaultFileName?: string; // Default file name for save mode
  // Library categories shown in the sidebar. Defaults to Models + Knowledge.
  categories?: FileCategory[];
  // When provided, shows an Upload button that uploads into the active category.
  onUpload?: (file: File, category: FileCategory) => Promise<void> | void;
}

export const FileSelectorModal: React.FC<FileSelectorModalProps> = ({
  isOpen,
  onClose,
  title,
  onSelect,
  onSelectMultiple,
  onDelete,
  onView,
  onDownload,
  initialPath = '/',
  allowMultiple = false,
  fileFilter,
  getFiles,
  defaultFiles = [],
  onRefresh,
  width = 700,
  height = 500,
  mode = 'open',
  defaultFileName,
  categories = DEFAULT_FILE_CATEGORIES,
  onUpload,
}) => {
  const { t } = useTranslation();
  const modalTitle = title || t('fileSelector.title');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [fileNameInput, setFileNameInput] = useState<string>(''); // Input box value
  const fileNameInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  // Name of a just-uploaded file awaiting auto-selection after the list reloads
  const pendingUploadNameRef = useRef<string | null>(null);
  // Set when the modal opens — selects the first file once the list has loaded
  const selectFirstOnLoadRef = useRef(false);
  const { openDialog } = useDialog();
  
  // Context menu for file operations
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
    items: [],
  });

  // Path navigation
  const pathParts = useMemo(() => {
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  // Load files for current path
  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      let fileList: FileItem[] = [];
      
      if (getFiles) {
        try {
          const result = await getFiles(path);
          fileList = Array.isArray(result) ? result : [];
        } catch (error) {
          console.error('Error in getFiles function:', error);
          fileList = [];
        }
      } else if (defaultFiles && defaultFiles.length > 0) {
        // Default mock file system
        const normalizedPath = path === '/' ? '/' : path.endsWith('/') ? path.slice(0, -1) : path;
        const pathDepth = normalizedPath === '/' ? 0 : normalizedPath.split('/').filter(Boolean).length;
        
        fileList = defaultFiles.filter(file => {
          const filePath = file.path.startsWith('/') ? file.path : `/${file.path}`;
          
          if (normalizedPath === '/') {
            // Root level: show only category folders
            return categories.some(cat => cat.rootPath === filePath);
          }
          
          // Check if file belongs to current path
          if (!filePath.startsWith(normalizedPath)) {
            return false;
          }
          
          // Check if it's a direct child (one level deeper)
          const fileDepth = filePath.split('/').filter(Boolean).length;
          return fileDepth === pathDepth + 1;
        });
      }

      // Apply filter if provided
      if (fileFilter) {
        fileList = fileList.filter(fileFilter);
      }

      // Sort: folders first, then files, both alphabetically
      // At root level, order category folders by their declared order
      fileList.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        if (path === '/' && a.type === 'folder' && b.type === 'folder') {
          const ai = categories.findIndex(cat => cat.rootPath === a.path);
          const bi = categories.findIndex(cat => cat.rootPath === b.path);
          if (ai !== -1 && bi !== -1) return ai - bi;
        }
        return a.name.localeCompare(b.name);
      });

      setFiles(fileList);
    } catch (error) {
      console.error('Error loading files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [getFiles, defaultFiles, fileFilter, categories]);

  // Load files when path changes
  React.useEffect(() => {
    if (isOpen) {
      loadFiles(currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, isOpen]);

  // Reset when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath);
      setHistory([initialPath]);
      setHistoryIndex(0);
      setSelectedFiles(new Set());
      // In open mode, pre-select the first file once the list loads
      selectFirstOnLoadRef.current = mode === 'open';
      // Set default file name if provided (for save mode)
      if (mode === 'save' && defaultFileName) {
        setFileNameInput(defaultFileName);
      } else {
        setFileNameInput(''); // Reset input when modal opens
      }
    }
  }, [isOpen, initialPath, mode, defaultFileName]); // Only depend on isOpen to avoid resetting on initialPath changes

  // Once the list (re)loads, auto-select a file so it can be confirmed straight
  // away (e.g. with the Enter key): a freshly uploaded file when there is one,
  // otherwise the first file in the list when the modal has just opened.
  useEffect(() => {
    const reveal = (file: FileItem) => {
      setSelectedFiles(new Set([file.path]));
      requestAnimationFrame(() => {
        fileListRef.current
          ?.querySelector<HTMLElement>(`[data-file-path="${CSS.escape(file.path)}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
    };

    // A just-uploaded file takes priority over the open-time selection.
    const uploadedName = pendingUploadNameRef.current;
    if (uploadedName) {
      const uploaded = files.find((file) => file.type === 'file' && file.name === uploadedName);
      if (!uploaded) return;
      pendingUploadNameRef.current = null;
      selectFirstOnLoadRef.current = false;
      reveal(uploaded);
      return;
    }

    // When the modal has just opened, select the first file — but only once
    // the list has actually loaded, so we skip the initial empty render that
    // happens before the async file fetch resolves.
    if (selectFirstOnLoadRef.current) {
      const firstFile = files.find((file) => file.type === 'file');
      if (!firstFile) return;
      selectFirstOnLoadRef.current = false;
      reveal(firstFile);
    }
  }, [files]);

  // Update input box when a file is selected (only if input is empty or in open mode)
  useEffect(() => {
    if (selectedFiles.size > 0) {
      const selected = files.find(file => selectedFiles.has(file.path));
      if (selected && selected.type === 'file') {
        // In save mode, only update if input is empty (don't overwrite defaultFileName)
        if (mode === 'save' && !fileNameInput) {
          setFileNameInput(selected.name);
        } else if (mode === 'open') {
          setFileNameInput(selected.name);
        }
      }
    }
  }, [selectedFiles, files, mode, fileNameInput]);

  // Focus input when entering save mode
  useEffect(() => {
    if (isOpen && mode === 'save' && fileNameInputRef.current) {
      setTimeout(() => {
        fileNameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, mode]);

  // Navigate to folder
  const navigateToFolder = useCallback((folderPath: string) => {
    // Once the user navigates, the open-time first-file selection no longer applies
    selectFirstOnLoadRef.current = false;
    setCurrentPath(folderPath);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(folderPath);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSelectedFiles(new Set());
  }, [history, historyIndex]);

  // Navigate to path part
  const navigateToPath = useCallback((index: number) => {
    const newPath = '/' + pathParts.slice(0, index + 1).join('/');
    navigateToFolder(newPath);
  }, [pathParts, navigateToFolder]);

  // Navigate up
  const navigateUp = useCallback(() => {
    if (pathParts.length > 0) {
      const newPath = '/' + pathParts.slice(0, -1).join('/');
      navigateToFolder(newPath);
    }
  }, [pathParts, navigateToFolder]);

  // Navigate back
  const navigateBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
      setSelectedFiles(new Set());
    }
  }, [history, historyIndex]);

  // Navigate forward
  const navigateForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
      setSelectedFiles(new Set());
    }
  }, [history, historyIndex]);

  // Handle file/folder click
  const handleItemClick = useCallback((file: FileItem) => {
    if (file.type === 'folder') {
      navigateToFolder(file.path);
    } else {
      if (allowMultiple) {
        const newSelected = new Set(selectedFiles);
        if (newSelected.has(file.path)) {
          newSelected.delete(file.path);
        } else {
          newSelected.add(file.path);
        }
        setSelectedFiles(newSelected);
      } else {
        setSelectedFiles(new Set([file.path]));
      }
    }
  }, [allowMultiple, selectedFiles, navigateToFolder]);

  // Handle double click
  const handleItemDoubleClick = useCallback((file: FileItem) => {
    if (file.type === 'folder') {
      navigateToFolder(file.path);
    } else if (!allowMultiple && onSelect) {
      onSelect(file);
      onClose();
    }
  }, [allowMultiple, navigateToFolder, onSelect, onClose]);

  // Handle select (open mode)
  const handleSelect = useCallback(() => {
    if (allowMultiple && onSelectMultiple) {
      const selected = files.filter(file => selectedFiles.has(file.path));
      onSelectMultiple(selected);
    } else if (onSelect) {
      const selected = files.find(file => selectedFiles.has(file.path));
      if (selected) {
        onSelect(selected);
      }
    }
    onClose();
  }, [allowMultiple, onSelectMultiple, onSelect, files, selectedFiles, onClose]);

  // Handle save (save mode)
  const handleSave = useCallback(() => {
    if (!onSelect) return;
    
    const fileNameToUse = fileNameInput.trim();
    if (!fileNameToUse) {
      return; // Don't proceed if no file name
    }
    
    // Create a FileItem with the input file name
    const saveFileItem: FileItem = {
      name: fileNameToUse,
      type: 'file',
      path: `${currentPath}/${fileNameToUse}`.replace(/\/+/g, '/'), // Clean up path
    };
    
    onSelect(saveFileItem);
    onClose();
  }, [onSelect, fileNameInput, currentPath, onClose]);

  // Handle confirm button (wrapper for handleSelect or handleSave)
  const handleConfirm = useCallback(() => {
    if (mode === 'save') {
      handleSave();
    } else {
      handleSelect();
    }
  }, [mode, handleSave, handleSelect]);

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Get file icon
  const getFileIcon = (file: FileItem): React.ReactNode => {
    const icon = file.icon || (file.type === 'folder' ? '📁' : (() => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const iconMap: Record<string, string> = {
        'pdf': '📄',
        'doc': '📝', 'docx': '📝',
        'xls': '▦', 'xlsx': '▦',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'mp4': '🎬', 'mov': '🎬', 'avi': '🎬',
        'mp3': '🎵', 'wav': '🎵',
        'zip': '📦', 'rar': '📦',
        'rawx': '⚡',
      };
      return iconMap[ext || ''] || '📄';
    })());
    if (typeof icon === 'string' && icon.startsWith('/') && icon.endsWith('.png')) {
      return <img src={icon} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />;
    }
    return icon;
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;
  const canGoUp = pathParts.length > 0;
  const hasSelection = selectedFiles.size > 0;
  const canConfirm = mode === 'save' 
    ? fileNameInput.trim().length > 0 
    : hasSelection && (onSelect || onSelectMultiple);

  // Handle file context menu (right-click)
  const handleFileContextMenu = useCallback((e: React.MouseEvent, file: FileItem) => {
    // Don't show context menu for folders
    if (file.type === 'folder') return;

    // Resolve the file's category — drives which actions are offered.
    const category = getCategoryByPath(file.path);
    const canView =
      !!onView &&
      (category?.id === 'sub' ||
        category?.id === 'mon' ||
        category?.id === 'con' ||
        category?.id === 'knowledge');
    // Download is offered for every file that resolves to a known category.
    const canDownload = !!onDownload && !!category;

    // No actions to offer — skip the menu entirely.
    if (!canView && !canDownload && !onDelete) return;

    e.preventDefault();
    e.stopPropagation();

    const menuItems: MenuItem[] = [];

    if (canView) {
      menuItems.push({
        id: 'view',
        label: t('contextMenu.view', 'View'),
        action: () => {
          hideContextMenu();
          onView!(file);
        },
        data: { file },
      });
    }

    if (canDownload) {
      menuItems.push({
        id: 'download',
        label: t('contextMenu.download', 'Download'),
        action: async () => {
          hideContextMenu();
          await onDownload!(file);
        },
        data: { file },
      });
    }

    if (onDelete) {
      menuItems.push({
        id: 'delete',
        label: t('contextMenu.delete'),
        action: async () => {
          hideContextMenu();
          // Show confirmation dialog
          openDialog(DIALOG_IDS.ALERT, AlertModal, {
            title: t('fileSelector.deleteFile'),
            message: t('fileSelector.deleteConfirmation', { fileName: file.name }),
            type: 'warning',
            confirmMode: true,
            confirmText: t('contextMenu.delete'),
            cancelText: t('fileSelector.cancel'),
            onConfirm: async () => {
              try {
                await onDelete(file);
                // Refresh file lists if callback provided
                if (onRefresh) {
                  await onRefresh();
                }
                // Reload files after deletion
                loadFiles(currentPath);
              } catch (error: any) {
                openDialog(DIALOG_IDS.ALERT, AlertModal, {
                  title: t('fileSelector.deleteFailed'),
                  message: error?.message || t('fileSelector.deleteFailedMessage'),
                  type: 'error',
                });
              }
            },
          });
        },
        data: { file },
      });
    }

    showContextMenu(e, menuItems);
  }, [onView, onDownload, onDelete, hideContextMenu, showContextMenu, openDialog, currentPath, loadFiles, onRefresh, t]);

  // Category that owns the current path — drives the Upload button's target
  const currentCategory = useMemo(() => getCategoryByPath(currentPath), [currentPath]);

  // Trigger the hidden file input for upload
  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  // Upload the chosen file into the active category, then refresh the list
  const handleUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !onUpload || !currentCategory) return;
    try {
      await onUpload(file, currentCategory);
      // Mark this file so the reload effect can auto-select it
      pendingUploadNameRef.current = file.name;
      if (onRefresh) {
        await onRefresh();
      }
      await loadFiles(currentPath);
    } catch (error: any) {
      pendingUploadNameRef.current = null;
      openDialog(DIALOG_IDS.ALERT, AlertModal, {
        title: t('fileSelector.uploadFailed', { defaultValue: 'Upload Failed' }),
        message: error?.message || t('fileSelector.uploadFailedMessage', { defaultValue: 'Failed to upload file.' }),
        type: 'error',
      });
    }
  }, [onUpload, currentCategory, onRefresh, loadFiles, currentPath, openDialog, t]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      width={width}
      height={height}
      modal={true}
      resizable={true}
      onEnterKey={canConfirm ? handleConfirm : undefined}
      footer={
        <div className={styles.footer}>
          {mode === 'save' && (
            <div className={styles.fileNameInputWrapper}>
              <label htmlFor="fileNameInput" className={styles.fileNameLabel}>
                {t('fileSelector.fileName', { defaultValue: 'File Name' })}
              </label>
              <input
                ref={fileNameInputRef}
                id="fileNameInput"
                type="text"
                value={fileNameInput}
                onChange={(e) => setFileNameInput(e.target.value)}
                className={styles.fileNameInput}
                placeholder={t('fileSelector.fileNamePlaceholder', { defaultValue: 'Enter file name...' })}
              />
            </div>
          )}
          <div className={styles.footerButtons}>
            <Button
              variant="secondary"
              size="small"
              onClick={onClose}
            >
              {t('fileSelector.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {mode === 'save'
                ? t('fileSelector.save', { defaultValue: 'Save' })
                : allowMultiple
                  ? t('fileSelector.selectMultiple', { count: selectedFiles.size })
                  : t('fileSelector.select')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.fileSelector}>
        <div className={styles.contentWrapper}>
          {/* Sidebar - macOS Finder style */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarSection}>
              <div className={styles.sidebarTitle}>{t('fileSelector.cloudDrive')}</div>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`${styles.sidebarItem} ${currentPath === cat.rootPath ? styles.sidebarItemActive : ''}`}
                  onClick={() => navigateToFolder(cat.rootPath)}
                >
                  <span className={styles.sidebarIcon}>
                    <img src={cat.icon} alt={cat.id} style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                  </span>
                  <span className={styles.sidebarLabel}>{t(cat.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content Area */}
          <div className={styles.mainContent}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.navigationButtons}>
                <button
                  className={styles.navButton}
                  onClick={navigateBack}
                  disabled={!canGoBack}
                        title={t('fileSelector.back')}
                >
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M10 12 L6 8 L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </button>
                <button
                  className={styles.navButton}
                  onClick={navigateForward}
                  disabled={!canGoForward}
                        title={t('fileSelector.forward')}
                >
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M6 12 L10 8 L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </button>
                <button
                  className={styles.navButton}
                  onClick={navigateUp}
                  disabled={!canGoUp}
                        title={t('fileSelector.up')}
                >
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M8 12 L8 4 M4 8 L8 4 L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </button>
              </div>
              
              {/* Breadcrumb */}
              <div className={styles.breadcrumb}>
                <button
                  className={styles.breadcrumbItem}
                  onClick={() => navigateToFolder('/')}
                        title={t('fileSelector.home')}
                >
                  <svg className={styles.breadcrumbIcon} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 2L2 7V14H6V10H10V14H14V7L8 2Z" fill="currentColor" stroke="currentColor" strokeWidth="0.5"/>
                  </svg>
                </button>
                {pathParts.map((part, index) => (
                  <React.Fragment key={index}>
                    <span className={styles.breadcrumbSeparator}>/</span>
                    <button
                      className={styles.breadcrumbItem}
                      onClick={() => navigateToPath(index)}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Upload - uploads into the active category */}
              {onUpload && (
                <>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept={currentCategory?.extensions.join(',') || undefined}
                    style={{ display: 'none' }}
                    onChange={handleUploadChange}
                  />
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleUploadClick}
                    disabled={!currentCategory}
                    title={t('fileSelector.upload', { defaultValue: 'Upload' })}
                  >
                    {t('fileSelector.upload', { defaultValue: 'Upload' })}
                  </Button>
                </>
              )}
            </div>

            {/* File List */}
            <div className={styles.fileList} ref={fileListRef}>
          {loading ? (
            <div className={styles.loading}>{t('fileSelector.loading')}</div>
          ) : files.length === 0 ? (
            <div className={styles.empty}>{t('fileSelector.empty')}</div>
          ) : (
            files.map((file) => {
              const isSelected = selectedFiles.has(file.path);
              return (
                <div
                  key={file.path}
                  data-file-path={file.path}
                  className={`${styles.fileItem} ${isSelected ? styles.selected : ''}`}
                  onClick={() => handleItemClick(file)}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div className={styles.fileIcon}>
                    {getFileIcon(file)}
                  </div>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName}>{file.name}</div>
                    {file.type === 'file' && (
                      <div className={styles.fileMeta}>
                        {formatFileSize(file.size)}
                        {file.modified && (
                          <span className={styles.fileDate}>
                            {file.modified.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
            </div>
          </div>
        </div>
        
        {/* Context Menu - rendered via portal for proper positioning */}
        {contextMenu.isOpen && contextMenu.position && createPortal(
          <ContextMenu
            items={contextMenu.items}
            position={contextMenu.position}
            onClose={hideContextMenu}
          />,
          document.body
        )}
      </div>
    </BaseModal>
  );
};

