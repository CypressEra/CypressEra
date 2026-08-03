import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { PowerFlowApp } from '../../../sdk';
import { ContingencyReportView } from './ContingencyReportView';
import { typeLabelOf, formatCreated } from './resultMeta';
import styles from './StudyResultModal.module.css';

export interface StudyResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The study result to open; null shows nothing. */
  resultId: string | null;
}

/** Views one stored study result, results-first: the analysis report fills the
 *  window under a single toolbar row; run provenance lives in the report's
 *  Details popover and the bottom status bar. */
export const StudyResultModal: React.FC<StudyResultModalProps> = ({
  isOpen,
  onClose,
  resultId,
}) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Window can be maximized (full-screen) and restored.
  const [isMaximized, setIsMaximized] = useState(false);

  // Fetch the result whenever the modal opens for a result id.
  useEffect(() => {
    if (!isOpen || !resultId) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setResult(null);
    setError(null);
    (async () => {
      try {
        const r: any = await PowerFlowApp.getStudyResult(resultId);
        if (!cancelled) setResult(r);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load study result');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, resultId]);

  const meta = result?.meta;
  // Document-style window title with the run's identity:
  // "AC Contingency Analysis — ieee25.rawx · ieee25.con · Jul 11, 2026, 9:41 AM".
  const title = meta
    ? [
        [typeLabelOf(meta), meta.model_file].filter(Boolean).join(' — '),
        meta.con_file,
        formatCreated(meta),
      ]
        .filter(Boolean)
        .join(' · ')
    : t('studyResult.title', { defaultValue: 'Study Result' });

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={1100}
      height={720}
      resizable
      isMaximized={isMaximized}
      onMaximize={() => setIsMaximized((v) => !v)}
      footer={
        <Button variant="secondary" size="small" onClick={onClose}>
          {t('studyResult.close', { defaultValue: 'Close' })}
        </Button>
      }
    >
      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}
        {!error && !result && (
          <div className={styles.loading}>{t('common.loading', { defaultValue: 'Loading…' })}</div>
        )}
        {meta && <ContingencyReportView report={result.report} meta={meta} />}
      </div>
    </BaseModal>
  );
};
