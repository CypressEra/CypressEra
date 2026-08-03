import React from 'react';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './AlertModal.module.css';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: AlertType;
  width?: number | string;
  buttonText?: string;
  onButtonClick?: () => void;
  // Confirmation mode (two buttons)
  confirmMode?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  width = 400,
  buttonText = 'OK',
  onButtonClick,
  confirmMode = false,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
}) => {
  const handleButtonClick = () => {
    if (onButtonClick) {
      onButtonClick();
      // Close modal after button click action
      onClose();
    } else {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const primaryAction = confirmMode ? handleConfirm : handleButtonClick;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={width}
      modal={true}
      onEnterKey={primaryAction}
      footer={confirmMode ? (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="small"
            onClick={onClose}
          >
            {cancelText}
          </Button>
          <Button
            variant={type === 'error' || type === 'warning' ? 'danger' : 'primary'}
            size="small"
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </div>
      ) : undefined}
    >
      <div className={styles.notificationContent} data-type={type}>
        <p className={styles.message}>{message}</p>
        {!confirmMode && (
          <Button
            variant="primary"
            size="small"
            onClick={handleButtonClick}
            className={styles.button}
          >
            {buttonText}
          </Button>
        )}
      </div>
    </BaseModal>
  );
};
