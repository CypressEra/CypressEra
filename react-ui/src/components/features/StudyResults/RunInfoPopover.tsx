import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { typeLabelOf, formatCreated } from './resultMeta';
import styles from './RunInfoPopover.module.css';

const PANEL_WIDTH = 380;

/** Display name for a config key: underscores to spaces, first letter
 *  capitalized — "flat_start" → "Flat start". */
function prettifyKey(k: string): string {
  const words = k.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Key/value pairs longer than roughly half the panel width take a full row
 *  (and wrap) instead of truncating the value. */
const HALF_ROW_CHARS = 24;

export interface RunInfoPopoverProps {
  open: boolean;
  /** The toolbar button the popover anchors under. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Study-result metadata (type, created, version, files, power-flow config). */
  meta: any;
  /** The report summary — `{ total, … }`; shown as the contingency count. */
  summary?: any;
  onClose: () => void;
}

/** NSPopover-style run-details overlay: the Get-Info metadata (type, created,
 *  version, study files, power-flow settings) anchored under its toolbar
 *  button. Portalled to document.body — the modal is a transformed ancestor,
 *  which would turn position:fixed into modal-relative coordinates and clip
 *  the panel at the modal's edge. Opening it never reflows the table. */
export const RunInfoPopover: React.FC<RunInfoPopoverProps> = ({
  open,
  anchorRef,
  meta,
  summary,
  onClose,
}) => {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number } | null>(null);

  // Place the panel snug under the anchor, right-aligned, clamped to the
  // viewport, with the arrow pointing at the anchor's center.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    const arrowLeft = Math.max(
      12,
      Math.min(r.left + r.width / 2 - left - 6, PANEL_WIDTH - 24),
    );
    setPos({ top: r.bottom + 7, left, arrowLeft });
  }, [open, anchorRef]);

  // Escape closes the popover only — capture phase so the modal's own Escape
  // handling doesn't also fire.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open || !pos || !meta) return null;

  const files: { key: string; label: string; value: string }[] = [
    { key: 'model', label: t('studyResult.model', { defaultValue: 'Model' }), value: meta.model_file },
    { key: 'sub', label: t('studyResult.subsystem', { defaultValue: 'Subsystem' }), value: meta.sub_file },
    { key: 'mon', label: t('studyResult.monitor', { defaultValue: 'Monitor' }), value: meta.mon_file },
    { key: 'con', label: t('studyResult.contingency', { defaultValue: 'Contingency' }), value: meta.con_file },
  ].filter((f) => !!f.value);

  const settings = Object.entries(meta.power_flow_config || {});

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={styles.panelWrap}
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-label={t('studyResult.details', { defaultValue: 'Details' })}
      >
        <div className={styles.arrow} style={{ left: pos.arrowLeft }} />
        <div
          className={styles.panel}
          style={{ maxHeight: window.innerHeight - pos.top - 12 }}
        >
        <dl className={styles.info}>
          <dt className={styles.infoKey}>{t('studyResult.type', { defaultValue: 'Type' })}</dt>
          <dd className={styles.infoVal}>{typeLabelOf(meta)}</dd>
          {formatCreated(meta) && (
            <>
              <dt className={styles.infoKey}>{t('studyResult.created', { defaultValue: 'Created' })}</dt>
              <dd className={styles.infoVal}>{formatCreated(meta)}</dd>
            </>
          )}
          {meta.app_version && (
            <>
              <dt className={styles.infoKey}>{t('studyResult.version', { defaultValue: 'Version' })}</dt>
              <dd className={styles.infoVal}>CypressEra v{meta.app_version}</dd>
            </>
          )}
          {typeof summary?.total === 'number' && (
            <>
              <dt className={styles.infoKey}>
                {t('studyResult.contingencies', { defaultValue: 'Contingencies' })}
              </dt>
              <dd className={styles.infoVal}>{summary.total}</dd>
            </>
          )}
        </dl>

        {files.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {t('studyResult.files', { defaultValue: 'Files' })}
            </div>
            <dl className={styles.info}>
              {files.map((f) => (
                <React.Fragment key={f.key}>
                  <dt className={styles.infoKey}>{f.label}</dt>
                  <dd className={styles.infoVal}>{f.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}

        {settings.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {t('studyResult.powerFlow', { defaultValue: 'Power flow setting' })}
            </div>
            <div className={styles.settingsGrid}>
              {settings.map(([k, v]) => {
                const label = prettifyKey(k);
                const val = String(v);
                const wide = label.length + val.length > HALF_ROW_CHARS;
                return (
                  <span
                    key={k}
                    className={`${styles.settingItem} ${wide ? styles.settingItemWide : ''}`}
                  >
                    <span className={styles.settingKey}>{label}</span>
                    <span className={styles.settingVal}>{val}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </>,
    document.body,
  );
};
