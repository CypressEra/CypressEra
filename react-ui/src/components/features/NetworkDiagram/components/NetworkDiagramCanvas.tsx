/**
 * Network Diagram Canvas Component
 * The main canvas element for the NetworkDiagram
 */

import React, { forwardRef, useEffect, useCallback } from 'react';
import { CanvasRenderer } from '../renderers/CanvasRenderer';
import { RenderStyle } from '../types';

interface NetworkDiagramCanvasProps {
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
  isPanning?: boolean;
  onCanvasRef: (ref: HTMLCanvasElement | null) => void;
  onRendererRef: (ref: CanvasRenderer | null) => void;
  renderStyle: RenderStyle;
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheelWithNonPassive?: (e: WheelEvent) => void;
  children?: React.ReactNode;
}

export const NetworkDiagramCanvas = forwardRef<HTMLCanvasElement, NetworkDiagramCanvasProps>(({
  className = '',
  style,
  interactive = true,
  isPanning = false,
  onCanvasRef,
  onRendererRef,
  renderStyle,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheelWithNonPassive,
  children,
}, ref) => {
  const internalCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<CanvasRenderer | null>(null);

  // Combine refs - use useCallback to prevent infinite re-renders
  const setCanvasRef = useCallback((element: HTMLCanvasElement | null) => {
    internalCanvasRef.current = element;
    onCanvasRef(element);
    if (typeof ref === 'function') {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  }, [onCanvasRef, ref]);

  // Initialize renderer (runs once when canvas mounts)
  useEffect(() => {
    if (!internalCanvasRef.current) return;

    const renderer = new CanvasRenderer(internalCanvasRef.current, renderStyle);
    rendererRef.current = renderer;
    onRendererRef(renderer);

    return () => {
      renderer.dispose();
    };
  }, []); // Only run once when canvas mounts

  // Update renderer style when renderStyle changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateStyle(renderStyle);
    }
  }, [renderStyle]);

  // Attach wheel event listener with non-passive option
  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas || !onWheelWithNonPassive) return;

    const handleWheel = (e: WheelEvent) => {
      onWheelWithNonPassive(e);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [onWheelWithNonPassive]);

  return (
    <canvas
      ref={setCanvasRef}
      className={`network-diagram-canvas ${className || ''}`}
      style={{
        cursor: isPanning ? 'grabbing' : interactive ? 'grab' : 'default',
        ...style,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </canvas>
  );
});

NetworkDiagramCanvas.displayName = 'NetworkDiagramCanvas';
