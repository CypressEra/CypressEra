import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '../../common/Tabs';
import { exportStudyResultJson, exportStudyResultXlsx } from './studyResultExport';
import { TABS, rowTab } from './columns';
import type { TabKey } from './columns';
import { ReportTable } from './ReportTable';
import { RunInfoPopover } from './RunInfoPopover';
import styles from './ContingencyReportView.module.css';

export interface ContingencyReportViewProps {
  /** The flat contingency report — `{ results: [...], summary: {...} }`. */
  report: any;
  /** Study-result metadata: the Details popover and the export's Summary
   *  sheet / file name. */
  meta?: any;
}

/** Renders an AC contingency analysis report results-first: one toolbar row
 *  (segmented element-type tabs with row counts, contingency filter, export,
 *  run-details popover) over a worst-first virtualized table per element type.
 *  Run provenance never occupies in-flow space — it overlays on demand. */
export const ContingencyReportView: React.FC<ContingencyReportViewProps> = ({ report, meta }) => {
  const { t } = useTranslation();

  const [nameFilter, setNameFilter] = useState('');
  const [violationsOnly, setViolationsOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsBtnRef = useRef<HTMLButtonElement>(null);

  const allRows: any[] = useMemo(() => report?.results || [], [report]);

  // Filtered rows grouped by tab. Each type gets its own table, so its columns
  // are the full set for that type with no blank cross-type cells.
  const byTab = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const groups: Record<TabKey, any[]> = { thermal: [], voltage: [], interface: [], status: [] };
    for (const v of allRows) {
      if (q && !(v.cont_name || '').toLowerCase().includes(q)) continue;
      if (violationsOnly && v.type === 'thermal' && v.violation === false) continue;
      groups[rowTab(v)].push(v);
    }
    return groups;
  }, [allRows, nameFilter, violationsOnly]);

  // Tabs to show: element types present anywhere in the report.
  const availableTabs = useMemo<TabKey[]>(() => {
    const present = new Set<TabKey>(allRows.map(rowTab));
    return TABS.map((tab) => tab.key).filter((key) => present.has(key));
  }, [allRows]);

  // The active tab falls back to the first available one when unset or stale.
  const effectiveTab =
    activeTab && availableTabs.includes(activeTab) ? activeTab : availableTabs[0] ?? null;

  if (!report) return null;

  const activeTabDef = TABS.find((tab) => tab.key === effectiveTab);
  const activeRows = effectiveTab ? byTab[effectiveTab] : [];

  return (
    <div className={styles.report}>
      <div className={styles.toolbar}>
        {availableTabs.length > 0 && (
          <Tabs
            ariaLabel={t('studyResult.title', { defaultValue: 'Study Result' })}
            tabs={availableTabs.map((key) => {
              const tab = TABS.find((tt) => tt.key === key)!;
              return {
                id: key,
                label: (
                  <span className={styles.tabLabel}>
                    {t(tab.titleKey, { defaultValue: tab.fallback })}
                    <span className={styles.tabCount}>{byTab[key].length}</span>
                  </span>
                ),
              };
            })}
            activeId={effectiveTab ?? ''}
            onChange={(id) => setActiveTab(id as TabKey)}
          />
        )}
        <div className={styles.toolbarSpacer} />
        <input
          type="text"
          className={styles.filterInput}
          placeholder={t('studyResult.filterContingency', { defaultValue: 'Filter contingency…' })}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={violationsOnly}
            onChange={(e) => setViolationsOnly(e.target.checked)}
          />
          {t('studyResult.violationsOnly', { defaultValue: 'Violations only' })}
        </label>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => exportStudyResultJson(meta, report)}
        >
          {t('studyResult.exportJson', { defaultValue: 'Export JSON' })}
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => exportStudyResultXlsx(meta, report)}
        >
          {t('studyResult.exportXlsx', { defaultValue: 'Export XLSX' })}
        </button>
        <button
          type="button"
          ref={detailsBtnRef}
          className={`${styles.toolBtn} ${detailsOpen ? styles.toolBtnActive : ''}`}
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
        >
          {t('studyResult.details', { defaultValue: 'Details' })}
        </button>
      </div>

      {allRows.length === 0 ? (
        <div className={styles.clean}>
          {t('runAnalysis.accNoViolations', { defaultValue: 'No violations found.' })}
        </div>
      ) : activeTabDef && activeRows.length > 0 ? (
        <ReportTable
          key={effectiveTab}
          columns={activeTabDef.columns}
          rows={activeRows}
          defaultSort={activeTabDef.defaultSort}
        />
      ) : (
        <div className={styles.noMatch}>
          {t('studyResult.noMatchingRows', { defaultValue: 'No rows match the filter.' })}
        </div>
      )}

      <RunInfoPopover
        open={detailsOpen}
        anchorRef={detailsBtnRef}
        meta={meta}
        summary={report.summary}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
};
