import { useCallback, ComponentType } from 'react';
import { useDialogContext, DialogId } from './DialogProvider';

/**
 * Hook to manage dialogs programmatically
 * 
 * @example
 * ```tsx
 * const { openDialog, closeDialog } = useDialog();
 * 
 * // Open a dialog
 * openDialog('about', About, {});
 * 
 * // Close a dialog
 * closeDialog('about');
 * ```
 */
export const useDialog = () => {
  const { openDialog, closeDialog, isDialogOpen } = useDialogContext();

  const open = useCallback(<T extends Record<string, any> = {}>(
    id: DialogId,
    component: ComponentType<T>,
    props?: Omit<T, 'isOpen' | 'onClose'>
  ) => {
    openDialog(id, component as ComponentType<any>, props);
  }, [openDialog]);

  const close = useCallback((id: DialogId) => {
    closeDialog(id);
  }, [closeDialog]);

  const isOpen = useCallback((id: DialogId) => {
    return isDialogOpen(id);
  }, [isDialogOpen]);

  return {
    openDialog: open,
    closeDialog: close,
    isDialogOpen: isOpen,
  };
};

