import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './NeighbourElementsModal.module.css';
import type { NeighbourElement } from '../../../../features/NetworkDiagram/utils/graphAnalysisService';
import { GraphAnalysisService } from '../../../../features/NetworkDiagram/utils/graphAnalysisService';
import type { NetworkDataset } from '../../../../features/NetworkDiagram/types';
import { NeighbourElementsResultTabs } from '../../../../features/GraphAnalysisPanel/NeighbourElementsResultTabs';

const service = new GraphAnalysisService();

export interface NeighbourElementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBusNumber: number | null;
  data: NetworkDataset;
  width?: number | string;
}

export const NeighbourElementsModal: React.FC<NeighbourElementsModalProps> = ({
  isOpen,
  onClose,
  sourceBusNumber,
  data,
  width = 620,
}) => {
  const { t } = useTranslation();
  const [busInput, setBusInput] = useState(sourceBusNumber != null ? String(sourceBusNumber) : '');
  const [n, setN] = useState(1);
  const [result, setResult] = useState<NeighbourElement[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchedBus, setSearchedBus] = useState<number | null>(null);
  const [searchedN, setSearchedN] = useState(1);

  const parsedBus = (() => {
    const v = parseInt(busInput.trim(), 10);
    return Number.isNaN(v) ? null : v;
  })();

  const handleSearch = () => {
    if (parsedBus === null) return;
    const elements = service.findNeighbourElements(data, parsedBus, n, ['All']);
    setResult(elements);
    setSearched(true);
    setSearchedBus(parsedBus);
    setSearchedN(n);
  };

  const handleClose = () => {
    setBusInput(sourceBusNumber != null ? String(sourceBusNumber) : '');
    setN(1);
    setResult(null);
    setSearched(false);
    setSearchedBus(null);
    setSearchedN(1);
    onClose();
  };

  if (!isOpen) return null;

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose}>
        {t('common:cancel', 'Cancel')}
      </Button>
      <Button variant="primary" onClick={handleSearch} disabled={parsedBus === null}>
        {t('common:graphAnalysis.neighbourElements.search', 'Search')}
      </Button>
    </>
  );

  const renderResults = () => {
    if (!searched || result === null) {
      return (
        <div className={styles.placeholder}>
          {t('common:graphAnalysis.neighbourElements.placeholder', 'Set the bus and levels, then click Search')}
        </div>
      );
    }
    if (result.length === 0) {
      return (
        <div className={styles.emptyResult}>
          {t(
            'common:graphAnalysis.neighbourElements.noResults',
            'No elements found within {{n}} levels of bus {{src}} in the in-service network.',
            { n: searchedN, src: searchedBus },
          )}
        </div>
      );
    }
    return <NeighbourElementsResultTabs elements={result} />;
  };

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('common:graphAnalysis.neighbourElements.title', 'Find Neighbour Elements')}
      width={width}
      height={520}
      onEnterKey={parsedBus !== null ? handleSearch : undefined}
      footer={footer}
    >
      <div className={styles.container}>
        <div className={styles.searchBar}>
          <div className={styles.searchRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="ne-bus">
                {t('common:graphAnalysis.neighbourElements.sourceBus', 'Bus')}
              </label>
              <input
                id="ne-bus"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={styles.input}
                placeholder={t('common:graphAnalysis.shortestPath.busPlaceholder', 'Bus number')}
                value={busInput}
                onChange={(e) => setBusInput(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="ne-n">
                {t('common:graphAnalysis.neighbourElements.nAway', 'Levels Away')}
              </label>
              <input
                id="ne-n"
                type="number"
                min={1}
                max={99}
                value={n}
                className={styles.numberInput}
                autoFocus
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setN(Number.isNaN(val) || val < 1 ? 1 : Math.min(99, val));
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.separator} />

        <div className={styles.resultsPane}>
          {renderResults()}
        </div>
      </div>
    </BaseModal>,
    document.body,
  );
};
