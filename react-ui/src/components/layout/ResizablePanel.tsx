import React, { useState, useRef, useEffect } from 'react';
import './ResizablePanel.css';

interface ResizablePanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultWidth?: string;
  defaultHeight?: string;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  className?: string;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  title,
  children,
  defaultWidth = '100%',
  defaultHeight = '100%',
  minWidth = 200,
  minHeight = 150,
  resizable = true,
  className = '',
  onFullscreen,
  isFullscreen = false,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const deltaX = e.clientX - startPos.current.x;
      const deltaY = e.clientY - startPos.current.y;

      if (isResizing.includes('right')) {
        const newWidth = Math.max(minWidth, startPos.current.width + deltaX);
        setWidth(`${newWidth}px`);
      }

      if (isResizing.includes('bottom')) {
        const newHeight = Math.max(minHeight, startPos.current.height + deltaY);
        setHeight(`${newHeight}px`);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, minHeight]);

  const handleResizeStart = (direction: string, e: React.MouseEvent) => {
    if (!resizable || !panelRef.current) return;

    e.preventDefault();
    setIsResizing(direction);

    const rect = panelRef.current.getBoundingClientRect();
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    };

    if (direction.includes('right')) {
      document.body.style.cursor = 'ew-resize';
    } else if (direction.includes('bottom')) {
      document.body.style.cursor = 'ns-resize';
    }
  };

  return (
    <div
      ref={panelRef}
      className={`resizable-panel ${className}`}
      style={{ width, height }}
    >
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <div className="panel-controls">
          {onFullscreen && (
            <button 
              className="panel-btn" 
              onClick={onFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          )}
        </div>
      </div>
      <div className="panel-content">{children}</div>

      {resizable && (
        <>
          <div
            className="resize-handle resize-right"
            onMouseDown={(e) => handleResizeStart('right', e)}
          />
          <div
            className="resize-handle resize-bottom"
            onMouseDown={(e) => handleResizeStart('bottom', e)}
          />
          <div
            className="resize-handle resize-corner"
            onMouseDown={(e) => handleResizeStart('right-bottom', e)}
          />
        </>
      )}
    </div>
  );
};