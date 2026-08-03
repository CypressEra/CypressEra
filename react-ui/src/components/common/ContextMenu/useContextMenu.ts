import { useState, useCallback, useRef, useEffect } from 'react';
import { MenuItem, MenuItemData } from './ContextMenu';

export interface UseContextMenuOptions {
  items: MenuItem[];
  onClose?: () => void;
}

export interface UseContextMenuReturn {
  contextMenu: {
    isOpen: boolean;
    position: { x: number; y: number } | null;
    items: MenuItem[];
  };
  showContextMenu: (event: React.MouseEvent | MouseEvent, items?: MenuItem[]) => void;
  hideContextMenu: () => void;
  updateItems: (items: MenuItem[]) => void;
}

/**
 * Hook for managing context menu state and interactions
 * 
 * @example
 * ```tsx
 * const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
 *   items: [
 *     { id: 'copy', label: 'Copy', action: () => console.log('Copy') },
 *     { id: 'paste', label: 'Paste', action: () => console.log('Paste') },
 *   ],
 * });
 * 
 * return (
 *   <div onContextMenu={(e) => showContextMenu(e)}>
 *     <ContextMenu
 *       items={contextMenu.items}
 *       position={contextMenu.position}
 *       onClose={hideContextMenu}
 *     />
 *   </div>
 * );
 * ```
 */
export const useContextMenu = (
  options: UseContextMenuOptions
): UseContextMenuReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [items, setItems] = useState<MenuItem[]>(options.items);
  const optionsRef = useRef(options);

  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Note: We don't sync options.items to state here because:
  // 1. It causes infinite loops when passing new array references on each render
  // 2. We're using custom items via showContextMenu() anyway
  // If you need default items, pass them directly to showContextMenu or use updateItems

  const showContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, customItems?: MenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();

      const menuItems = customItems || optionsRef.current.items;
      
      if (menuItems.length === 0) {
        return;
      }

      // Set all state updates together
      setItems(menuItems);
      setPosition({ x: event.clientX, y: event.clientY });
      setIsOpen(true);
    },
    []
  );

  const hideContextMenu = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
    optionsRef.current.onClose?.();
  }, []);

  const updateItems = useCallback((newItems: MenuItem[]) => {
    setItems(newItems);
  }, []);

  return {
    contextMenu: {
      isOpen,
      position,
      items,
    },
    showContextMenu,
    hideContextMenu,
    updateItems,
  };
};

