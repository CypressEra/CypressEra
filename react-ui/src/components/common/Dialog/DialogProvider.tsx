import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type DialogId = string;

export interface DialogState {
  id: DialogId;
  component: React.ComponentType<any>;
  props?: Record<string, any>;
  isOpen: boolean;
}

interface DialogContextValue {
  dialogs: Map<DialogId, DialogState>;
  openDialog: (id: DialogId, component: React.ComponentType<any>, props?: Record<string, any>) => void;
  closeDialog: (id: DialogId) => void;
  isDialogOpen: (id: DialogId) => boolean;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export const useDialogContext = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialogContext must be used within DialogProvider');
  }
  return context;
};

interface DialogProviderProps {
  children: ReactNode;
}

export const DialogProvider: React.FC<DialogProviderProps> = ({ children }) => {
  const [dialogs, setDialogs] = useState<Map<DialogId, DialogState>>(new Map());

  const openDialog = useCallback((id: DialogId, component: React.ComponentType<any>, props?: Record<string, any>) => {
    setDialogs(prev => {
      const newMap = new Map(prev);
      newMap.set(id, {
        id,
        component,
        props,
        isOpen: true,
      });
      return newMap;
    });
  }, []);

  const closeDialog = useCallback((id: DialogId) => {
    setDialogs(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(id);
      if (existing) {
        newMap.set(id, { ...existing, isOpen: false });
        // Remove from map after a short delay to allow animations
        setTimeout(() => {
          setDialogs(current => {
            const updated = new Map(current);
            updated.delete(id);
            return updated;
          });
        }, 200);
      }
      return newMap;
    });
  }, []);

  const isDialogOpen = useCallback((id: DialogId) => {
    return dialogs.get(id)?.isOpen ?? false;
  }, [dialogs]);

  const value: DialogContextValue = {
    dialogs,
    openDialog,
    closeDialog,
    isDialogOpen,
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
    </DialogContext.Provider>
  );
};

