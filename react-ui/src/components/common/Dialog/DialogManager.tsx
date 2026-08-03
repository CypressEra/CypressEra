import React from 'react';
import { useDialogContext } from './DialogProvider';

export const DialogManager: React.FC = () => {
  const { dialogs, closeDialog } = useDialogContext();

  return (
    <>
      {Array.from(dialogs.values()).map((dialog) => {
        const DialogComponent = dialog.component;
        return (
          <DialogComponent
            key={dialog.id}
            isOpen={dialog.isOpen}
            onClose={() => closeDialog(dialog.id)}
            {...dialog.props}
          />
        );
      })}
    </>
  );
};

