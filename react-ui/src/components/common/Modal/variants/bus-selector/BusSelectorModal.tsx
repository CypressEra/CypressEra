import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './BusSelectorModal.module.css';
import { Bus } from '../../../../features/NetworkDiagram/types';
import type { GrowBusResult } from '../grow-bus-connections/GrowBusConnectionsModal';

// Rows are loaded incrementally as the user scrolls (infinite scroll). Large
// networks (tens of thousands of buses) would otherwise mount ~100k+ DOM nodes
// on open, freezing the UI. We start with PAGE_SIZE rows and append a page each
// time the user nears the bottom of the list.
const PAGE_SIZE = 200;
// Distance (px) from the bottom at which the next page is loaded.
const LOAD_MORE_THRESHOLD = 300;

export interface BusSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  buses: Bus[];
  /** When a bus is selected and confirmed. If allowGrow and "grow 1 away" is chosen, growResult is set. */
  onSelect: (busNumber: number, growResult?: GrowBusResult | null) => void;
  /** When true, show "Grow Bus Away" slider at bottom (default 1). */
  allowGrow?: boolean;
  title?: string;
  width?: number | string;
  height?: number | string;
}

export const BusSelectorModal: React.FC<BusSelectorModalProps> = ({
  isOpen,
  onClose,
  buses,
  onSelect,
  allowGrow = false,
  title,
  width = 600,
  height = 500,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBusNumber, setSelectedBusNumber] = useState<number | null>(null);
  /** When allowGrow: number of buses away to grow (default 1). */
  const [growNAway, setGrowNAway] = useState(1);

  const modalTitle = title || t('busSelector.title', 'Select Bus');

  // Filter and sort buses
  const filteredBuses = useMemo(() => {
    let filtered = buses;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = buses.filter(bus => {
        const busNumber = bus.ibus.toString();
        const busName = bus.name?.toLowerCase() || '';
        const voltage = bus.baskv?.toString() || '';
        return busNumber.includes(term) || busName.includes(term) || voltage.includes(term);
      });
    }

    // Sort by bus number (copy first so we never mutate the `buses` prop in place).
    return [...filtered].sort((a, b) => a.ibus - b.ibus);
  }, [buses, searchTerm]);

  // Infinite scroll: render the first `visibleCount` rows, appending a page when
  // the user scrolls near the bottom. Reset to the first page whenever the result
  // set changes (new search / reopen) so we never start scrolled into nothing.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [searchTerm, isOpen]);

  const displayedBuses = useMemo(
    () => filteredBuses.slice(0, visibleCount),
    [filteredBuses, visibleCount],
  );

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= LOAD_MORE_THRESHOLD) {
      setVisibleCount(c => (c < filteredBuses.length ? c + PAGE_SIZE : c));
    }
  }, [filteredBuses.length]);

  // Auto-select first result when typing in search
  useEffect(() => {
    if (searchTerm && filteredBuses.length > 0) {
      setSelectedBusNumber(filteredBuses[0].ibus);
    } else if (!searchTerm) {
      setSelectedBusNumber(null);
    }
  }, [searchTerm, filteredBuses]);

  const handleSelect = () => {
    if (selectedBusNumber === null) return;
    const growResult: GrowBusResult | undefined = allowGrow ? { mode: 'nAway', n: Math.max(0, Math.min(99, growNAway)) } : undefined;
    onSelect(selectedBusNumber, growResult);
    onClose();
    setSelectedBusNumber(null);
    setSearchTerm('');
    setGrowNAway(1);
  };

  const handleCancel = () => {
    onClose();
    setSelectedBusNumber(null);
    setSearchTerm('');
    setGrowNAway(1);
  };

  const canPlot = selectedBusNumber !== null;

  if (!isOpen) return null;

  const footer = (
    <div className={styles.footer}>
      <div className={styles.footerButtons}>
        <Button variant="secondary" size="small" onClick={handleCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          variant="primary"
          size="small"
          onClick={handleSelect}
          disabled={!canPlot}
        >
          {t('busSelector.plot', 'Plot Bus')}
        </Button>
      </div>
    </div>
  );

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      onClose={handleCancel}
      title={modalTitle}
      width={width}
      height={height}
      onEnterKey={canPlot ? handleSelect : undefined}
      footer={footer}
    >
      <div className={styles.container}>
        {/* Search input */}
        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('busSelector.searchPlaceholder', 'Search by bus number or name')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          <svg className={styles.searchIcon} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
          </svg>
        </div>

        {/* Bus list */}
        <div className={styles.busList}>
          {filteredBuses.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{t('busSelector.noBusesFound', 'No buses found')}</p>
            </div>
          ) : (
            <div className={styles.busTable}>
              <div className={styles.busTableHeader}>
                <div className={styles.headerCell}>{t('busSelector.busNumber', 'Bus #')}</div>
                <div className={styles.headerCell}>{t('busSelector.name', 'Name')}</div>
                <div className={styles.headerCell}>{t('busSelector.voltage', 'Voltage (kV)')}</div>
                <div className={styles.headerCell}>{t('busSelector.type', 'Type')}</div>
              </div>
              <div className={styles.busTableBody} ref={bodyRef} onScroll={handleListScroll}>
                {displayedBuses.map((bus) => {
                  const isSelected = selectedBusNumber === bus.ibus;
                  const busType = bus.ide === 3 ? 'Slack' : bus.ide === 2 ? 'PV' : bus.ide === 1 ? 'Load' : 'Isolated';
                  
                  return (
                    <div
                      key={bus.ibus}
                      className={`${styles.busRow} ${isSelected ? styles.selected : ''}`}
                      onClick={() => setSelectedBusNumber(bus.ibus)}
                    >
                      <div className={styles.cell}>{bus.ibus}</div>
                      <div className={styles.cell}>{bus.name || '-'}</div>
                      <div className={styles.cell}>{bus.baskv?.toFixed(1) || '-'}</div>
                      <div className={styles.cell}>{busType}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Grow Bus Away at bottom (when allowGrow) */}
        {allowGrow && (
          <div className={styles.growBar}>
            <span className={styles.growBarLabel}>{t('common:busSelector.growBusAway', 'Grow Bus Away')}</span>
            <input
              type="number"
              min={0}
              max={99}
              value={growNAway}
              onChange={(e) => setGrowNAway(Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)))}
              className={styles.growBarInput}
              aria-label={t('common:busSelector.growBusAway', 'Grow Bus Away')}
            />
          </div>
        )}
      </div>
    </BaseModal>,
    document.body
  );
};
