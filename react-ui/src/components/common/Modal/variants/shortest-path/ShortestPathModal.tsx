import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './ShortestPathModal.module.css';
import type { Bus, NetworkDataset } from '../../../../features/NetworkDiagram/types';
import { GraphAnalysisService } from '../../../../features/NetworkDiagram/utils/graphAnalysisService';
import type { ShortestPathResult } from '../../../../features/NetworkDiagram/utils/graphAnalysisService';

const BUS_TYPE_LABEL: Record<number, string> = {
  1: 'Load',
  2: 'Gen',
  3: 'Slack',
  4: 'Isolated',
};

const service = new GraphAnalysisService();

export interface ShortestPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBusNumber: number | null;
  buses: Bus[];
  data: NetworkDataset;
  width?: number | string;
}

export const ShortestPathModal: React.FC<ShortestPathModalProps> = ({
  isOpen,
  onClose,
  sourceBusNumber,
  buses,
  data,
  width = 520,
}) => {
  const { t } = useTranslation();
  const [sourceInput, setSourceInput] = useState(sourceBusNumber != null ? String(sourceBusNumber) : '');
  const [targetInput, setTargetInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortestPathResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchedSource, setSearchedSource] = useState<number | null>(null);
  const [searchedTarget, setSearchedTarget] = useState<number | null>(null);

  const busNumbersSet = useMemo(() => new Set(buses.map((b) => b.ibus)), [buses]);

  const parsedSource = useMemo(() => {
    const n = parseInt(sourceInput.trim(), 10);
    return Number.isNaN(n) ? null : n;
  }, [sourceInput]);

  const parsedTarget = useMemo(() => {
    const n = parseInt(targetInput.trim(), 10);
    return Number.isNaN(n) ? null : n;
  }, [targetInput]);

  const canSearch = parsedSource !== null && parsedTarget !== null;

  const handleSearch = () => {
    if (parsedSource === null || parsedTarget === null) return;

    if (parsedSource === parsedTarget) {
      setValidationError(
        t('common:graphAnalysis.shortestPath.sameSourceTarget', 'Source and target bus must be different.')
      );
      return;
    }

    if (!busNumbersSet.has(parsedSource)) {
      setValidationError(
        t('common:graphAnalysis.shortestPath.busNotFound', 'Bus {{n}} not found in the network.', { n: parsedSource })
      );
      return;
    }

    if (!busNumbersSet.has(parsedTarget)) {
      setValidationError(
        t('common:graphAnalysis.shortestPath.busNotFound', 'Bus {{n}} not found in the network.', { n: parsedTarget })
      );
      return;
    }

    setValidationError(null);
    const r = service.findShortestPath(data, parsedSource, parsedTarget);
    setResult(r);
    setSearched(true);
    setSearchedSource(parsedSource);
    setSearchedTarget(parsedTarget);
  };

  const handleClose = () => {
    setSourceInput(sourceBusNumber != null ? String(sourceBusNumber) : '');
    setTargetInput('');
    setValidationError(null);
    setResult(null);
    setSearched(false);
    setSearchedSource(null);
    setSearchedTarget(null);
    onClose();
  };

  if (!isOpen) return null;

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        {t('common:cancel', 'Cancel')}
      </Button>
      <Button variant="primary" onClick={handleSearch} disabled={!canSearch}>
        {t('common:graphAnalysis.shortestPath.search', 'Search')}
      </Button>
    </>
  );

  const renderResults = () => {
    if (!searched || result === null) {
      return (
        <div className={styles.placeholder}>
          {t('common:graphAnalysis.shortestPath.placeholder', 'Enter bus numbers and click Search')}
        </div>
      );
    }
    if (!result.found) {
      return (
        <div className={styles.emptyResult}>
          {t(
            'common:graphAnalysis.noPath',
            'No path found — buses {{src}} and {{tgt}} are not connected in the in-service network.',
            { src: searchedSource, tgt: searchedTarget },
          )}
        </div>
      );
    }
    return (
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('common:graphAnalysis.columns.level', 'Level')}</th>
              <th>{t('common:graphAnalysis.columns.busNumber', 'Bus No.')}</th>
              <th>{t('common:graphAnalysis.columns.busName', 'Bus Name')}</th>
              <th>{t('common:graphAnalysis.columns.baseKv', 'Base kV')}</th>
              <th>{t('common:graphAnalysis.columns.busType', 'Type')}</th>
            </tr>
          </thead>
          <tbody>
            {result.path.map((row) => (
              <tr key={row.busNumber}>
                <td className={styles.centerCell}>{row.hop}</td>
                <td className={styles.centerCell}>{row.busNumber}</td>
                <td>{row.busName || '—'}</td>
                <td className={styles.centerCell}>{row.baseKv > 0 ? row.baseKv.toFixed(1) : '—'}</td>
                <td className={styles.centerCell}>{BUS_TYPE_LABEL[row.busType] ?? row.busType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('common:graphAnalysis.shortestPath.title', 'Find Shortest Path')}
      width={width}
      height={460}
      onEnterKey={canSearch ? handleSearch : undefined}
      footer={footer}
    >
      <div className={styles.container}>
        {/* Search bar — always visible */}
        <div className={styles.searchBar}>
          <div className={styles.searchRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="sp-source-bus">
                {t('common:graphAnalysis.shortestPath.sourceBus', 'From')}
              </label>
              <input
                id="sp-source-bus"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={styles.input}
                placeholder={t('common:graphAnalysis.shortestPath.busPlaceholder', 'Bus number')}
                value={sourceInput}
                onChange={(e) => {
                  setSourceInput(e.target.value);
                  setValidationError(null);
                }}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="sp-target-bus">
                {t('common:graphAnalysis.shortestPath.targetBus', 'To')}
              </label>
              <input
                id="sp-target-bus"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={styles.input}
                placeholder={t('common:graphAnalysis.shortestPath.busPlaceholder', 'Bus number')}
                value={targetInput}
                autoFocus
                onChange={(e) => {
                  setTargetInput(e.target.value);
                  setValidationError(null);
                }}
              />
            </div>
          </div>
          {validationError && <p className={styles.validationError}>{validationError}</p>}
        </div>

        {/* Separator */}
        <div className={styles.separator} />

        {/* Results pane — always present */}
        <div className={styles.resultsPane}>
          {renderResults()}
        </div>
      </div>
    </BaseModal>,
    document.body,
  );
};
