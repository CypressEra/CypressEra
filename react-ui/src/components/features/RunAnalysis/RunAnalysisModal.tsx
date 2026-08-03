import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../common/Modal';
import {
  Button,
  useDialog,
  DIALOG_IDS,
  FileSelectorModal,
  FILE_CATEGORIES,
  getCategoryById,
  getCategoryByPath,
  matchesCategory,
} from '../../common';
import type { FileItem, FileCategory } from '../../common';
import { PowerFlowApp } from '../../../sdk';
import { useSolverSettings } from '../../../contexts/SolverSettingsContext';
import { StudyResultModal } from '../StudyResults/StudyResultModal';
import { FileViewer } from '../FileViewer';
import styles from './RunAnalysisModal.module.css';

type StudyKind = 'sub' | 'mon' | 'con';
const STUDY_KINDS: StudyKind[] = ['sub', 'mon', 'con'];

interface StudyRowState {
  /** Loaded study-file name, or null when none is attached. */
  fileName: string | null;
  /** Inline error for this row, or null. */
  error: string | null;
}

const EMPTY_ROW: StudyRowState = { fileName: null, error: null };
const EMPTY_ROWS: Record<StudyKind, StudyRowState> = {
  sub: { ...EMPTY_ROW },
  mon: { ...EMPTY_ROW },
  con: { ...EMPTY_ROW },
};

/** Format a millisecond span as m:ss (h:mm:ss once it passes an hour). */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface RunAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active session; the dialog's actions target this session. */
  sessionId: string | null;
  /** Called when a contingency run completes — a new study result now exists. */
  onRunComplete?: () => void;
}

/**
 * Run Analysis dialog — attaches .sub/.mon/.con study files to the session and
 * launches an analysis. Reached from Power Flow → Run Analysis.
 */
export const RunAnalysisModal: React.FC<RunAnalysisModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onRunComplete,
}) => {
  const { t } = useTranslation();
  // AC solution options — sent as the contingency run's power flow config so
  // its base case matches a standalone AC solve of the same session.
  const { acSettings } = useSolverSettings();
  const { openDialog } = useDialog();

  const [rows, setRows] = useState<Record<StudyKind, StudyRowState>>(EMPTY_ROWS);
  // Whether the session has a model (.raw/.sav) loaded — gates the Run action
  // together with the three study-file rows.
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);

  // Contingency report options, sent as the run's `settings`.
  const [loadingThreshold, setLoadingThreshold] = useState<string>('90');
  const [reportThermal, setReportThermal] = useState(true);
  const [reportVoltage, setReportVoltage] = useState(true);

  // Study-file parse/resolution diagnostics
  const [diagnostics, setDiagnostics] = useState<any[]>([]);

  // AC contingency analysis: the async job. Results are not shown inline — a
  // completed run is opened in the study-result viewer via "View Results".
  const [accJob, setAccJob] = useState<any | null>(null);
  // The study result the completed run produced; drives "View Results".
  const [accResultId, setAccResultId] = useState<string | null>(null);
  // Ticks once a second while a job runs, to drive the live elapsed clock.
  const [nowTick, setNowTick] = useState<number>(Date.now());
  // Job id whose terminal state has already been logged, so the command
  // logger gets exactly one completion line per run.
  const accLoggedRef = useRef<string | null>(null);

  // Validate the session's loaded study files; surface parser diagnostics
  const validate = useCallback(async () => {
    if (!sessionId) {
      setDiagnostics([]);
      return;
    }
    try {
      const res: any = await PowerFlowApp.validateStudyFiles(sessionId);
      setDiagnostics(res?.diagnostics || []);
    } catch (err) {
      console.error('[RunAnalysis] Failed to validate study files:', err);
    }
  }, [sessionId]);

  // Rehydrate study-file rows from the session each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
    setDiagnostics([]);
    setAccJob(null);
    setAccResultId(null);
    if (!sessionId) {
      setRows(EMPTY_ROWS);
      setModelLoaded(false);
      return;
    }
    validate();
    let cancelled = false;
    (async () => {
      try {
        const info: any = await PowerFlowApp.getSessionInfo(sessionId ?? undefined);
        if (cancelled) return;
        const fromName = (name?: string): StudyRowState => ({
          fileName: name || null,
          error: null,
        });
        setRows({
          sub: fromName(info?.sub_file),
          mon: fromName(info?.mon_file),
          con: fromName(info?.con_file),
        });
        setModelLoaded(!!info?.model_file);
      } catch (err) {
        console.error('[RunAnalysis] Failed to load session info:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId, validate]);

  // Load a study file of a given kind into the session
  const loadByKind = useCallback(
    (kind: StudyKind, fileName: string) => {
      const sid = sessionId || undefined;
      if (kind === 'sub') return PowerFlowApp.loadSub(fileName, sid);
      if (kind === 'mon') return PowerFlowApp.loadMon(fileName, sid);
      return PowerFlowApp.loadCon(fileName, sid);
    },
    [sessionId],
  );

  // File-system provider for the picker: lists the user library per category
  const getFiles = useCallback(
    async (path: string): Promise<FileItem[]> => {
      const normalized = path === '/' ? '/' : path.endsWith('/') ? path.slice(0, -1) : path;
      if (normalized === '/') {
        return FILE_CATEGORIES.map((cat) => ({
          name: t(cat.labelKey),
          type: 'folder' as const,
          path: cat.rootPath,
          icon: cat.icon,
        }));
      }
      const category = getCategoryByPath(normalized);
      if (!category) return [];
      try {
        const res: any = await PowerFlowApp.getUserFiles(category.id);
        const files: string[] = res?.files || [];
        return files.map((name) => ({
          name,
          type: 'file' as const,
          path: `${category.rootPath}/${name}`,
          icon: category.fileIcon,
        }));
      } catch (err) {
        console.error('[RunAnalysis] Failed to list files:', err);
        return [];
      }
    },
    [t],
  );

  // Open the file picker for a study-file row, pre-navigated to its category
  const openPicker = useCallback(
    (kind: StudyKind) => {
      const category = getCategoryById(kind);
      if (!category) return;
      openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
        title: t('runAnalysis.selectTitle', { defaultValue: 'Select Study File' }),
        categories: FILE_CATEGORIES,
        initialPath: category.rootPath,
        getFiles,
        fileFilter: (file: FileItem) => {
          if (file.type === 'folder') return true;
          const cat = getCategoryByPath(file.path);
          return cat ? matchesCategory(file.name, cat) : true;
        },
        onSelect: async (file: FileItem) => {
          const cat = getCategoryByPath(file.path);
          // Decision 5: reject a file whose kind does not match the row
          if (!cat || cat.id !== kind || !matchesCategory(file.name, cat)) {
            setRows((prev) => ({
              ...prev,
              [kind]: {
                ...prev[kind],
                error: t('runAnalysis.errors.wrongType', {
                  defaultValue: 'Selected file is not a .{{ext}} file.',
                  ext: kind,
                }),
              },
            }));
            return;
          }
          try {
            // The load response already carries whole-session validation —
            // no separate validate call is needed after a load.
            const loadResult: any = await loadByKind(kind, file.name);
            setRows((prev) => ({
              ...prev,
              [kind]: { fileName: file.name, error: null },
            }));
            if (Array.isArray(loadResult?.diagnostics)) {
              setDiagnostics(loadResult.diagnostics);
            }
          } catch (err: any) {
            setRows((prev) => ({
              ...prev,
              [kind]: {
                ...prev[kind],
                error: err?.message || t('runAnalysis.errors.loadFailed', { defaultValue: 'Failed to load file.' }),
              },
            }));
          }
        },
        onDelete: async (file: FileItem) => {
          const cat = getCategoryByPath(file.path);
          if (cat) await PowerFlowApp.deleteUserFile(file.name, cat.id);
        },
        onView: (file: FileItem) => {
          const cat = getCategoryByPath(file.path);
          if (!cat || cat.id === 'model') return;
          openDialog(DIALOG_IDS.FILE_VIEWER, FileViewer, {
            fileName: file.name,
            fileType: cat.id,
          });
        },
        onUpload: async (file: File, cat: FileCategory) => {
          await PowerFlowApp.uploadUserFile(file, cat.id);
        },
      });
    },
    [openDialog, t, getFiles, loadByKind],
  );

  // Start an AC contingency analysis run (an async job).
  const runContingency = useCallback(async () => {
    if (!sessionId) return;
    setStatus(null);
    // Pre-flight: confirm the session actually has the model and all three
    // study files loaded. The UI may have shown stale row state.
    try {
      const info: any = await PowerFlowApp.getSessionInfo(sessionId);
      const missing: string[] = [];
      if (!info?.model_file) missing.push('model');
      if (!info?.sub_file) missing.push('.sub');
      if (!info?.mon_file) missing.push('.mon');
      if (!info?.con_file) missing.push('.con');
      setRows({
        sub: { fileName: info?.sub_file || null, error: null },
        mon: { fileName: info?.mon_file || null, error: null },
        con: { fileName: info?.con_file || null, error: null },
      });
      setModelLoaded(!!info?.model_file);
      if (missing.length > 0) {
        setStatus({
          kind: 'error',
          text: t('runAnalysis.missingInputs', {
            defaultValue: 'Cannot run: {{items}} not loaded.',
            items: missing.join(', '),
          }),
        });
        return;
      }
    } catch (err) {
      console.error('[RunAnalysis] Failed to verify session inputs:', err);
      setStatus({
        kind: 'error',
        text: t('runAnalysis.preflightFailed', {
          defaultValue: 'Failed to verify session inputs.',
        }),
      });
      return;
    }
    setAccJob(null);
    setAccResultId(null);
    // Report scope: thermal, voltage, or both — derived from the checkboxes.
    const reportScope =
      reportThermal && reportVoltage
        ? 'both'
        : reportThermal
          ? 'thermal'
          : reportVoltage
            ? 'voltage'
            : 'both';
    const settings = {
      report_scope: reportScope,
      loading_threshold_pct: Number(loadingThreshold) || 100,
    };
    try {
      const job: any = await PowerFlowApp.startContingencyAnalysis(sessionId, settings, acSettings);
      setAccJob(job);
    } catch (err: any) {
      setStatus({
        kind: 'error',
        text: err?.message || t('runAnalysis.accFailed', { defaultValue: 'Contingency analysis failed.' }),
      });
    }
  }, [sessionId, reportThermal, reportVoltage, loadingThreshold, acSettings, t]);

  // Cancel the running contingency analysis job.
  const cancelContingency = useCallback(async () => {
    if (!accJob) return;
    try {
      await PowerFlowApp.cancelAnalysisJob(accJob.id);
    } catch (err) {
      console.error('[RunAnalysis] Failed to cancel analysis job:', err);
    }
  }, [accJob]);

  // Poll the job while it runs. The completed job carries study_result_id,
  // which "View Results" uses to open the saved report.
  useEffect(() => {
    if (!accJob) return;
    if (accJob.state !== 'queued' && accJob.state !== 'running') return;
    const timer = setTimeout(async () => {
      try {
        const updated: any = await PowerFlowApp.getAnalysisJob(accJob.id);
        setAccJob(updated);
      } catch (err) {
        console.error('[RunAnalysis] Failed to poll analysis job:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [accJob]);

  // Log a single command-logger line when a contingency run reaches a terminal
  // state, so the logger reflects that the analysis finished.
  useEffect(() => {
    if (!accJob || accLoggedRef.current === accJob.id) return;
    const p = accJob.progress || {};
    if (accJob.state === 'completed') {
      accLoggedRef.current = accJob.id;
      PowerFlowApp.log(
        `AC contingency analysis complete — ${p.total ?? 0} contingencies, ${p.violations ?? 0} violation(s)`,
        'success',
      );
      // A new study result now exists — let the Project Explorer refresh.
      onRunComplete?.();
    } else if (accJob.state === 'failed') {
      accLoggedRef.current = accJob.id;
      PowerFlowApp.log(
        `AC contingency analysis failed${accJob.error ? `: ${accJob.error}` : ''}`,
        'error',
      );
    } else if (accJob.state === 'cancelled') {
      accLoggedRef.current = accJob.id;
      PowerFlowApp.log('AC contingency analysis cancelled', 'warning');
    }
  }, [accJob, onRunComplete]);

  // Contingency job is still working (cancellable); progress percent for the bar.
  const accBusy = !!accJob && (accJob.state === 'queued' || accJob.state === 'running');
  // Run is enabled only when the session has a model and all three study files
  // loaded, and no contingency job is currently running.
  const canRun =
    !!sessionId &&
    modelLoaded &&
    !!rows.sub.fileName &&
    !!rows.mon.fileName &&
    !!rows.con.fileName &&
    !accBusy;
  // Enter-key shortcut for the primary Run action. Mirrors the button's
  // disabled state so a stray Enter never starts a run that the button refuses.
  const tryRun = useCallback(() => {
    if (canRun) runContingency();
  }, [canRun, runContingency]);
  // The progress bar is shown while running AND once completed, so a job that
  // jumps straight to "completed" still updates the bar to its final state
  // before the run UI moves on.
  const accShowProgress =
    !!accJob && (accBusy || accJob.state === 'completed');
  const accPct =
    accJob?.state === 'completed'
      ? 100
      : accJob && accJob.progress?.total > 0
        ? Math.round((accJob.progress.done / accJob.progress.total) * 100)
        : 0;

  // Tick a 1 s clock while the job runs so the elapsed time updates live.
  useEffect(() => {
    if (!accBusy) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [accBusy]);

  // Run duration: live while running, frozen at the final span once finished.
  const accElapsedMs = useMemo(() => {
    if (!accJob?.created_at) return 0;
    const start = new Date(accJob.created_at).getTime();
    const end =
      accBusy || !accJob.updated_at ? nowTick : new Date(accJob.updated_at).getTime();
    return Math.max(0, end - start);
  }, [accJob, accBusy, nowTick]);

  // Resolve the study result a completed run produced, for "View Results".
  // The job carries study_result_id directly; if the server omits it, fall
  // back to the newest stored result for this session.
  useEffect(() => {
    if (accJob?.state !== 'completed' || accResultId) return;
    if (accJob.study_result_id) {
      setAccResultId(accJob.study_result_id);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await PowerFlowApp.listStudyResults();
        const list: any[] = res?.results || [];
        // listStudyResults is newest-first; take the newest for this session.
        const match = list.find((r) => !sessionId || r.session_id === sessionId) || list[0];
        if (!cancelled && match?.id) setAccResultId(match.id);
      } catch (err) {
        console.error('[RunAnalysis] Failed to resolve study result:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accJob, accResultId, sessionId]);

  // Open the completed run's saved report in the study-result viewer.
  const viewResults = useCallback(() => {
    if (!accResultId) return;
    openDialog(DIALOG_IDS.STUDY_RESULT, StudyResultModal, { resultId: accResultId });
  }, [accResultId, openDialog]);

  const statusClass =
    status?.kind === 'error'
      ? styles.footerStatusError
      : status?.kind === 'success'
        ? styles.footerStatusSuccess
        : '';

  // When a study file has diagnostics, surface a terse notice beside the
  // Study Files title; the detail lives in the command logger. Errors take
  // precedence (red); a warning-only set shows an amber notice.
  const studyFileNotice = useMemo<{ severity: 'error' | 'warning'; text: string } | null>(() => {
    // Collect the .sub/.mon/.con kinds carrying a diagnostic of the severity.
    const kindsOf = (severity: string): string | null => {
      const kinds = new Set<string>();
      for (const d of diagnostics) {
        if (d?.severity !== severity) continue;
        const ext = (typeof d.file === 'string' ? d.file : '').toLowerCase().split('.').pop();
        if (ext === 'sub' || ext === 'mon' || ext === 'con') kinds.add(ext.toUpperCase());
      }
      return kinds.size > 0 ? Array.from(kinds).join('/') : null;
    };
    const errorKinds = kindsOf('error');
    if (errorKinds) {
      return {
        severity: 'error',
        text: t('runAnalysis.studyFileError', {
          defaultValue: 'Error found in {{kinds}} file, please see details in the command logger',
          kinds: errorKinds,
        }),
      };
    }
    const warningKinds = kindsOf('warning');
    if (warningKinds) {
      return {
        severity: 'warning',
        text: t('runAnalysis.studyFileWarning', {
          defaultValue: 'Warning found in {{kinds}} file, please see details in the command logger',
          kinds: warningKinds,
        }),
      };
    }
    return null;
  }, [diagnostics, t]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      onEnterKey={tryRun}
      title={t('runAnalysis.title', { defaultValue: 'Run Analysis' })}
      width={580}
      modal={true}
      footer={
        <div className={styles.footer}>
          {status && <span className={`${styles.footerStatus} ${statusClass}`}>{status.text}</span>}
          <div className={styles.footerButtons}>
            <Button variant="secondary" size="small" onClick={onClose}>
              {t('runAnalysis.close', { defaultValue: 'Close' })}
            </Button>
            {accResultId && (
              <Button variant="primary" size="small" onClick={viewResults}>
                {t('runAnalysis.viewResults', { defaultValue: 'View Results' })}
              </Button>
            )}
            {accBusy ? (
              <Button variant="secondary" size="small" onClick={cancelContingency}>
                {t('runAnalysis.cancelRun', { defaultValue: 'Cancel' })}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="small"
                onClick={runContingency}
                disabled={!canRun}
              >
                {t('runAnalysis.run', { defaultValue: 'Run' })}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className={styles.content}>
        {/* Study files */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>{t('runAnalysis.studyFilesTitle', { defaultValue: 'Study Files' })}</h4>
            {studyFileNotice && (
              <span
                className={
                  studyFileNotice.severity === 'error' ? styles.studyFileError : styles.studyFileWarning
                }
              >
                {studyFileNotice.text}
              </span>
            )}
          </div>
          <div className={styles.studyRows}>
            {STUDY_KINDS.map((kind) => {
              const row = rows[kind];
              return (
                <div key={kind} className={styles.studyRow}>
                  <span className={styles.studyLabel}>{t(`runAnalysis.study.${kind}`)}</span>
                  <div className={styles.studyFile}>
                    {row.fileName ? (
                      <span className={styles.studyFileName} title={row.fileName}>{row.fileName}</span>
                    ) : (
                      <span className={styles.studyFileNameEmpty}>
                        {t('runAnalysis.noFile', { defaultValue: 'No file selected' })}
                      </span>
                    )}
                    {row.error && <span className={styles.studyError}>{row.error}</span>}
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={(e) => {
                      // Blur so the picker, on close, doesn't restore focus
                      // to this button (which would steal the Enter shortcut).
                      e.currentTarget.blur();
                      openPicker(kind);
                    }}
                  >
                    {row.fileName
                      ? t('runAnalysis.change', { defaultValue: 'Change…' })
                      : t('runAnalysis.select', { defaultValue: 'Select…' })}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <hr className={styles.divider} />

        {/* Contingency analysis options */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('runAnalysis.analysisTitle', { defaultValue: 'AC Contingency Analysis' })}</h4>
          <div className={styles.tabPanel}>
            {/* Report contingencies whose loading exceeds a threshold */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="run-analysis-loading-threshold">
                {t('runAnalysis.reportLoadingAbove', { defaultValue: 'Report loading above' })}
              </label>
              <div className={styles.inlineField}>
                <input
                  id="run-analysis-loading-threshold"
                  type="number"
                  className={styles.numberInput}
                  value={loadingThreshold}
                  min={0}
                  step={1}
                  onChange={(e) => setLoadingThreshold(e.target.value)}
                />
                <span className={styles.unit}>%</span>
              </div>
            </div>

            {/* Result categories to include in the report */}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('runAnalysis.reportResults', { defaultValue: 'Report results' })}
              </span>
              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={reportThermal}
                    onChange={(e) => setReportThermal(e.target.checked)}
                  />
                  {t('runAnalysis.thermal', { defaultValue: 'Thermal' })}
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={reportVoltage}
                    onChange={(e) => setReportVoltage(e.target.checked)}
                  />
                  {t('runAnalysis.voltage', { defaultValue: 'Voltage' })}
                </label>
              </div>
            </div>
          </div>

          {accShowProgress && accJob && (
            <div className={styles.accProgress}>
              <div className={styles.accBar}>
                <div className={styles.accBarFill} style={{ width: `${accPct}%` }} />
              </div>
              <div className={styles.accInfo}>
                <span className={styles.accInfoItem}>
                  <span className={styles.accInfoLabel}>
                    {t('runAnalysis.accStatusLabel', { defaultValue: 'Status' })}
                  </span>
                  <span className={styles.accInfoValue}>
                    {accJob.state === 'completed'
                      ? t('runAnalysis.accStateCompleted', { defaultValue: 'Completed' })
                      : t('runAnalysis.accStateRunning', { defaultValue: 'Running…' })}
                  </span>
                </span>
                <span className={styles.accInfoItem}>
                  <span className={styles.accInfoLabel}>
                    {t('runAnalysis.accContingenciesLabel', { defaultValue: 'Contingencies' })}
                  </span>
                  <span className={styles.accInfoValue}>
                    {accJob.state === 'completed'
                      ? (accJob.progress?.total ?? accJob.progress?.done ?? 0)
                      : `${accJob.progress?.done ?? 0} / ${accJob.progress?.total ?? 0}`}
                  </span>
                </span>
                <span className={styles.accInfoItem}>
                  <span className={styles.accInfoLabel}>
                    {t('runAnalysis.accViolationsLabel', { defaultValue: 'Violations' })}
                  </span>
                  <span className={styles.accInfoValue}>{accJob.progress?.violations ?? 0}</span>
                </span>
                <span className={styles.accInfoItem}>
                  <span className={styles.accInfoLabel}>
                    {accBusy
                      ? t('runAnalysis.accElapsedLabel', { defaultValue: 'Elapsed' })
                      : t('runAnalysis.accDurationLabel', { defaultValue: 'Duration' })}
                  </span>
                  <span className={styles.accInfoValue}>{formatDuration(accElapsedMs)}</span>
                </span>
              </div>
            </div>
          )}
          {accJob && accJob.state === 'failed' && (
            <div className={styles.accNotice}>
              {t('runAnalysis.accFailed', { defaultValue: 'Contingency analysis failed.' })}
            </div>
          )}
          {accJob && accJob.state === 'cancelled' && (
            <div className={styles.accNotice}>
              {t('runAnalysis.accCancelled', { defaultValue: 'Contingency analysis cancelled.' })}
            </div>
          )}
        </div>

      </div>
    </BaseModal>
  );
};
