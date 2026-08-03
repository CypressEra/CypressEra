import { useCallback } from 'react';
import { useDialog, DIALOG_IDS } from '../components/common';
import { AlertModal } from '../components/common';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export const useNotification = () => {
  const { openDialog } = useDialog();

  const showNotification = useCallback(
    (title: string, message: string, type: NotificationType = 'info') => {
      openDialog(DIALOG_IDS.ALERT, AlertModal, {
        title,
        message,
        type,
      });
    },
    [openDialog]
  );

  const showSuccess = useCallback((title: string, message: string) => {
    showNotification(title, message, 'success');
  }, [showNotification]);

  const showError = useCallback((title: string, message: string) => {
    showNotification(title, message, 'error');
  }, [showNotification]);

  const showWarning = useCallback((title: string, message: string) => {
    showNotification(title, message, 'warning');
  }, [showNotification]);

  const showInfo = useCallback((title: string, message: string) => {
    showNotification(title, message, 'info');
  }, [showNotification]);

  return {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};

