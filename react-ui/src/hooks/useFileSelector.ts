import { useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialog, DIALOG_IDS, FileSelectorModal, FILE_CATEGORIES, getCategoryByPath, matchesCategory } from '../components/common';
import type { FileItem, FileCategory, UserFileType } from '../components/common';
import { FileViewer } from '../components/features';

export interface UseFileSelectorOptions {
  modelFiles?: string[];
  knowledgeFiles?: string[];
  /** Subsystem (.sub) library files — surfaced in the Subsystem category. */
  subFiles?: string[];
  /** Monitor (.mon) library files. */
  monFiles?: string[];
  /** Contingency (.con) library files. */
  conFiles?: string[];
  /** Diagram (.cyd / .cyd.gz) library files — surfaced in the Diagram category. */
  diagramFiles?: string[];
  onFileSelect: (fileName: string, filePath?: string, mode?: 'open' | 'save') => Promise<void>;
  /** Load a .sub/.mon/.con file into the active session. Called instead of
   *  `onFileSelect` when the picker resolves a study-file selection. */
  onLoadStudyFile?: (fileType: 'sub' | 'mon' | 'con', fileName: string) => void | Promise<void>;
  /** Apply a diagram (.cyd / .cyd.gz) layout to the active network diagram.
   *  Called instead of `onFileSelect` when the picker resolves a diagram
   *  selection (open mode). For save mode, diagram selections route through
   *  `onFileSelect` as usual so the App can branch on the file path. */
  onOpenDiagram?: (fileName: string) => void | Promise<void>;
  onDelete?: (fileName: string, filePath?: string) => Promise<void>;
  /** Download a file from the user's library. Receives the file name and the
   *  resolved category id (model/knowledge/sub/mon/con/diagram). */
  onDownload?: (fileName: string, fileType: UserFileType) => Promise<void> | void;
  onUpload?: (file: File, category: FileCategory) => Promise<void> | void;
  onRefresh?: () => void | Promise<void>;
  onError?: (error: Error) => void;
  onSuccess?: (fileName: string) => void;
  defaultFileName?: string; // Default file name for save mode
}

/**
 * Hook to open file selector dialog with user's files
 * Encapsulates the file selector logic to keep components clean
 * 
 * @example
 * ```tsx
 * const { openFileSelector } = useFileSelector({
 *   modelFiles: ['file1.rawx', 'file2.rawx'],
 *   knowledgeFiles: ['doc1.pdf'],
 *   onFileSelect: async (fileName, filePath) => {
 *     // Handle file selection
 *   },
 * });
 * ```
 */
export const useFileSelector = (options: UseFileSelectorOptions) => {
  const { openDialog } = useDialog();
  const { t } = useTranslation();
  const {
    modelFiles = [],
    knowledgeFiles = [],
    subFiles = [],
    monFiles = [],
    conFiles = [],
    diagramFiles = [],
    onFileSelect,
    onLoadStudyFile,
    onOpenDiagram,
    onDelete,
    onDownload,
    onUpload,
    onRefresh,
    onError,
    onSuccess,
    defaultFileName,
  } = options;

  // Use refs to always get the latest file lists
  const modelFilesRef = useRef(modelFiles);
  const knowledgeFilesRef = useRef(knowledgeFiles);
  const subFilesRef = useRef(subFiles);
  const monFilesRef = useRef(monFiles);
  const conFilesRef = useRef(conFiles);
  const diagramFilesRef = useRef(diagramFiles);

  // Update refs when files change
  useEffect(() => {
    modelFilesRef.current = modelFiles;
  }, [modelFiles]);

  useEffect(() => {
    knowledgeFilesRef.current = knowledgeFiles;
  }, [knowledgeFiles]);

  useEffect(() => {
    subFilesRef.current = subFiles;
  }, [subFiles]);

  useEffect(() => {
    monFilesRef.current = monFiles;
  }, [monFiles]);

  useEffect(() => {
    conFilesRef.current = conFiles;
  }, [conFiles]);

  useEffect(() => {
    diagramFilesRef.current = diagramFiles;
  }, [diagramFiles]);

  const openFileSelector = useCallback((selectorMode?: 'open' | 'save', fileName?: string, initialPath?: string) => {
    const currentMode = selectorMode || 'open';
    const currentFileName = fileName || defaultFileName;
    const currentInitialPath = initialPath || '/Model';
    // Custom file system provider - reads from refs to get latest files.
    // Built from the shared category descriptors (Models, Knowledge, sub/mon/con).
    const getFiles = async (path: string): Promise<FileItem[]> => {
      try {
        const filesByCategory: Record<string, string[]> = {
          model: modelFilesRef.current,
          knowledge: knowledgeFilesRef.current,
          sub: subFilesRef.current,
          mon: monFilesRef.current,
          con: conFilesRef.current,
          diagram: diagramFilesRef.current,
        };

        const fileItems: FileItem[] = [];
        FILE_CATEGORIES.forEach(cat => {
          fileItems.push({ name: t(cat.labelKey), type: 'folder', path: cat.rootPath, icon: cat.icon });
          (filesByCategory[cat.id] || []).forEach(fileName => {
            fileItems.push({
              name: fileName,
              type: 'file',
              path: `${cat.rootPath}/${fileName}`,
              icon: cat.fileIcon,
            });
          });
        });

        const normalizedPath = path === '/' ? '/' : path.endsWith('/') ? path.slice(0, -1) : path;
        const pathDepth = normalizedPath === '/' ? 0 : normalizedPath.split('/').filter(Boolean).length;

        const filtered = fileItems.filter(file => {
          const filePath = file.path.startsWith('/') ? file.path : `/${file.path}`;

          if (normalizedPath === '/') {
            return FILE_CATEGORIES.some(cat => cat.rootPath === filePath);
          }

          if (!filePath.startsWith(normalizedPath)) {
            return false;
          }

          const fileDepth = filePath.split('/').filter(Boolean).length;
          return fileDepth === pathDepth + 1;
        });

        // Sort: folders first, then files; category folders keep their declared order
        return filtered.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          if (normalizedPath === '/' && a.type === 'folder' && b.type === 'folder') {
            const ai = FILE_CATEGORIES.findIndex(c => c.rootPath === a.path);
            const bi = FILE_CATEGORIES.findIndex(c => c.rootPath === b.path);
            if (ai !== -1 && bi !== -1) return ai - bi;
          }
          return a.name.localeCompare(b.name);
        });
      } catch (error) {
        console.error('Error in getFiles:', error);
        return [];
      }
    };

    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: currentMode === 'save' ? t('fileSelector.saveAsTitle', { defaultValue: 'Save As' }) : t('fileSelector.title'),
      initialPath: currentInitialPath,
      mode: currentMode, // Pass mode to FileSelectorModal
      defaultFileName: currentMode === 'save' ? currentFileName : undefined, // Pass default file name for save mode
      categories: FILE_CATEGORIES,
      getFiles: getFiles,
      fileFilter: (file) => {
        // Show files whose extension matches their category (any for Knowledge)
        if (file.type === 'folder') return true;
        const category = getCategoryByPath(file.path);
        return category ? matchesCategory(file.name, category) : true;
      },
      onSelect: async (file: FileItem) => {
        try {
          const category = getCategoryByPath(file.path);
          // Study files (.sub/.mon/.con) load into the active session via the
          // same handler the Project Explorer uses. The handler itself enforces
          // the "model must be loaded first" guard.
          if (
            currentMode === 'open' &&
            category &&
            (category.id === 'sub' || category.id === 'mon' || category.id === 'con')
          ) {
            if (onLoadStudyFile) {
              await onLoadStudyFile(category.id, file.name);
            }
            onSuccess?.(file.name);
            return;
          }
          // Open a diagram → apply its layout to the active canvas.
          if (currentMode === 'open' && category && category.id === 'diagram') {
            if (onOpenDiagram) {
              await onOpenDiagram(file.name);
            }
            onSuccess?.(file.name);
            return;
          }
          // Pass mode to onFileSelect callback for model/knowledge files,
          // and for SAVE mode in any category (App routes by file path).
          await onFileSelect(file.name, file.path, currentMode);
          onSuccess?.(file.name);
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(err?.message || 'Failed to open file');
          onError?.(error);
          throw error;
        }
      },
      onView: (file: FileItem) => {
        const category = getCategoryByPath(file.path);
        if (!category || category.id === 'model') return;
        openDialog(DIALOG_IDS.FILE_VIEWER, FileViewer, {
          fileName: file.name,
          fileType: category.id,
        });
      },
      onDelete: onDelete ? async (file: FileItem) => {
        try {
          await onDelete(file.name, file.path);
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(err?.message || 'Failed to delete file');
          onError?.(error);
          throw error;
        }
      } : undefined,
      onDownload: onDownload ? async (file: FileItem) => {
        const category = getCategoryByPath(file.path);
        if (!category) return;
        try {
          await onDownload(file.name, category.id);
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(err?.message || 'Failed to download file');
          onError?.(error);
          throw error;
        }
      } : undefined,
      onRefresh: onRefresh,
      onUpload: onUpload,
    });
  }, [t, openDialog, modelFiles, knowledgeFiles, subFiles, monFiles, conFiles, diagramFiles, onFileSelect, onLoadStudyFile, onOpenDiagram, onDelete, onDownload, onUpload, onRefresh, onError, onSuccess, defaultFileName]);

  return { openFileSelector };
};

