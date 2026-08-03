import React, { useState, useRef, useCallback } from 'react';
import './VerticalResizer.css';

interface VerticalResizerProps {
  onResize: (topHeight: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  minTopHeight?: number;
  minBottomHeight?: number;
}

export const VerticalResizer: React.FC<VerticalResizerProps> = ({
  onResize,
  containerRef,
  minTopHeight = 200,
  minBottomHeight = 150,
}) => {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newTopHeight = moveEvent.clientY - containerRect.top;
      const maxTopHeight = containerRect.height - minBottomHeight;

      // Clamp the height between min and max
      const clampedHeight = Math.max(minTopHeight, Math.min(newTopHeight, maxTopHeight));
      onResize(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`vertical-resizer ${isResizing ? 'active' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="vertical-resizer-line" />
    </div>
  );
};