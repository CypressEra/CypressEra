import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { MenuBar, DialogManager, useDialog, DIALOG_IDS, MobileOrientationPrompt, getCategoryByPath } from './components/common';
import { AlertModal } from './components/common/Modal/variants/notification/AlertModal';
import { GridLayout } from './components/layout';
import { ThemeProvider, LanguageProvider } from './components/ui';
import { FileViewer, ACPowerFlowSettings, RunAnalysisModal } from './components/features';
import { StudyResultModal } from './components/features/StudyResults';
import { PowerFlowApp } from './sdk';
import { SolverSettingsProvider, useSolverSettings } from './contexts/SolverSettingsContext';
import { VerifyEmailPage } from './components/features/VerifyEmailPage';
import { GoogleCallbackPage } from './components/features/GoogleCallback/GoogleCallbackPage';
import { usePowerFlowSDK } from './hooks/usePowerFlowSDK';
import { useNotification, useFileSelector, useInvalidationEvent } from './hooks';
import { useSessionSubscription, useStaleOnConnect } from './contexts/WebSocketContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';

// Study-case file types (.sub/.mon/.con) — the analysis-input libraries
const STUDY_FILE_TYPES = ['sub', 'mon', 'con'] as const;
type StudyFileType = (typeof STUDY_FILE_TYPES)[number];

// Max upload size for case/study files. Used by every client-side upload path
// so they warn consistently before hitting the server. Keep in sync with the
// notifications.fileTooLarge copy and the server's storage.max_file_size.
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MB

function AppContent() {
  const { accessToken, requireAuth, isAuthenticated } = useAuth();
  const { acSettings } = useSolverSettings();
  const [method, setMethod] = useState<'dc' | 'fnsl' >('fnsl');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // Study-case files (.sub/.mon/.con) currently loaded into the session
  const [loadedStudyFiles, setLoadedStudyFiles] = useState<Record<StudyFileType, string | null>>(
    { sub: null, mon: null, con: null },
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputTriggers, setFileInputTriggers] = useState<{ triggerModels: () => void; triggerKnowledge: () => void } | null>(null);

  // Undo/Redo handlers (exposed from NetworkDataTable)
  const undoRedoHandlersRef = useRef<{ undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Reset layout function (exposed from GridLayout)
  const resetLayoutRef = useRef<(() => void) | null>(null);

  // Setter that switches the network panel between 'diagram' and 'table'.
  // Used by Open → Diagram to auto-flip to diagram view.
  const setNetworkViewRef = useRef<((view: 'diagram' | 'table') => void) | null>(null);

  // Diagram ref (exposed from NetworkView once the canvas mounts) — drives the
  // menu-bar Save / Save As / Open Diagram actions.
  const diagramRefRef = useRef<import('./components/features/NetworkDiagram').NetworkDiagramRef | null>(null);
  // Filename of the diagram currently loaded into the canvas. null = "no
  // diagram opened or saved yet"; in that case Save → Diagram falls back to
  // Save As → Diagram (prompt for a name).
  const [currentDiagramFile, setCurrentDiagramFile] = useState<string | null>(null);
  // Live count of elements on the canvas. Drives the menu bar's disabled
  // state on Save → Diagram and Save As → Diagram. NetworkDiagram reports
  // every change via the NetworkView → GridLayout → here callback chain.
  const [diagramElementCount, setDiagramElementCount] = useState(0);

  // Ref to store latest handleMenuClick for keyboard shortcuts
  const handleMenuClickRef = useRef<((menu: string, action: string) => Promise<void>) | null>(null);
  // Forward declaration for handleLoadStudyFile (defined later) so the
  // file-selector hook can route study selections without a hoisting hack.
  const handleLoadStudyFileRef = useRef<
    ((fileType: 'sub' | 'mon' | 'con', fileName: string) => Promise<void>) | null
  >(null);

  const { t } = useTranslation();

  // Use dialog hook for FileViewer
  const { openDialog } = useDialog();

  // Use notification hook
  const { showNotification } = useNotification();

  // Use SDK hook - now includes modelFiles, knowledgeFiles, and handleToolResults
  const {
    initialized,
    connected,
    loading,
    isSolving,
    sessionId,
    currentFile,
    networkData,
    powerFlowData,
    calculationResult,
    sessionInfo,
    modelFiles,
    knowledgeFiles,
    subFiles,
    monFiles,
    conFiles,
    diagramFiles,
    createSessionFromFile,
    uploadUserFile,
    deleteUserFile,
    getNetwork,
    solveFlow,
    getPowerFlowData,
    seenSolveRequestIds,
    saveSessionToUserFile,
    checkHealth,
    clearError,
    resetSession,
    sdk,
    loadModelFileList,
    loadKnowledgeFileList,
    loadDiagramFileList,
    loadStudyFile,
    loadStudyFileList,
    getSessionInfo,
    handleToolResults,
  } = usePowerFlowSDK({
    apiBaseURL: window.API_BASE_URL || 'http://localhost:8080',
    accessToken,
    autoInitialize: true
  });

  // Network-data loading state: true while a model/session is being opened (file
  // open or upload) until its network data arrives. Drives the loading overlay on
  // the network view so large models don't look frozen during the fetch. Kept
  // distinct from the SDK's generic `loading` (which also covers init/solve/edit,
  // and would otherwise flash the overlay on startup).
  const [isNetworkLoading, setIsNetworkLoading] = useState(false);
  // Clear once the network data lands (success) or the SDK load settles (failure).
  useEffect(() => {
    if (networkData) setIsNetworkLoading(false);
  }, [networkData]);
  useEffect(() => {
    if (!loading) setIsNetworkLoading(false);
  }, [loading]);

  // Agent server base URL (injected by server or default)
  const aiBaseURL = (window as any).AGENT_BASE_URL || 'http://localhost:3001';

  // Study-result history — durable analysis records shown in the Project
  // Explorer. Loaded once the SDK is ready, and refreshed after a run
  // completes or a result is deleted so the explorer stays current.
  const [studyResults, setStudyResults] = useState<any[]>([]);
  const fetchStudyResults = useCallback(async () => {
    try {
      const res: any = await PowerFlowApp.listStudyResults();
      setStudyResults(res?.results || []);
    } catch (err) {
      console.error('[App] Failed to load study results:', err);
    }
  }, []);
  useEffect(() => {
    if (!initialized || !isAuthenticated || !accessToken) return;
    // Defer slightly to allow AuthProvider -> PowerFlowApp.updateConfig to apply the token,
    // mirroring the post-login file-list refresh effect below.
    const timer = setTimeout(() => { fetchStudyResults(); }, 200);
    return () => clearTimeout(timer);
  }, [initialized, isAuthenticated, accessToken, fetchStudyResults]);
  const handleStudyResultClick = useCallback(
    (resultId: string) => {
      openDialog(DIALOG_IDS.STUDY_RESULT, StudyResultModal, { resultId });
    },
    [openDialog],
  );

  // Listen to sessionInfo changes to update selectedFile when file name changes
  // This ensures state updates work whether called from UI or MCP (scalable approach)
  // The hook's handleSessionChanged already updates sessionInfo via getSessionInfo()
  useEffect(() => {
    if (sessionInfo?.model_file) {
      // model_file is already a basename; update selectedFile directly.
      // This works for both save-as (new file) and regular file opens
      setSelectedFile(sessionInfo.model_file);
    }
  }, [sessionInfo?.model_file]); // Only update when the model file changes

  // A new session (a freshly loaded study model) discards any .sub/.mon/.con
  // that were loaded into the previous session, so clear their highlights.
  useEffect(() => {
    setLoadedStudyFiles({ sub: null, mon: null, con: null });
  }, [sessionId]);

  // Subscribe to the active session's WebSocket topics so invalidation events
  // (study_files / analysis / network / powerflow / status) reach the UI.
  useSessionSubscription(sessionId);

  // Keep loadedStudyFiles in sync with the server-side session metadata.
  // This lets us drive the slot view from a single source of truth — refetch
  // sessionInfo on a study_files:updated event and the slots fall in line.
  useEffect(() => {
    const info: any = sessionInfo;
    if (!info) return;
    setLoadedStudyFiles({
      sub: info.sub_file || null,
      mon: info.mon_file || null,
      con: info.con_file || null,
    });
  }, [sessionInfo]);

  // Invalidation handlers — server-published events tell us a slice of
  // session/user state changed; we refetch via the existing REST endpoints
  // and the rest of the UI re-renders off the refreshed state.

  const handleStudyFilesUpdated = useCallback(() => {
    // sessionInfo carries the loaded slot basenames; refetching it cascades
    // to the loadedStudyFiles effect above.
    if (sessionId) {
      getSessionInfo().catch(err =>
        console.error('[App] study_files:updated refetch failed:', err),
      );
    }
  }, [sessionId, getSessionInfo]);
  useInvalidationEvent('study_files:updated', handleStudyFilesUpdated);

  const handleUserFilesUpdated = useCallback((payload: any) => {
    const types: string[] = Array.isArray(payload?.file_types) ? payload.file_types : [];
    // Refetch only the affected lists. Falls back to refetching all study-file
    // lists if no file_types were supplied (defensive).
    const refresh = (kind: string) => {
      switch (kind) {
        case 'model':
          loadModelFileList().catch(() => {});
          break;
        case 'knowledge':
          loadKnowledgeFileList().catch(() => {});
          break;
        case 'diagram':
          loadDiagramFileList().catch(() => {});
          break;
        case 'sub':
        case 'mon':
        case 'con':
          loadStudyFileList(kind as StudyFileType).catch(() => {});
          break;
      }
    };
    if (types.length === 0) {
      STUDY_FILE_TYPES.forEach(refresh);
      loadDiagramFileList().catch(() => {});
    } else {
      types.forEach(refresh);
    }
  }, [loadModelFileList, loadKnowledgeFileList, loadDiagramFileList, loadStudyFileList]);
  useInvalidationEvent('user_files:updated', handleUserFilesUpdated);

  const handleAnalysisStateChanged = useCallback(() => {
    // A new analysis started, finished, or got cancelled — refresh the
    // durable study-result list so the project explorer reflects it.
    fetchStudyResults();
  }, [fetchStudyResults]);
  useInvalidationEvent('analysis:started', handleAnalysisStateChanged);
  useInvalidationEvent('analysis:completed', handleAnalysisStateChanged);
  useInvalidationEvent('analysis:failed', handleAnalysisStateChanged);
  useInvalidationEvent('analysis:cancelled', handleAnalysisStateChanged);

  // A power flow finished on this session — refetch the results so the network
  // view reflects the warm-started control state (taps, shunt binit, DC taps,
  // bus V). This covers solves triggered by the agent (the UI's own solve also
  // refetches via the SDK SOLVE_FLOW_COMPLETE path).
  const handlePowerFlowCompleted = useCallback(() => {
    getPowerFlowData().catch(err =>
      console.error('[App] powerflow:completed refetch failed:', err),
    );
  }, [getPowerFlowData]);
  // seenSolveRequestIds holds ids of solves this client initiated (already
  // refetched via the SDK), so those events self-skip; agent/other-client
  // solves still refetch. Prevents the duplicate fetch on a UI-initiated solve.
  useInvalidationEvent('powerflow:completed', handlePowerFlowCompleted, {
    seenRequestIds: seenSolveRequestIds,
  });

  // Stale-on-connect: when the WebSocket reconnects after a drop, refetch
  // everything on the watch list so the UI catches up on any events that
  // fired during the disconnected window.
  const handleStaleOnConnect = useCallback(() => {
    console.log('[App] WS reconnected — refetching state');
    if (sessionId) {
      getSessionInfo().catch(() => {});
    }
    STUDY_FILE_TYPES.forEach((kind) => {
      loadStudyFileList(kind).catch(() => {});
    });
    loadModelFileList().catch(() => {});
    loadKnowledgeFileList().catch(() => {});
    loadDiagramFileList().catch(() => {});
    fetchStudyResults();
  }, [
    sessionId,
    getSessionInfo,
    loadStudyFileList,
    loadModelFileList,
    loadKnowledgeFileList,
    loadDiagramFileList,
    fetchStudyResults,
  ]);
  useStaleOnConnect(handleStaleOnConnect);

  // Disable browser default right-click context menu globally
  // Components that need custom context menus will handle the event in React
  // Allow right-click in AI Assistant chat area and NetworkDiagram canvas
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if the click is within the AI Assistant chat area
      const aiAssistantChat = target.closest('.ai-assistant .chat-container, .ai-assistant .messages-container, .ai-assistant .message-text, .ai-assistant .message-input');
      if (aiAssistantChat) {
        // Allow default context menu in AI Assistant chat
        return;
      }
      // Check if the click is on the NetworkDiagram canvas - allow it through
      const networkDiagramCanvas = target.closest('.network-diagram-canvas');
      if (networkDiagramCanvas) {
        // Don't prevent default - let the canvas handler deal with it
        return;
      }
      // Allow the browser's native menu (Copy, Select All, …) inside the
      // FileViewer's text body so users can copy from .sub/.mon/.con previews.
      const fileViewerText = target.closest('.file-viewer-text');
      if (fileViewerText) {
        return;
      }
      // Prevent default context menu everywhere else
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Check health periodically when SDK is initialized
  useEffect(() => {
    if (initialized) {
      checkHealth();
      const interval = setInterval(checkHealth, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [initialized, checkHealth]);

  // After login, load user and knowledge files once
  useEffect(() => {
    // Only run when SDK is ready and user is authenticated with a token
    if (!initialized || !isAuthenticated || !accessToken) return;

    // Defer slightly to allow AuthProvider -> PowerFlowApp.updateConfig to apply the token
    const timer = setTimeout(() => {
      (async () => {
        try {
          await loadModelFileList();
        } catch (err) {
          console.error('Failed to load model files after login:', err);
        }
        try {
          await loadKnowledgeFileList();
        } catch (err) {
          console.error('Failed to load knowledge files after login:', err);
        }
        try {
          await Promise.all(STUDY_FILE_TYPES.map(loadStudyFileList));
        } catch (err) {
          console.error('Failed to load study files after login:', err);
        }
        try {
          await loadDiagramFileList();
        } catch (err) {
          console.error('Failed to load diagram files after login:', err);
        }
      })();
    }, 200);

    return () => clearTimeout(timer);
  }, [initialized, isAuthenticated, accessToken, loadModelFileList, loadKnowledgeFileList, loadDiagramFileList, loadStudyFileList]);

  // Trigger file input click for models
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Trigger file input click for knowledge base
  const triggerKnowledgeUpload = () => {
    fileInputTriggers?.triggerKnowledge();
  };

  // Handle file selection from input
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ok = await requireAuth({ reason: 'upload-model' });
    if (!ok) return;

    // Validate file type
    if (!file.name.endsWith('.rawx')) {
      showNotification('Unsupported Format', t('notifications.rawxOnly'), 'warning');
      return;
    }

    // Validate file size (max 50 MB)
    if (file.size > MAX_UPLOAD_BYTES) {
      showNotification('File Too Large', t('notifications.fileTooLarge'), 'warning');
      return;
    }

    try {
      clearError();
      
      // Use complete user-centric workflow
      console.log('Uploading file and creating session...');

      // Upload file to user folder (default to 'model' file type)
      const uploadResult = await uploadUserFile(file, 'model');
      console.log('Upload file successful:', uploadResult);

      // Create session from the uploaded file (automatically loads network data)
      setIsNetworkLoading(true);
      const sessionResult = await createSessionFromFile(file.name);
      console.log('Session created:', sessionResult);

      // Reload user files list
      await loadModelFileList();
      
      showNotification('File Loaded Successfully', `File "${file.name}" has been uploaded and session created successfully!`, 'success');
    } catch (err: any) {
      console.error('File upload error:', err);
      showNotification('Upload Failed', `Failed to upload file: ${err.message}`, 'error');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Upload a study file (.sub / .mon / .con) — analysis inputs, no session created
  const studyFileInputRef = useRef<HTMLInputElement>(null);
  const studyUploadTypeRef = useRef<'sub' | 'mon' | 'con'>('sub');

  const triggerStudyFileUpload = (fileType: 'sub' | 'mon' | 'con') => {
    studyUploadTypeRef.current = fileType;
    if (studyFileInputRef.current) {
      studyFileInputRef.current.accept = `.${fileType}`;
    }
    studyFileInputRef.current?.click();
  };

  const handleStudyFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    const fileType = studyUploadTypeRef.current;
    if (!(await requireAuth({ reason: 'upload-model' }))) return;

    const ext = `.${fileType}`;
    if (!file.name.toLowerCase().endsWith(ext)) {
      showNotification('Unsupported Format', `Please select a ${ext} file.`, 'warning');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showNotification('File Too Large', t('notifications.fileTooLarge'), 'warning');
      return;
    }

    try {
      clearError();
      await uploadUserFile(file, fileType);
      showNotification('File Uploaded', `File "${file.name}" has been uploaded successfully!`, 'success');
    } catch (err: any) {
      console.error('Study file upload error:', err);
      showNotification('Upload Failed', `Failed to upload file: ${err.message}`, 'error');
    }
  };

  // Diagram I/O handlers — drive the menu-bar Save / Save As / Open Diagram
  // actions via the diagram ref exposed by NetworkView.

  // Apply a saved diagram (.cyd / .cyd.gz) layout from the user library to the
  // active NetworkDiagram. Downloads via the SDK, calls loadDiagram on the ref,
  // and records the filename so subsequent Save → Diagram overwrites in place.
  const handleOpenDiagram = useCallback(async (fileName: string) => {
    const ref = diagramRefRef.current;
    // Gate canvas paints BEFORE switching the view so the resize-observer
    // cascade that fires when the diagram panel becomes visible can't paint
    // a fit-to-content frame (the "flash") before loadDiagram applies the
    // saved view. The ref releases the gate when loadDiagram resolves (or
    // its 5s safety timeout fires).
    ref?.beginDiagramLoad();
    // Switch the network panel to diagram view BEFORE the bytes arrive so the
    // canvas is mounted and ready by the time loadDiagram applies the layout.
    setNetworkViewRef.current?.('diagram');
    if (!ref) {
      showNotification('Diagram Not Ready', 'The diagram canvas is not mounted yet.', 'warning');
      return;
    }
    try {
      const blob: Blob = await PowerFlowApp.downloadUserFile(fileName, 'diagram');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await ref.loadDiagram(bytes);
      if (!result.ok) {
        showNotification('Failed to Open Diagram', result.errors.map(e => `${e.path}: ${e.message}`).join('\n'), 'error');
        return;
      }
      setCurrentDiagramFile(fileName);
    } catch (err: any) {
      console.error('[App] open diagram failed:', err);
      showNotification('Failed to Open Diagram', err?.message ?? String(err), 'error');
    }
  }, [showNotification]);

  // Serialize the current diagram and upload it to the user's diagram library
  // under `name`. Used by both Save (existing filename) and Save As (new name).
  const uploadDiagramAs = useCallback(async (name: string) => {
    const ref = diagramRefRef.current;
    if (!ref) {
      showNotification('Diagram Not Ready', 'The diagram canvas is not mounted yet.', 'warning');
      return;
    }
    try {
      const result = await ref.saveDiagram({ title: name.replace(/\.cyd(\.gz|\.json)?$/i, '') });
      // Force a stable extension if the user didn't supply one.
      const finalName = /\.(cyd|cyd\.gz|cyd\.json)$/i.test(name) ? name : `${name}.cyd`;
      const file = new File([result.bytes], finalName, { type: 'application/json' });
      await uploadUserFile(file, 'diagram');
      setCurrentDiagramFile(finalName);
      await loadDiagramFileList();
    } catch (err: any) {
      console.error('[App] save diagram failed:', err);
      showNotification('Failed to Save Diagram', err?.message ?? String(err), 'error');
    }
  }, [showNotification, uploadUserFile, loadDiagramFileList]);

  // File selector hook
  const { openFileSelector } = useFileSelector({
    modelFiles,
    knowledgeFiles,
    subFiles,
    monFiles,
    conFiles,
    diagramFiles,
    onLoadStudyFile: (fileType, fileName) =>
      handleLoadStudyFileRef.current?.(fileType, fileName),
    onOpenDiagram: handleOpenDiagram,
    onFileSelect: async (fileName: string, filePath?: string, fileMode?: 'open' | 'save') => {
      clearError();

      const mode = fileMode || 'open';

      // Handle save mode
      if (mode === 'save') {
        // Save → Diagram: detect by selector path and route to the diagram uploader.
        if (filePath && (filePath.startsWith('/Diagram/') || filePath === '/Diagram')) {
          await uploadDiagramAs(fileName);
          return;
        }
        if (sessionId) {
          // Check if file already exists
          const fileExists = modelFiles.includes(fileName);
          
          if (fileExists) {
            // Show confirmation dialog before overwriting
            openDialog(DIALOG_IDS.ALERT, AlertModal, {
              title: t('fileSelector.overwriteTitle', { defaultValue: 'File Already Exists' }),
              message: t('fileSelector.overwriteMessage', { 
                defaultValue: 'A file named "{{fileName}}" already exists. Do you want to overwrite it?',
                fileName: fileName 
              }),
              type: 'warning',
              confirmMode: true,
              confirmText: t('fileSelector.overwrite', { defaultValue: 'Overwrite' }),
              cancelText: t('fileSelector.cancel'),
              onConfirm: async () => {
                try {
                  await sdk.saveSessionAsUserFile(fileName, sessionId);
                  // Note: sessionInfo and selectedFile are updated via SESSION_CHANGED event
                  // Delay notification slightly to ensure confirmation dialog has fully closed
                  setTimeout(() => {
                    showNotification('File Saved As', `File "${fileName}" has been overwritten successfully!`, 'success');
                  }, 200);
                  await loadModelFileList();
                } catch (error: any) {
                  // Delay error notification slightly to ensure confirmation dialog has fully closed
                  setTimeout(() => {
                    showNotification('Save As Failed', error?.message || 'Failed to save file', 'error');
                  }, 200);
                  throw error;
                }
              },
            });
          } else {
            // File doesn't exist, save directly
            try {
              await sdk.saveSessionAsUserFile(fileName, sessionId);
              // Note: sessionInfo and selectedFile are updated via SESSION_CHANGED event
              showNotification('File Saved As', `File saved as "${fileName}" successfully!`, 'success');
              await loadModelFileList();
            } catch (error: any) {
              showNotification('Save As Failed', error?.message || 'Failed to save file', 'error');
              throw error;
            }
          }
        } else {
          showNotification('No Session', 'Please open a file first before saving.', 'warning');
        }
      } else if (mode === 'open') {
        // Check if it's a knowledge file (path starts with /Knowledge/)
        if (filePath?.startsWith('/Knowledge/')) {
          // Open FileViewer for knowledge files via dialog system
          openDialog(DIALOG_IDS.FILE_VIEWER, FileViewer, {
            fileName: fileName,
            fileType: 'knowledge',
          });
        } else {
          // Create session for model files
          setIsNetworkLoading(true);
          await createSessionFromFile(fileName);
        }
      }
    },
    onDownload: async (fileName, fileType) => {
      try {
        const blob: Blob = await PowerFlowApp.downloadUserFile(fileName, fileType);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        showNotification('Download Failed', err?.message ?? `Failed to download ${fileName}`, 'error');
        throw err;
      }
    },
    onDelete: async (fileName: string, filePath?: string) => {
      try {
        // Map the selector path back to the owning file-type. Covers every
        // user-file category (model / knowledge / sub / mon / con / diagram).
        const category = filePath ? getCategoryByPath(filePath) : undefined;
        const fileType = category?.id ?? 'model';
        await deleteUserFile(fileName, fileType);

        // Refresh the category-specific cache so the picker stops showing
        // the deleted file. Diagram has no cache layer outside the picker,
        // so we just refetch its list.
        switch (fileType) {
          case 'model':     await loadModelFileList(); break;
          case 'knowledge': await loadKnowledgeFileList(); break;
          case 'diagram':   await loadDiagramFileList(); break;
          case 'sub':
          case 'mon':
          case 'con':       await loadStudyFileList(fileType); break;
        }

        // Diagram-specific bookkeeping: if the deleted file was the currently-
        // loaded diagram, drop the "current filename" so a subsequent Save →
        // Diagram falls back to Save As.
        if (fileType === 'diagram' && currentDiagramFile === fileName) {
          setCurrentDiagramFile(null);
        }
        // Success is silent; the picker visibly updates and the user clicked
        // delete on purpose. Errors still surface in the catch below.
      } catch (error: any) {
        showNotification('Delete Failed', error?.message || 'Failed to delete file', 'error');
        throw error;
      }
    },
    onUpload: async (file: File, category) => {
      if (!(await requireAuth({ reason: 'upload-model' }))) return;
      try {
        await uploadUserFile(file, category.id);
        showNotification('File Uploaded', `File "${file.name}" has been uploaded successfully!`, 'success');
        // Reload the appropriate file list
        if (category.id === 'knowledge') {
          await loadKnowledgeFileList();
        } else if (category.id === 'sub' || category.id === 'mon' || category.id === 'con') {
          await loadStudyFileList(category.id);
        } else {
          await loadModelFileList();
        }
      } catch (err: any) {
        showNotification('Upload Failed', `Failed to upload file: ${err.message}`, 'error');
        throw err;
      }
    },
    onRefresh: async () => {
      if (!(await requireAuth({ reason: 'refresh-files' }))) return;
      // Reload both file lists to ensure the file selector has the latest data
      await loadModelFileList();
      await loadKnowledgeFileList();
    },
    onSuccess: (fileName: string) => {
      // Success notification is handled by FileViewer or session creation
    },
    onError: (error: Error) => {
      showNotification('Failed to Open File', error.message, 'error');
    },
  });

  // Handle menu actions
  const handleMenuClick = useCallback(async (menu: string, action: string) => {
    console.log(`Menu action: ${menu} - ${action}`);
    
    try {
      switch (action) {
        case 'new-project':
          resetSession();
          break;
        case 'open-file':
          if (!(await requireAuth({ reason: 'open-file' }))) return;
          openFileSelector();
          break;
        case 'upload-model':
          if (!(await requireAuth({ reason: 'upload-model' }))) return;
          triggerFileUpload();
          break;
        case 'upload-knowledge-base':
          if (!(await requireAuth({ reason: 'upload-knowledge-base' }))) return;
          triggerKnowledgeUpload();
          break;
        case 'upload-sub':
        case 'upload-mon':
        case 'upload-con':
          if (!(await requireAuth({ reason: 'upload-model' }))) return;
          triggerStudyFileUpload(action.replace('upload-', '') as 'sub' | 'mon' | 'con');
          break;
        case 'upload-diagram':
          // The standard hidden-input upload pattern: open a file picker
          // filtered to .cyd / .cyd.gz and route through uploadUserFile.
          if (!(await requireAuth({ reason: 'upload-model' }))) return;
          {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.cyd,.cyd.gz,.cyd.json';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              try {
                await uploadUserFile(file, 'diagram');
                await loadDiagramFileList();
              } catch (err: any) {
                showNotification('Upload Failed', err?.message ?? String(err), 'error');
              }
            };
            input.click();
          }
          break;
        case 'save':
        case 'save-model':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'save' }))) return;
            await saveSessionToUserFile();
            showNotification('File Saved', 'Your file has been saved successfully!', 'success');
          } else {
            showNotification('No Session', 'Please open a file first before saving.', 'warning');
          }
          break;
        case 'save-diagram':
          if (!(await requireAuth({ reason: 'save' }))) return;
          if (currentDiagramFile) {
            await uploadDiagramAs(currentDiagramFile);
          } else {
            // No filename known yet → fall back to Save As.
            openFileSelector('save', undefined, '/Diagram');
          }
          break;
        case 'save-as':
        case 'save-as-model':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'save-as' }))) return;
            // Get current file name from currentFile (File object) or model_file
            let currentFileName: string | undefined;
            if (currentFile instanceof File) {
              currentFileName = currentFile.name;
            } else if (sessionInfo?.model_file) {
              // model_file is already a basename
              currentFileName = sessionInfo.model_file;
            }
            // Open file selector in save mode with current file name as default
            openFileSelector('save', currentFileName);
          } else {
            showNotification('No Session', 'Please open a file first before saving.', 'warning');
          }
          break;
        case 'save-as-diagram':
          if (!(await requireAuth({ reason: 'save-as' }))) return;
          openFileSelector('save', currentDiagramFile ?? undefined, '/Diagram');
          break;
        case 'import-data':
          // Removed - no longer in menu
          break;
        case 'documentation':
          showNotification(t('notifications.comingSoonTitle'), t('notifications.documentationComingSoon'), 'info');
          break;
        case 'export-results':
          if (calculationResult) {
            const dataStr = JSON.stringify(calculationResult, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'results.json';
            link.click();
          }
          break;
        case 'dc-power-flow':
          setMethod('dc');
          if (sessionId) {
            await solveFlow('dc');
          } else {
            openDialog(DIALOG_IDS.ALERT, AlertModal, {
              title: 'No Session Found',
              message: 'Please load a case file first to run power flow analysis.',
              type: 'warning',
              buttonText: t('buttons.loadCaseFile'),
              onButtonClick: () => {
                // Close the alert modal first, then open file selector
                // Use setTimeout to ensure modal closes before opening file selector
                setTimeout(() => {
                  openFileSelector();
                }, 100);
              },
            });
          }
          break;
        case 'ac-power-flow':
          setMethod('fnsl');
          if (sessionId) {
            await solveFlow('fnsl', { config: acSettings });
          } else {
            openDialog(DIALOG_IDS.ALERT, AlertModal, {
              title: 'No Session Found',
              message: 'Please load a case file first to run power flow analysis.',
              type: 'warning',
              buttonText: t('buttons.loadCaseFile'),
              onButtonClick: () => {
                // Close the alert modal first, then open file selector
                // Use setTimeout to ensure modal closes before opening file selector
                setTimeout(() => {
                  openFileSelector();
                }, 100);
              },
            });
          }
          break;
        case 'parameters':
          openDialog(DIALOG_IDS.AC_POWER_FLOW_SETTINGS, ACPowerFlowSettings);
          break;
        case 'run-analysis':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'run-analysis' }))) return;
            openDialog(DIALOG_IDS.RUN_ANALYSIS, RunAnalysisModal, {
              sessionId,
              onRunComplete: fetchStudyResults,
            });
          } else {
            openDialog(DIALOG_IDS.ALERT, AlertModal, {
              title: 'No Session Found',
              message: 'Please load a case file first to run power flow analysis.',
              type: 'warning',
              buttonText: t('buttons.loadCaseFile'),
              onButtonClick: () => {
                // Close the alert modal first, then open file selector
                // Use setTimeout to ensure modal closes before opening file selector
                setTimeout(() => {
                  openFileSelector();
                }, 100);
              },
            });
          }
          break;
        case 'network-diagram':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'network-diagram' }))) return;
            await getNetwork();
          }
          break;
        case 'bus-results':
          if (calculationResult) {
            console.log('Bus Results:', calculationResult.results?.bus_results);
          }
          break;
        case 'branch-results':
          if (calculationResult) {
            console.log('AC line results:', calculationResult.results?.acline_results);
            console.log('Transformer results:', calculationResult.results?.transformer_results);
          }
          break;
        case 'reset-layout':
          resetLayoutRef.current?.();
          break;
        case 'undo':
          if (undoRedoHandlersRef.current?.canUndo) {
            undoRedoHandlersRef.current.undo();
          } else {
            // showNotification(t('notifications.undoTitle'), t('notifications.nothingToUndo', 'Nothing to undo'), 'info');
          }
          break;
        case 'redo':
          if (undoRedoHandlersRef.current?.canRedo) {
            undoRedoHandlersRef.current.redo();
          } else {
            // showNotification(t('notifications.redoTitle'), t('notifications.nothingToRedo', 'Nothing to redo'), 'info');
          }
          break;
        case 'about':
          break;
        default:
          console.log('Unhandled action:', action);
      }
    } catch (err) {
      console.error('Menu action error:', err);
    }
  }, [
    calculationResult,
    currentFile,
    fetchStudyResults,
    getNetwork,
    method,
    openDialog,
    openFileSelector,
    requireAuth,
    resetSession,
    saveSessionToUserFile,
    sessionId,
    sessionInfo?.model_file,
    showNotification,
    solveFlow,
    t,
    triggerFileUpload,
    triggerKnowledgeUpload,
    triggerStudyFileUpload,
  ]);

  // Store handleMenuClick in ref for keyboard handler
  useEffect(() => {
    handleMenuClickRef.current = handleMenuClick;
  }, [handleMenuClick]);

  // Handle keyboard shortcuts for menu bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field, textarea, or contentEditable element
      const activeElement = document.activeElement;
      const isInputFocused = 
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
         activeElement.tagName === 'TEXTAREA' ||
         (activeElement as HTMLElement).contentEditable === 'true');
      
      // Don't intercept shortcuts when typing in input fields
      // Exception: Allow undo/redo shortcuts even in inputs
      const isUndoRedo = 
        (e.metaKey || e.ctrlKey) && 
        (e.key === 'z' || e.key === 'y');
      
      if (isInputFocused && !isUndoRedo) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Map keyboard shortcuts to menu actions
      // ⌥⌘S → Save Diagram is checked first (alt+meta), separately from the
      // standard ⌘S / ⌘⇧S which require !alt.
      if (cmdOrCtrl && e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleMenuClickRef.current?.('File', 'save-diagram');
        return;
      }
      if (cmdOrCtrl && !e.altKey) {
        let action: string | null = null;

        switch (e.key.toLowerCase()) {
          case 'o':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'open-file';
            }
            break;
          case 'u':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'upload-model';
            }
            break;
          case 's':
            if (e.shiftKey) {
              e.preventDefault();
              action = 'save-as';
            } else {
              e.preventDefault();
              action = 'save';
            }
            break;
          case 'i':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'import-data';
            }
            break;
          case 'e':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'export-results';
            }
            break;
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              action = 'redo';
            } else {
              e.preventDefault();
              action = 'undo';
            }
            break;
          case 'y':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'redo';
            }
            break;
          case '1':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'dc-power-flow';
            }
            break;
          case '2':
            if (!e.shiftKey) {
              e.preventDefault();
              action = 'ac-power-flow';
            }
            break;
          case 'r':
            if (e.shiftKey) {
              e.preventDefault();
              action = 'reset-layout';
            } else {
              e.preventDefault();
              action = 'run-analysis';
            }
            break;
        }

        // Execute the menu action if one was mapped
        if (action && handleMenuClickRef.current) {
          handleMenuClickRef.current('', action);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle toolbar actions
  const handleToolbarAction = async (action: string) => {
    console.log(`Toolbar action: ${action}`);
    
    try {
      switch (action) {
        case 'new-project':
          resetSession();
          showNotification(t('notifications.newProject'), t('notifications.newProjectMessage'), 'info');
          break;
        case 'upload-file':
          if (!(await requireAuth({ reason: 'upload-file' }))) return;
          triggerFileUpload();
          break;
        case 'save':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'save' }))) return;
            await saveSessionToUserFile();
            showNotification(t('notifications.fileSaved'), t('notifications.fileSavedMessage'), 'success');
          } else {
            showNotification(t('notifications.noSession'), t('notifications.noSessionMessage'), 'warning');
          }
          break;
        case 'run-power-flow':
          if (sessionId) {
            if (!(await requireAuth({ reason: 'run-power-flow' }))) return;
            await solveFlow(method, { config: method !== 'dc' ? acSettings : {} });
          } else {
            openDialog(DIALOG_IDS.ALERT, AlertModal, {
              title: t('notifications.noSession'),
              message: t('notifications.noSessionUploadMessage'),
              type: 'warning',
              buttonText: t('buttons.loadCaseFile'),
              onButtonClick: () => {
                // Close the alert modal first, then open file selector
                // Use setTimeout to ensure modal closes before opening file selector
                setTimeout(() => {
                  openFileSelector();
                }, 100);
              },
            });
          }
          break;
        case 'view-results':
          if (calculationResult) {
            console.log('Calculation Results:', calculationResult);
            showNotification(t('notifications.resultsAvailable'), t('notifications.resultsAvailableMessage'), 'info');
          } else {
            showNotification(t('notifications.noResults'), t('notifications.noResultsMessage'), 'warning');
          }
          break;
        case 'undo':
          if (undoRedoHandlersRef.current?.canUndo) {
            undoRedoHandlersRef.current.undo();
          } else {
            //showNotification(t('notifications.undoTitle'), t('notifications.nothingToUndo', 'Nothing to undo'), 'info');
          }
          break;
        case 'redo':
          if (undoRedoHandlersRef.current?.canRedo) {
            undoRedoHandlersRef.current.redo();
          } else {
            // showNotification(t('notifications.redoTitle'), t('notifications.nothingToRedo', 'Nothing to redo'), 'info');
          }
          break;
        default:
          console.log('Unhandled toolbar action:', action);
      }
    } catch (err) {
      console.error('Toolbar action error:', err);
    }
  };

  // Handle file upload from GridLayout
  const handleFileUpload = async (
    uploadedFile: File,
    fileType: 'model' | 'knowledge' | StudyFileType | 'diagram' = 'model',
  ) => {
    try {
      clearError();

      const authReason = fileType === 'knowledge' ? 'upload-knowledge' : 'upload-model';
      if (!(await requireAuth({ reason: authReason }))) return;

      // Model uploads must be .rawx; .raw / .sav are not supported yet.
      // Surfaces the same warning the toolbar's upload-file flow uses.
      if (fileType === 'model' && !uploadedFile.name.toLowerCase().endsWith('.rawx')) {
        showNotification('Unsupported Format', t('notifications.rawxOnly'), 'warning');
        return;
      }

      // Same size guard the menu/toolbar upload paths use, so the Project
      // Explorer upload warns up front instead of failing at the server.
      if (uploadedFile.size > MAX_UPLOAD_BYTES) {
        showNotification('File Too Large', t('notifications.fileTooLarge'), 'warning');
        return;
      }

      console.log('[handleFileUpload] Uploading file:', uploadedFile.name, 'to fileType:', fileType);

      // Upload file to user folder with specified file type
      const uploadResult = await uploadUserFile(uploadedFile, fileType);
      console.log('[handleFileUpload] Upload file successful:', uploadResult);

      if (fileType === 'model') {
        // Models need a session to load network data
        setIsNetworkLoading(true);
        const sessionResult = await createSessionFromFile(uploadedFile.name);
        console.log('Session created:', sessionResult);
        await loadModelFileList();
      } else if (fileType === 'knowledge') {
        await loadKnowledgeFileList();
      } else if (fileType === 'diagram') {
        // Diagrams are opaque to the file list; success is silent. Errors
        // bubble out via the surrounding catch.
      } else {
        // Study-case file (.sub/.mon/.con): reload that library so the new
        // file shows up in the explorer.
        await loadStudyFileList(fileType);
        showNotification(
          'File Uploaded',
          `File "${uploadedFile.name}" has been uploaded successfully!`,
          'success',
        );
      }

      console.log(`File uploaded to ${fileType} successfully`);
    } catch (err) {
      console.error('File upload error:', err);
    }
  };

  // Handle file deletion from ProjectExplorer
  const handleDeleteFile = async (
    fileName: string,
    fileType: 'model' | 'knowledge' | StudyFileType | 'diagram',
  ) => {
    try {
      clearError();
      if (!(await requireAuth({ reason: 'delete-file' }))) return;
      await deleteUserFile(fileName, fileType);
      // Refresh the appropriate file list
      if (fileType === 'model') {
        await loadModelFileList();
      } else if (fileType === 'knowledge') {
        await loadKnowledgeFileList();
      } else if (fileType === 'diagram') {
        // No global diagram cache to refresh — the file-selector queries on open.
      } else {
        await loadStudyFileList(fileType);
      }
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      showNotification(
        t('notifications.deleteFileFailed', 'Delete Failed'),
        error.message || t('notifications.deleteFileFailedMessage', 'Failed to delete file'),
        'error'
      );
    }
  };

  // Handle study-result deletion from ProjectExplorer
  const handleDeleteStudyResult = async (resultId: string, resultName: string) => {
    try {
      clearError();
      if (!(await requireAuth({ reason: 'delete-study-result' }))) return;
      await PowerFlowApp.deleteStudyResult(resultId);
      await fetchStudyResults();
    } catch (error: any) {
      console.error('Failed to delete study result:', error);
      showNotification(
        t('notifications.deleteFileFailed', 'Delete Failed'),
        error.message || t('notifications.deleteFileFailedMessage', 'Failed to delete file'),
        'error'
      );
    }
  };

  // Handle run analysis from GridLayout
  const handleRunAnalysis = async () => {
    try {
      clearError();
      
      if (!sessionId) {
        showNotification('No File Loaded', 'Please upload a file first', 'warning');
        return;
      }

      if (!(await requireAuth({ reason: 'run-analysis' }))) return;

      await solveFlow(method, { config: method !== 'dc' ? acSettings : {} });
      console.log('Analysis complete:', calculationResult);
    } catch (err: any) {
      console.error('Analysis error:', err);
      showNotification('Analysis Failed', `Failed to complete analysis: ${err.message}`, 'error');
    }
  };

  // Handle project explorer file selection
  const handleProjectFileSelect = async (fileName: string) => {
    try {
      clearError();
      if (!(await requireAuth({ reason: 'open-case-from-explorer' }))) return;
      console.log('Selected file from project explorer:', fileName);
      
      // Update selected file
      setSelectedFile(fileName);
      
      // Create session from the selected file (automatically loads network data)
      setIsNetworkLoading(true);
      const sessionResult = await createSessionFromFile(fileName);
      console.log('Session created from project file:', sessionResult);
      
      // showNotification('File Loaded', `Session created from "${fileName}" successfully!`, 'success');
    } catch (err: any) {
      console.error('Project file selection error:', err);
      showNotification('Failed to Open File', `Could not open "${fileName}": ${err.message}`, 'error');
    }
  };

  // (project explorer upload/delete handlers are provided via other callbacks)

  // Load a study-case file (.sub/.mon/.con) into the current session.
  // A study model must be loaded into a session first.
  const handleLoadStudyFile = useCallback(async (
    fileType: StudyFileType,
    fileName: string,
  ) => {
    try {
      clearError();
      if (!(await requireAuth({ reason: 'load-study-file' }))) return;

      // Enforce: the study model must be loaded into a session first
      if (!sessionId) {
        showNotification(
          'No Study Model',
          'Please load a study model first, then load study-case files.',
          'warning',
        );
        return;
      }

      await loadStudyFile(fileType, fileName);

      // Track the loaded file so ProjectExplorer can highlight it.
      // Success is conveyed by the highlight alone — no notification on success.
      setLoadedStudyFiles(prev => ({ ...prev, [fileType]: fileName }));
    } catch (err: any) {
      console.error('Study file load error:', err);
      showNotification('Failed to Load File', `Could not load "${fileName}": ${err.message}`, 'error');
    }
  }, [clearError, requireAuth, sessionId, loadStudyFile, showNotification]);

  // Expose the latest handleLoadStudyFile through a ref so the file-selector
  // hook (called above, before this declaration) can route study selections.
  useEffect(() => {
    handleLoadStudyFileRef.current = handleLoadStudyFile;
  }, [handleLoadStudyFile]);

  // Memoized callback for data refresh to prevent unnecessary re-renders
  const handleDataUpdated = useCallback(async () => {
    if (!(await requireAuth({ reason: 'refresh-network' }))) return;
    await getNetwork();
  }, [requireAuth, getNetwork]);

  // Memoized callback for load file trigger
  const handleTriggerLoadFile = useCallback(async () => {
    if (!(await requireAuth({ reason: 'open-file' }))) return;
    openFileSelector();
  }, [requireAuth, openFileSelector]);

  // Memoized callback for undo/redo ready
  const handleUndoRedoReady = useCallback((handlers: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => {
    undoRedoHandlersRef.current = handlers;
    setCanUndo(handlers.canUndo);
    setCanRedo(handlers.canRedo);
  }, []);

  // Memoized callback for reset layout ready
  const handleResetLayoutReady = useCallback((resetFn: () => void) => {
    resetLayoutRef.current = resetFn;
  }, []);

  // Memoized callbacks for file refresh
  // Refreshes the whole "Study Cases" section: models + .sub/.mon/.con libraries
  const handleRefreshFiles = useCallback(async () => {
    if (!(await requireAuth({ reason: 'refresh-files' }))) return;
    await Promise.all([loadModelFileList(), ...STUDY_FILE_TYPES.map(loadStudyFileList)]);
  }, [requireAuth, loadModelFileList, loadStudyFileList]);

  const handleRefreshKnowledge = useCallback(async () => {
    if (!(await requireAuth({ reason: 'refresh-knowledge' }))) return;
    await loadKnowledgeFileList();
  }, [requireAuth, loadKnowledgeFileList]);


  const isVerifyEmailRoute = window.location.pathname === '/verify-email';
  // Google's OAuth popup is redirected back to the app origin (the redirect_uri is
  // the origin root — see LoginModal/GoogleCallbackPage), so the callback arrives
  // as `/?code=…` rather than at a dedicated path. Detect it by its OAuth query
  // params, otherwise the popup renders the full app and never closes. The legacy
  // path is still honored for safety.
  const oauthParams = new URLSearchParams(window.location.search);
  const hasGoogleOAuthParams = oauthParams.has('code') || oauthParams.has('error');
  const isGoogleCallbackRoute =
    window.location.pathname === '/auth/google/callback' ||
    (hasGoogleOAuthParams && !isVerifyEmailRoute);

  return (
    <LanguageProvider>
      <ThemeProvider>
        {isGoogleCallbackRoute ? (
          <GoogleCallbackPage
            apiBaseURL={window.API_BASE_URL || 'http://localhost:8080'}
            onSuccess={(result) => {
              // This will be called via postMessage to opener window
              console.log('Google login success:', result);
            }}
          />
        ) : isVerifyEmailRoute ? (
          <VerifyEmailPage />
        ) : (
        <div className="app-container">
          {/* Mobile Orientation Prompt - Suggests landscape mode for better mobile experience */}
          <MobileOrientationPrompt />
          
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {/* Hidden file input for study files (.sub / .mon / .con) */}
          <input
            ref={studyFileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleStudyFileSelect}
          />
          
          <MenuBar
            onMenuClick={handleMenuClick}
            onToolbarAction={handleToolbarAction}
            healthStatus={connected ? 'healthy' : 'unhealthy'}
            sessionId={sessionId}
            loading={loading}
            isSolving={isSolving}
            canUndo={canUndo}
            canRedo={canRedo}
            diagramHasElements={diagramElementCount > 0}
          />
          
          <GridLayout
            onFileUpload={handleFileUpload}
            onRunAnalysis={handleRunAnalysis}
            onFileSelect={handleProjectFileSelect}
            modelFiles={modelFiles}
            knowledgeFiles={knowledgeFiles}
            subFiles={subFiles}
            monFiles={monFiles}
            conFiles={conFiles}
            loadedStudyFiles={loadedStudyFiles}
            onLoadStudyFile={handleLoadStudyFile}
            studyResults={studyResults}
            onStudyResultClick={handleStudyResultClick}
            onDeleteStudyResult={handleDeleteStudyResult}
            onDeleteFile={handleDeleteFile}
            onRefreshFiles={handleRefreshFiles}
            onRefreshKnowledge={handleRefreshKnowledge}
            onRefreshStudyResults={fetchStudyResults}
            networkData={networkData}
            powerFlowData={powerFlowData}
            isNetworkLoading={isNetworkLoading}
            onDataUpdated={handleDataUpdated}
            currentFile={currentFile}
            sessionInfo={sessionInfo}
            baseURL={aiBaseURL}
            onFileInputReady={setFileInputTriggers}
            selectedFile={selectedFile}
            onUndoRedoReady={handleUndoRedoReady}
            onResetLayoutReady={handleResetLayoutReady}
            triggerLoadFile={handleTriggerLoadFile}
            onToolResults={handleToolResults}
            onDiagramRefReady={(ref) => { diagramRefRef.current = ref; }}
            onDiagramElementsChanged={setDiagramElementCount}
            onSetNetworkViewReady={(setView) => { setNetworkViewRef.current = setView; }}
            onContextMenuOpenDiagram={() => openFileSelector('open', undefined, '/Diagram')}
            onContextMenuSaveDiagram={() => handleMenuClick('File', 'save-diagram')}
          />
          
          {/* DialogManager: Renders all active dialogs from the DialogProvider context.
              Placed inside App.tsx to:
              - Follow React best practices for centralized dialog management
              - Maintain consistency with ThemeProvider and LanguageProvider structure
              - Ensure dialogs render within app container for proper DOM hierarchy and styling
              - Allow dialogs to be opened from any component (MenuBar, hooks, etc.)
              See: src/components/common/Dialog/PLACEMENT_GUIDE.md for details */}
          <DialogManager />
        </div>
        )}
      </ThemeProvider>
    </LanguageProvider>
  );
}

function App() {
  return (
    <SolverSettingsProvider>
      <AppContent />
    </SolverSettingsProvider>
  );
}

export default App;
