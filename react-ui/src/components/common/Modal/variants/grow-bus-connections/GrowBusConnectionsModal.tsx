import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './GrowBusConnectionsModal.module.css';
import type { Bus } from '../../../../features/NetworkDiagram/types';

export type GrowBusMode = 'nAway' | 'toBus';

export interface GrowBusResultNAway {
  mode: 'nAway';
  n: number;
}

export interface GrowBusResultToBus {
  mode: 'toBus';
  targetBusNumber: number;
}

export type GrowBusResult = GrowBusResultNAway | GrowBusResultToBus;

export interface GrowBusConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBusNumber: number;
  buses: Bus[];
  onConfirm: (result: GrowBusResult) => void;
  title?: string;
  width?: number | string;
  height?: number | string;
}

export const GrowBusConnectionsModal: React.FC<GrowBusConnectionsModalProps> = ({
  isOpen,
  onClose,
  sourceBusNumber,
  buses,
  onConfirm,
  title,
  width = 440,
  height = 'auto',
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GrowBusMode>('nAway');
  const [nValue, setNValue] = useState<number>(1);
  const [targetBusInput, setTargetBusInput] = useState('');
  const [showBusValidation, setShowBusValidation] = useState(false);

  const modalTitle = title ?? t('common:networkDiagram.growBusConnections.title', 'Grow Bus Connections');

  const busNumbersSet = useMemo(() => {
    const set = new Set<number>();
    buses.forEach(b => set.add(b.ibus));
    return set;
  }, [buses]);

  const parsedTargetBus = useMemo(() => {
    const trimmed = targetBusInput.trim();
    if (trimmed === '') return null;
    const num = parseInt(trimmed, 10);
    return Number.isNaN(num) ? null : num;
  }, [targetBusInput]);

  const isTargetBusValid = useMemo(() => {
    if (parsedTargetBus === null) return false;
    return busNumbersSet.has(parsedTargetBus) && parsedTargetBus !== sourceBusNumber;
  }, [parsedTargetBus, busNumbersSet, sourceBusNumber]);

  const handleApply = () => {
    if (mode === 'nAway') {
      const n = Math.max(1, Math.floor(nValue));
      onConfirm({ mode: 'nAway', n });
      onClose();
      setNValue(1);
      setTargetBusInput('');
      return;
    }
    if (mode === 'toBus') {
      if (!isTargetBusValid) {
        setShowBusValidation(true);
        return;
      }
      if (parsedTargetBus !== null) {
        onConfirm({ mode: 'toBus', targetBusNumber: parsedTargetBus });
      }
      onClose();
      setTargetBusInput('');
      setShowBusValidation(false);
    }
  };

  const handleCancel = () => {
    onClose();
    setMode('nAway');
    setNValue(1);
    setTargetBusInput('');
    setShowBusValidation(false);
  };

  const canApply = mode === 'nAway' || (mode === 'toBus' && targetBusInput.trim() !== '');

  if (!isOpen) return null;

  const footer = (
    <>
      <Button variant="secondary" onClick={handleCancel}>
        {t('common:cancel', 'Cancel')}
      </Button>
      <Button
        variant="primary"
        onClick={handleApply}
        disabled={!canApply}
      >
        {t('common:networkDiagram.growBusConnections.apply', 'Apply')}
      </Button>
    </>
  );

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      onClose={handleCancel}
      title={modalTitle}
      width={width}
      height={height}
      onEnterKey={canApply ? handleApply : undefined}
      footer={footer}
    >
      <div className={styles.container}>
        <p className={styles.sourceBus}>
          {t('common:networkDiagram.growBusConnections.fromBus', 'From bus')}: <strong>{sourceBusNumber}</strong>
        </p>

        <div className={styles.modeGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="growMode"
              checked={mode === 'nAway'}
              onChange={() => {
                setMode('nAway');
                setShowBusValidation(false);
              }}
              className={styles.radio}
            />
            <span>{t('common:networkDiagram.growBusConnections.nAway', 'Grow by N buses away')}</span>
          </label>
          {mode === 'nAway' && (
            <div className={styles.nInputRow}>
              <input
                type="number"
                min={1}
                max={99}
                value={nValue}
                onChange={(e) => setNValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={styles.numberInput}
                aria-label={t('common:networkDiagram.growBusConnections.busesAway', 'buses away')}
              />
              <span className={styles.nHint}>
                {t('common:networkDiagram.growBusConnections.busesAway', 'buses away')}
              </span>
            </div>
          )}
        </div>

        <div className={styles.modeGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="growMode"
              checked={mode === 'toBus'}
              onChange={() => setMode('toBus')}
              className={styles.radio}
            />
            <span>{t('common:networkDiagram.growBusConnections.toBus', 'Grow to designated bus')}</span>
          </label>
          {mode === 'toBus' && (
            <div className={styles.busInputRow}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={targetBusInput}
                onChange={(e) => {
                  setTargetBusInput(e.target.value);
                  setShowBusValidation(false);
                }}
                placeholder={t('common:networkDiagram.growBusConnections.enterBusNumber', 'Enter bus number')}
                className={styles.busNumberInput}
                aria-label={t('common:networkDiagram.growBusConnections.enterBusNumber', 'Enter bus number')}
              />
              {showBusValidation && (
                <span className={styles.validationHint}>
                  {t('common:networkDiagram.growBusConnections.busNotFound', 'Bus number not found')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </BaseModal>,
    document.body
  );
};
