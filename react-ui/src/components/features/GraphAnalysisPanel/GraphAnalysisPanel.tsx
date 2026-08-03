import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GraphAnalysisPanel.module.css';
import type { GraphAnalysisResult } from './types';
import { ShortestPathResultTable } from './ShortestPathResultTable';
import { NeighbourElementsResultTabs } from './NeighbourElementsResultTabs';

export interface GraphAnalysisPanelProps {
  result: GraphAnalysisResult | null;
  onClose: () => void;
  hasUnsavedChanges?: boolean;
}

export const GraphAnalysisPanel: React.FC<GraphAnalysisPanelProps> = ({
  result,
  onClose,
  hasUnsavedChanges = false,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!result) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [result, onClose]);

  if (!result) return null;

  const renderHeader = () => {
    switch (result.kind) {
      case 'shortestPath':
        return t(
          'common:graphAnalysis.shortestPath.panelHeader',
          'Shortest Path: Bus {{src}} → Bus {{tgt}} — {{n}} levels',
          { src: result.sourceBus, tgt: result.targetBus, n: result.path.length - 1 },
        );
      case 'neighbourElements':
        return t(
          'common:graphAnalysis.neighbourElements.panelHeader',
          'Neighbour Elements: {{n}} buses away from Bus {{src}} — {{total}} elements',
          { n: result.n, src: result.sourceBus, total: result.elements.length },
        );
      case 'noPath':
        return t(
          'common:graphAnalysis.shortestPath.panelHeader',
          'Shortest Path: Bus {{src}} → Bus {{tgt}}',
          { src: result.sourceBus, tgt: result.targetBus, n: 0 },
        );
      case 'noElements':
        return t(
          'common:graphAnalysis.neighbourElements.panelHeader',
          'Neighbour Elements: {{n}} buses away from Bus {{src}} — 0 elements',
          { n: result.n, src: result.sourceBus, total: 0 },
        );
    }
  };

  const renderContent = () => {
    switch (result.kind) {
      case 'shortestPath':
        return <ShortestPathResultTable path={result.path} />;
      case 'neighbourElements':
        return <NeighbourElementsResultTabs elements={result.elements} />;
      case 'noPath':
        return (
          <p className={styles.emptyState}>
            {t(
              'common:graphAnalysis.noPath',
              'No path found — buses {{src}} and {{tgt}} are not connected in the in-service network.',
              { src: result.sourceBus, tgt: result.targetBus },
            )}
          </p>
        );
      case 'noElements':
        return (
          <p className={styles.emptyState}>
            {t(
              'common:graphAnalysis.neighbourElements.noResults',
              'No elements found within {{n}} buses of bus {{src}} in the in-service network.',
              { n: result.n, src: result.sourceBus },
            )}
          </p>
        );
    }
  };

  return (
    <div className={styles.panel} role="region" aria-label={t('common:graphAnalysis.panelAriaLabel', 'Graph Analysis Results')}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{renderHeader()}</span>
        <div className={styles.panelActions}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t('common:graphAnalysis.dismiss', 'Dismiss')}
            title={t('common:graphAnalysis.dismiss', 'Dismiss')}
          >
            ✕
          </button>
        </div>
      </div>
      {hasUnsavedChanges && (
        <div className={styles.unsavedBanner}>
          {t('common:graphAnalysis.unsavedChanges', 'Network has unsaved changes — results may not match saved data.')}
        </div>
      )}
      <div className={styles.panelBody}>
        {renderContent()}
      </div>
    </div>
  );
};
