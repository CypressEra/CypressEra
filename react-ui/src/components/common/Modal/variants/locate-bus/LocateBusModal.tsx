import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Bus } from '../../../../features/NetworkDiagram/types';
import styles from './LocateBusModal.module.css';

export interface LocateBusModalProps {
  isOpen: boolean;
  onClose: () => void;
  buses: Bus[];
  onSelect: (busNumber: number) => void;
}

export const LocateBusModal: React.FC<LocateBusModalProps> = ({
  isOpen,
  onClose,
  buses,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBusNumber, setSelectedBusNumber] = useState<number | null>(null);

  const modalTitle = t('locateBus.title', 'Locate Bus');

  // Filter and sort buses by bus number or name
  const filteredBuses = useMemo(() => {
    if (!searchTerm) return buses;

    const term = searchTerm.toLowerCase();
    return buses.filter(bus => {
      const busNumber = bus.ibus.toString();
      const busName = bus.name?.toLowerCase() || '';
      return busNumber.includes(term) || busName.includes(term);
    });
  }, [buses, searchTerm]);

  // Sort by bus number
  const sortedBuses = useMemo(() => {
    return [...filteredBuses].sort((a, b) => a.ibus - b.ibus);
  }, [filteredBuses]);

  // Auto-select first result when typing in search
  useEffect(() => {
    if (searchTerm && sortedBuses.length > 0) {
      setSelectedBusNumber(sortedBuses[0].ibus);
    } else if (!searchTerm) {
      setSelectedBusNumber(null);
    }
  }, [searchTerm, sortedBuses]);

  const handleLocate = () => {
    if (selectedBusNumber === null) return;
    onSelect(selectedBusNumber);
    onClose();
    setSelectedBusNumber(null);
    setSearchTerm('');
  };

  const handleCancel = () => {
    onClose();
    setSelectedBusNumber(null);
    setSearchTerm('');
  };

  const canLocate = selectedBusNumber !== null;

  if (!isOpen) return null;

  const footer = (
    <div className={styles.footer}>
      <div className={styles.footerButtons}>
        <button className={styles.cancelButton} onClick={handleCancel}>
          {t('cancel', 'Cancel')}
        </button>
        <button
          className={styles.locateButton}
          onClick={handleLocate}
          disabled={!canLocate}
        >
          {t('locateBus.locate', 'Locate')}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      onClose={handleCancel}
      title={modalTitle}
      width={600}
      height={500}
      onEnterKey={canLocate ? handleLocate : undefined}
      footer={footer}
    >
      <div className={styles.container}>
        {/* Search input */}
        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('locateBus.searchPlaceholder', 'Search by bus number or name')}
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
          {sortedBuses.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{t('locateBus.notFound', 'No buses found')}</p>
            </div>
          ) : (
            <div className={styles.busTable}>
              <div className={styles.busTableHeader}>
                <div className={styles.headerCell}>{t('locateBus.busNumber', 'Bus #')}</div>
                <div className={styles.headerCell}>{t('locateBus.busName', 'Name')}</div>
                <div className={styles.headerCell}>{t('locateBus.baseKv', 'Base kV')}</div>
              </div>
              <div className={styles.busTableBody}>
                {sortedBuses.map((bus) => {
                  const isSelected = selectedBusNumber === bus.ibus;
                  return (
                    <div
                      key={bus.ibus}
                      className={`${styles.busRow} ${isSelected ? styles.selected : ''}`}
                      onClick={() => setSelectedBusNumber(bus.ibus)}
                    >
                      <div className={styles.cell}>{bus.ibus}</div>
                      <div className={styles.cell}>{bus.name || '-'}</div>
                      <div className={styles.cell}>{bus.baskv?.toFixed(1) || '-'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseModal>,
    document.body
  );
};
