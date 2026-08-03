import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styles from './BaseModal.module.css';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  modal?: boolean;
  maskClosable?: boolean;
  draggable?: boolean;
  resizable?: boolean;
  width?: number | string;
  height?: number | string;
  className?: string;
  showCloseButton?: boolean;
  showTrafficLights?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
  footer?: React.ReactNode;
  zIndex?: number;
  /** When provided, Enter key triggers this (e.g. primary button). Not fired when focus is in textarea or contenteditable. */
  onEnterKey?: () => void;
}

export type ModalProps = BaseModalProps;

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title = 'Modal',
  children,
  modal = false,
  maskClosable = true,
  draggable = true,
  resizable = false,
  width = 600,
  height = 'auto',
  className = '',
  showCloseButton = true,
  showTrafficLights = true,
  onMinimize,
  onMaximize,
  isMaximized = false,
  footer,
  zIndex,
  onEnterKey,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isHoveringHeader, setIsHoveringHeader] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [modalSize, setModalSize] = useState({ width: typeof width === 'number' ? width : 600, height: typeof height === 'number' ? height : 400 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [animationComplete, setAnimationComplete] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!draggable || isMaximized) return;

      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.trafficLights}`) || target.closest(`.${styles.closeButton}`)) {
        return;
      }

      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [draggable, isMaximized, position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!modalRef.current || !headerRef.current) return;

      const modal = modalRef.current;
      const header = headerRef.current;
      const headerHeight = header.offsetHeight;
      const modalHeight = modal.offsetHeight;
      const modalWidth = modal.offsetWidth;

      // Calculate viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate new position
      let newX = e.clientX - dragStart.x;
      let newY = e.clientY - dragStart.y;

      // The modal is positioned at top: 50%, left: 50% and then translated by -50% to center it
      // Then offset by position.x and position.y
      // So the actual top position is: viewportHeight * 0.5 - modalHeight/2 + newY
      // We want the header (top of modal) to be at least at 0px from top of viewport
      // Calculate minY: modalTop = viewportHeight * 0.5 - modalHeight/2 + newY >= 0
      // So: newY >= -viewportHeight * 0.5 + modalHeight/2
      const minY = -viewportHeight * 0.5 + modalHeight / 2; // Allow dragging to top of viewport
      const maxY = viewportHeight * 0.5 - modalHeight / 2; // Keep bottom of modal at bottom of viewport

      // For X: modal is at left: 50% and translated by -50%, then offset by newX
      // Actual left position: viewportWidth * 0.5 - modalWidth/2 + newX
      const minX = -viewportWidth * 0.5 + modalWidth / 2; // Keep left edge at left of viewport
      const maxX = viewportWidth * 0.5 - modalWidth / 2; // Keep right edge at right of viewport

      newY = Math.max(minY, Math.min(maxY, newY));
      newX = Math.max(minX, Math.min(maxX, newX));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleMaskClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!maskClosable || !modal || !modalRef.current) return;

    // Get click position relative to viewport
    const clickX = e.clientX;
    const clickY = e.clientY;

    // Get modal bounding box
    const modalRect = modalRef.current.getBoundingClientRect();
    const margin = 6; // 6px margin on all sides

    // Check if click is within 6px of modal border (top, left, right, bottom)
    const isNearBorder = 
      (clickX >= modalRect.left - margin && clickX <= modalRect.left + margin) || // Left edge
      (clickX >= modalRect.right - margin && clickX <= modalRect.right + margin) || // Right edge
      (clickY >= modalRect.top - margin && clickY <= modalRect.top + margin) || // Top edge
      (clickY >= modalRect.bottom - margin && clickY <= modalRect.bottom + margin); // Bottom edge

    // Don't close if click is within 3px of border
    if (isNearBorder) {
      return;
    }

    onClose();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Resize handlers
  const handleResizeStart = useCallback((direction: string, e: React.MouseEvent) => {
    if (!resizable || isMaximized || !modalRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(direction);

    const rect = modalRef.current.getBoundingClientRect();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    });

    if (direction.includes('right')) {
      document.body.style.cursor = 'ew-resize';
    } else if (direction.includes('bottom')) {
      document.body.style.cursor = 'ns-resize';
    } else if (direction.includes('corner')) {
      document.body.style.cursor = 'nwse-resize';
    }
  }, [resizable, isMaximized]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!modalRef.current) return;

      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newPositionX = position.x;
      let newPositionY = position.y;

      if (isResizing.includes('right')) {
        newWidth = Math.max(300, Math.min(window.innerWidth - 40, resizeStart.width + deltaX));
        // Adjust position to keep left edge stationary when resizing from right
        const widthDiff = newWidth - resizeStart.width;
        newPositionX = position.x + widthDiff / 2;
      }
      if (isResizing.includes('left')) {
        const widthChange = resizeStart.x - e.clientX;
        newWidth = Math.max(300, Math.min(window.innerWidth - 40, resizeStart.width + widthChange));
        // Adjust position to keep right edge stationary when resizing from left
        const widthDiff = newWidth - resizeStart.width;
        newPositionX = position.x - widthDiff / 2;
      }
      if (isResizing.includes('bottom')) {
        newHeight = Math.max(200, Math.min(window.innerHeight - 40, resizeStart.height + deltaY));
        // Adjust position to keep top edge stationary when resizing from bottom
        const heightDiff = newHeight - resizeStart.height;
        newPositionY = position.y + heightDiff / 2;
      }

      setModalSize({ width: newWidth, height: newHeight });
      if (isResizing.includes('right') || isResizing.includes('left')) {
        setPosition(prev => ({ ...prev, x: newPositionX }));
      }
      if (isResizing.includes('bottom')) {
        setPosition(prev => ({ ...prev, y: newPositionY }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeStart]);

  // Initialize modal size from props
  useEffect(() => {
    if (isOpen && !isMaximized) {
      setModalSize({
        width: typeof width === 'number' ? width : 600,
        height: typeof height === 'number' ? height : 400,
      });
    }
  }, [isOpen, width, height, isMaximized]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter' && onEnterKey) {
        const activeEl = document.activeElement;
        if (activeEl) {
          const tagName = activeEl.tagName.toLowerCase();
          const isTextarea = tagName === 'textarea';
          const isContentEditable = (activeEl as HTMLElement).isContentEditable;
          if (isTextarea || isContentEditable) return;
        }
        e.preventDefault();
        onEnterKey();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onEnterKey]);

  useEffect(() => {
    if (isOpen) {
      // Reset position to center when modal opens
      setPosition({ x: 0, y: 0 });
      // Mark animation as complete after animation duration
      const timer = setTimeout(() => {
        setAnimationComplete(true);
      }, 350); // Match animation duration
      return () => clearTimeout(timer);
    } else {
      setAnimationComplete(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = {
    width: isMaximized ? '100vw' : (resizable ? `${modalSize.width}px` : (typeof width === 'number' ? `${width}px` : width)),
    height: isMaximized ? '100vh' : (resizable ? `${modalSize.height}px` : (typeof height === 'number' ? `${height}px` : height)),
    transform: isMaximized
      ? 'translate(0, 0)'
      : `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
    zIndex: zIndex !== undefined ? zIndex : undefined,
    transition: (isDragging || isResizing) ? 'none' : undefined, // Let CSS handle transitions
  };

  const overlayStyle: React.CSSProperties = {
    zIndex: zIndex !== undefined ? zIndex - 1 : undefined,
  };

  return (
    <div className={styles.modalOverlay} style={overlayStyle}>
      {modal && (
        <div
          className={styles.modalMask}
          onClick={handleMaskClick}
          role="button"
          tabIndex={-1}
        />
      )}

      <div
        ref={modalRef}
        className={`${styles.modal} ${isMaximized ? styles.maximized : ''} ${
          isDragging ? styles.dragging : ''
        } ${isResizing ? styles.resizing : ''} ${animationComplete ? styles.animationComplete : ''} ${className}`}
        style={modalStyle}
        onClick={handleModalClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div
          ref={headerRef}
          className={`${styles.modalHeader} ${draggable && !isMaximized ? styles.draggable : ''}`}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringHeader(true)}
          onMouseLeave={() => setIsHoveringHeader(false)}
          onDoubleClick={(e) => {
            // Prevent double-click from triggering drag
            e.stopPropagation();
            // Only toggle maximize if resizable is enabled and onMaximize handler exists
            if (resizable && onMaximize) {
              onMaximize();
            }
          }}
        >
          {showTrafficLights && (
            <div className={`${styles.trafficLights} ${isHoveringHeader ? styles.showIcons : ''}`}>
              <button
                className={`${styles.trafficLight} ${styles.close}`}
                onClick={onClose}
                title="Close"
                type="button"
              >
                <svg viewBox="0 0 12 12" className={styles.icon}>
                  <path d="M 2 2 L 10 10 M 10 2 L 2 10" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              {onMinimize && (
                <button
                  className={`${styles.trafficLight} ${styles.minimize}`}
                  onClick={onMinimize}
                  title="Minimize"
                  type="button"
                >
                  <svg viewBox="0 0 12 12" className={styles.icon}>
                    <path d="M 2 6 L 10 6" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              )}
              {onMaximize && (
                <button
                  className={`${styles.trafficLight} ${styles.maximize}`}
                  onClick={onMaximize}
                  title={isMaximized ? 'Restore' : 'Maximize'}
                  type="button"
                >
                  <svg viewBox="0 0 12 12" className={styles.icon} key={isMaximized ? 'maximized' : 'minimized'}>
                    {isMaximized ? (
                      // Restore icon: >< (inward, pointing toward each other)
                      <>
                        <path d="M 5 6 L 1 1.5 L 1 10.5 Z" fill="currentColor" />
                        <path d="M 7 6 L 11 1.5 L 11 10.5 Z" fill="currentColor" />
                      </>
                    ) : (
                      // Maximize icon: <> (outward, pointing away from each other)  
                      <>
                        <path d="M 1 6 L 5 1.5 L 5 10.5 Z" fill="currentColor" />
                        <path d="M 11 6 L 7 1.5 L 7 10.5 Z" fill="currentColor" />
                      </>
                    )}
                  </svg>
                </button>
              )}
            </div>
          )}

          <div className={styles.modalTitle} id="modal-title">
            {title}
          </div>

          {showCloseButton && !showTrafficLights && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              title="Close"
              type="button"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M 4 4 L 12 12 M 12 4 L 4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div
          className={styles.modalContent}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && draggable && !isMaximized) {
              handleMouseDown(e as any);
            }
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            className={styles.modalFooter}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && draggable && !isMaximized) {
                handleMouseDown(e as any);
              }
            }}
          >
            {footer}
          </div>
        )}

        {resizable && !isMaximized && (
          <>
            <div
              className={styles.resizeHandleLeft}
              onMouseDown={(e) => handleResizeStart('left', e)}
            />
            <div
              className={styles.resizeHandleRight}
              onMouseDown={(e) => handleResizeStart('right', e)}
            />
            <div
              className={styles.resizeHandleBottom}
              onMouseDown={(e) => handleResizeStart('bottom', e)}
            />
            <div
              className={styles.resizeHandleCorner}
              onMouseDown={(e) => handleResizeStart('right-bottom', e)}
            />
          </>
        )}
      </div>
    </div>
  );
};
