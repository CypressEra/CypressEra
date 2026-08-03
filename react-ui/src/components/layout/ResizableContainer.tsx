import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ResizableContainer.css';

interface ResizableContainerProps {
  children: React.ReactNode | ((isExpanded: boolean, toggle: () => void, isTransitioning: boolean) => React.ReactNode);
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  className?: string;
  resizeHandleSide?: 'left' | 'right';
  isExpanded?: boolean;
  onToggleExpand?: (isExpanded: boolean) => void;
}

export const ResizableContainer: React.FC<ResizableContainerProps> = ({
  children,
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 600,
  onResize,
  className = '',
  resizeHandleSide = 'right',
  isExpanded: controlledIsExpanded,
  onToggleExpand,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const [displayExpanded, setDisplayExpanded] = useState(true); // Delayed state for content
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, width: 0 });
  const transitionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;

  const handleToggleExpand = () => {
    const newExpandedState = !isExpanded;
    if (onToggleExpand) {
      onToggleExpand(newExpandedState);
    } else {
      setInternalIsExpanded(newExpandedState);
    }
  };

  // Update displayExpanded after transition completes to prevent flicker
  useEffect(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // Delay content update to match CSS transition duration (300ms)
    transitionTimeoutRef.current = setTimeout(() => {
      setDisplayExpanded(isExpanded);
    }, 300);

    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [isExpanded]);

  // Sync width when defaultWidth changes (e.g., when collapsing/expanding)
  useEffect(() => {
    if (isExpanded) {
      setWidth(defaultWidth);
    }
  }, [defaultWidth, isExpanded]);

  // Clamp width to min/max bounds when they change
  useEffect(() => {
    setWidth(prev => Math.max(minWidth, Math.min(maxWidth, prev)));
  }, [minWidth, maxWidth]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !isExpanded) return;

      const deltaX = resizeHandleSide === 'left'
        ? startPosRef.current.x - e.clientX
        : e.clientX - startPosRef.current.x;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startPosRef.current.width + deltaX));

      setWidth(newWidth);
      onResize?.(newWidth);
    },
    [isResizing, minWidth, maxWidth, onResize, resizeHandleSide, isExpanded]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isExpanded) return;

    setIsResizing(true);

    startPosRef.current = {
      x: e.clientX,
      width: width,
    };

    document.body.style.cursor = 'ew-resize';
  };

  const renderContent = () => {
    if (typeof children === 'function') {
      return children(displayExpanded, handleToggleExpand, isExpanded !== displayExpanded);
    }
    return children;
  };

  return (
    <div
      ref={containerRef}
      className={`resizable-container ${className} ${isResizing ? 'resizing' : ''} ${!isExpanded ? 'collapsed' : ''} ${isExpanded !== displayExpanded ? 'transitioning' : ''}`}
      style={{ width: isExpanded ? `${width}px` : '40px', flexShrink: 0 }}
    >
      {renderContent()}
      {isExpanded && !className.includes('ai-collapsed') && (
        <div
          className={`horizontal-resizer horizontal-resizer-${resizeHandleSide} ${isResizing ? 'active' : ''}`}
          onMouseDown={handleResizeStart}
        >
          <div className="horizontal-resizer-line" />
        </div>
      )}
    </div>
  );
};