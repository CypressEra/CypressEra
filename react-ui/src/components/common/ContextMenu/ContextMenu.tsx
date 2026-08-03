import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './ContextMenu.module.css';

export interface MenuItemData {
  [key: string]: any;
}

export interface SubMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  separator?: boolean;
  action?: (data?: MenuItemData) => void | Promise<void>;
  data?: MenuItemData;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  separator?: boolean;
  action?: (data?: MenuItemData) => void | Promise<void>;
  data?: MenuItemData;
  submenu?: SubMenuItem[];
}

export interface ContextMenuProps {
  items: MenuItem[];
  position?: { x: number; y: number };
  onClose?: () => void;
  className?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuState, setSubmenuState] = useState<{
    itemId: string | null;
    position: { x: number; y: number };
  } | null>(null);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate menu position
  const calculatePosition = useCallback(() => {
    if (!position || !menuRef.current) return { x: 0, y: 0 };

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Adjust if menu would overflow right
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }

    // Adjust if menu would overflow bottom
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }

    // Ensure menu doesn't go off-screen on left or top
    x = Math.max(10, x);
    y = Math.max(10, y);

    return { x, y };
  }, [position]);

  const [menuPosition, setMenuPosition] = useState(calculatePosition);

  // Update position when position prop changes
  useEffect(() => {
    setMenuPosition(calculatePosition());
  }, [position, calculatePosition]);

  // Close menu
  const handleClose = useCallback(() => {
    setSubmenuState(null);
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    onClose?.();
  }, [onClose]);

  // Handle Escape key to close menu
  useEffect(() => {
    if (!position) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, handleClose]);

  // Handle menu item click
  const handleItemClick = useCallback(
    async (item: MenuItem) => {
      if (item.disabled || item.separator) return;

      // If item has submenu, don't close on click
      if (item.submenu && item.submenu.length > 0) {
        return;
      }

      // Execute action if provided
      if (item.action) {
        try {
          await item.action(item.data);
        } catch (error) {
          console.error('Menu action error:', error);
        }
      }

      handleClose();
    },
    [handleClose]
  );

  // Handle submenu item click
  const handleSubmenuItemClick = useCallback(
    async (item: SubMenuItem) => {
      if (item.disabled || item.separator) return;

      // Execute action if provided
      if (item.action) {
        try {
          await item.action(item.data);
        } catch (error) {
          console.error('Submenu action error:', error);
        }
      }

      handleClose();
    },
    [handleClose]
  );

  // Handle mouse enter on menu item with submenu
  const handleItemMouseEnter = useCallback(
    (item: MenuItem, event: React.MouseEvent<HTMLDivElement>) => {
      // Clear any existing timeout
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
        submenuTimeoutRef.current = null;
      }

      // If item doesn't have submenu or is disabled, close submenu immediately
      if (!item.submenu || item.submenu.length === 0 || item.disabled) {
        setSubmenuState(null);
        return;
      }

      const menuItemElement = event.currentTarget;
      const menuItemRect = menuItemElement.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();

      if (!menuRect) return;

      // Calculate submenu position - no gap, flush against parent menu
      // Use the menu's right edge minus border (1px) for flush positioning
      const submenuX = menuRect.right - 1;
      const submenuY = menuItemRect.top;

      setSubmenuState({
        itemId: item.id,
        position: { x: submenuX, y: submenuY },
      });
    },
    []
  );

  // Handle mouse enter on the main menu container
  const handleMenuMouseEnter = useCallback(() => {
    // Cancel timeout when re-entering main menu
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
  }, []);

  // Handle mouse leave on the main menu container
  const handleMenuMouseLeave = useCallback(() => {
    // Only close submenu if mouse leaves the entire menu system (main menu + submenu)
    // This gives a delay to allow mouse to move to submenu
    submenuTimeoutRef.current = setTimeout(() => {
      setSubmenuState(null);
    }, 300);
  }, []);

  // Handle mouse enter on submenu
  const handleSubmenuMouseEnter = useCallback(() => {
    // Cancel timeout if mouse enters submenu
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
  }, []);

  // Handle mouse leave on submenu
  const handleSubmenuMouseLeave = useCallback(() => {
    // Close submenu with delay when leaving the submenu
    submenuTimeoutRef.current = setTimeout(() => {
      setSubmenuState(null);
    }, 100);
  }, []);

  // Get submenu for current item
  const currentSubmenu = items.find((item) => item.id === submenuState?.itemId)?.submenu;

  // Calculate submenu position
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!submenuState) {
      setSubmenuPosition(null);
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let x = submenuState.position.x;
    let y = submenuState.position.y;

    // Use estimated dimensions for initial positioning
    const estimatedWidth = 180; // min-width from CSS
    const estimatedHeight = 200; // estimated height

    // If submenu would overflow right, show it on the left side
    if (x + estimatedWidth > viewportWidth) {
      x = (menuRef.current?.getBoundingClientRect().left || 0) - estimatedWidth;
    }

    // If submenu would overflow bottom, adjust y
    if (y + estimatedHeight > viewportHeight) {
      y = viewportHeight - estimatedHeight - 10;
    }

    y = Math.max(10, y);
    x = Math.max(10, x);

    setSubmenuPosition({ x, y });
  }, [submenuState]);

  if (!position) return null;

  return (
    <>
      {/* Transparent overlay mask */}
      <div
        className={styles.overlay}
        onClick={handleClose}
        onContextMenu={(e) => {
          e.preventDefault();
          handleClose();
        }}
      />
      
      {/* Context menu */}
      <div
        ref={menuRef}
        className={`${styles.contextMenu} ${className}`}
        style={{
          left: `${menuPosition.x}px`,
          top: `${menuPosition.y}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMenuMouseEnter}
        onMouseLeave={handleMenuMouseLeave}
      >
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`separator-${index}`} className={styles.separator} />;
          }

          const hasSubmenu = item.submenu && item.submenu.length > 0;
          const isSubmenuOpen = submenuState?.itemId === item.id;

          return (
            <div
              key={item.id}
              className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''} ${
                hasSubmenu ? styles.hasSubmenu : ''
              } ${isSubmenuOpen ? styles.submenuOpen : ''}`}
              onClick={() => handleItemClick(item)}
              onMouseEnter={(e) => handleItemMouseEnter(item, e)}
            >
              <div className={styles.menuItemContent}>
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                <span className={styles.label}>{item.label}</span>
              </div>
              {hasSubmenu && (
                <span className={styles.submenuArrow}>
                  <svg
                    width="6"
                    height="10"
                    viewBox="0 0 6 10"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L1 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {currentSubmenu && submenuPosition && (
        <div
          ref={submenuRef}
          className={styles.submenu}
          style={{
            left: `${submenuPosition.x}px`,
            top: `${submenuPosition.y}px`,
          }}
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
            {currentSubmenu.map((item, index) => {
              if (item.separator) {
                return <div key={`submenu-separator-${index}`} className={styles.separator} />;
              }

              return (
                <div
                  key={item.id}
                  className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''}`}
                  onClick={() => handleSubmenuItemClick(item)}
                >
                  <div className={styles.menuItemContent}>
                    {item.icon && <span className={styles.icon}>{item.icon}</span>}
                    <span className={styles.label}>{item.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
      )}
    </>
  );
};

