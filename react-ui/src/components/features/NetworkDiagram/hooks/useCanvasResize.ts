/**
 * useCanvasResize Hook
 * Handles canvas resizing and container size observation
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { CanvasRenderer } from '../renderers/CanvasRenderer';
import { Transform } from '../types';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';

interface UseCanvasResizeOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  rendererRef: React.MutableRefObject<CanvasRenderer | null>;
  transformRef: React.MutableRefObject<Transform>;
  renderFunctionRef: React.MutableRefObject<(() => void) | null>;
  layoutBoundsRef?: React.MutableRefObject<{
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    centerX: number;
    centerY: number;
  } | null>;
  setTransform?: React.Dispatch<React.SetStateAction<Transform>>;
  /** Optional trigger that increments when layout bounds should be re-centered */
  centeringTrigger?: number;
  /** When this changes, effect re-runs (e.g. when renderer becomes available after empty state) */
  rendererReady?: number;
}

export function useCanvasResize({
  canvasRef,
  rendererRef,
  transformRef,
  renderFunctionRef,
  layoutBoundsRef,
  setTransform,
  centeringTrigger,
  rendererReady,
}: UseCanvasResizeOptions) {
  const isResizingRef = useRef(false);
  const initialResizeDoneRef = useRef(false);
  const [initialResizeDone, setInitialResizeDone] = useState(false);

  /**
   * Calculate transform to center the plot on canvas
   */
  const calculateCenterTransform = useCallback((
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    centerX: number,
    centerY: number,
    canvasWidth: number,
    canvasHeight: number
  ): Transform => {
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;

    // If bounds are too small, use default scale
    if (boundsWidth === 0 || boundsHeight === 0) {
      return {
        scale: NETWORK_DIAGRAM_CONSTANTS.DEFAULT_SCALE,
        offsetX: canvasWidth / 2 - centerX * NETWORK_DIAGRAM_CONSTANTS.DEFAULT_SCALE,
        offsetY: canvasHeight / 2 - centerY * NETWORK_DIAGRAM_CONSTANTS.DEFAULT_SCALE,
      };
    }

    // Calculate scale to fit the content with padding
    // Add padding on both sides (total padding = 2 * padding per dimension)
    const padding = NETWORK_DIAGRAM_CONSTANTS.LAYOUT_PADDING;
    const scaleX = canvasWidth / (boundsWidth + padding * 2);
    const scaleY = canvasHeight / (boundsHeight + padding * 2);
    const autoScale = Math.min(scaleX, scaleY, 1);

    // Center the content in the canvas
    // Position the center of the bounds at the center of the canvas
    return {
      scale: autoScale,
      offsetX: canvasWidth / 2 - centerX * autoScale,
      offsetY: canvasHeight / 2 - centerY * autoScale,
    };
  }, []);

  /**
   * Apply centering based on layout bounds
   */
  const applyCentering = useCallback(() => {
    if (!layoutBoundsRef?.current || !setTransform) {
      return false;
    }

    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) {
      return false;
    }

    const { bounds, centerX, centerY } = layoutBoundsRef.current;
    const canvasWidth = container.clientWidth || canvas.clientWidth;
    const canvasHeight = container.clientHeight || canvas.clientHeight;

    // Only apply if canvas has valid dimensions
    if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
      return false;
    }

    const newTransform = calculateCenterTransform(bounds, centerX, centerY, canvasWidth, canvasHeight);

    setTransform(newTransform);
    transformRef.current = newTransform;

    requestAnimationFrame(() => renderFunctionRef.current?.());
    return true;
  }, [canvasRef, transformRef, setTransform, renderFunctionRef, layoutBoundsRef, calculateCenterTransform]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let resizeFrameId: number | null = null;
    let pendingWidth: number | null = null;
    let pendingHeight: number | null = null;

    const handleResize = () => {
      const container = canvasRef.current?.parentElement;
      if (!container) return;

      const width = container.clientWidth || NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_WIDTH;
      const height = container.clientHeight || NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_HEIGHT;

      // Store the pending dimensions
      pendingWidth = width;
      pendingHeight = height;

      // If we already have a frame pending, don't schedule another one
      if (resizeFrameId !== null) {
        return;
      }

      // Schedule the resize to happen on the next animation frame
      resizeFrameId = requestAnimationFrame(() => {
        if (pendingWidth === null || pendingHeight === null) {
          resizeFrameId = null;
          isResizingRef.current = false;
          return;
        }

        const finalWidth = pendingWidth;
        const finalHeight = pendingHeight;

        // Set resizing flag
        isResizingRef.current = true;

        // Resize the canvas (this automatically clears it)
        renderer.resize(finalWidth, finalHeight);

        // On initial resize, apply centering if we have layout bounds
        const isInitialResize = !initialResizeDoneRef.current;

        // Only mark initial resize as done if we have valid dimensions
        if (isInitialResize && finalWidth > 0 && finalHeight > 0) {
          initialResizeDoneRef.current = true;
          setInitialResizeDone(true);
        }

        if (isInitialResize) {
          // Apply centering on initial resize if we have layout bounds and valid dimensions
          if (layoutBoundsRef?.current && finalWidth > 0 && finalHeight > 0) {
            applyCentering();
          } else {
            // Just render without centering if no layout bounds yet or invalid dimensions
            const currentTransform = transformRef.current;
            transformRef.current = currentTransform;

            if (renderFunctionRef.current) {
              renderFunctionRef.current();
            }
          }
        } else {
          // Keep the same transform - don't recalculate or recenter
          const currentTransform = transformRef.current;
          transformRef.current = currentTransform;

          // Render immediately after resize with the same transform
          if (renderFunctionRef.current) {
            renderFunctionRef.current();
          }
        }

        resizeFrameId = null;
        pendingWidth = null;
        pendingHeight = null;

        // Clear resizing flag after a short delay
        setTimeout(() => {
          isResizingRef.current = false;
        }, NETWORK_DIAGRAM_CONSTANTS.RESIZE_DEBOUNCE_DELAY);
      });
    };

    // Set up ResizeObserver for more reliable size tracking
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    // Observe the container element
    const container = canvasRef.current?.parentElement;
    if (container) {
      resizeObserver.observe(container);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', handleResize);

    // Initial resize
    requestAnimationFrame(() => {
      handleResize();
    });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [canvasRef, rendererRef, transformRef, renderFunctionRef, layoutBoundsRef, applyCentering, rendererReady]);

  // Re-apply centering when centeringTrigger changes (new data loaded after initial resize)
  useEffect(() => {
    if (initialResizeDone && layoutBoundsRef?.current && setTransform && centeringTrigger !== undefined && centeringTrigger > 0) {
      // Small delay to ensure canvas is ready
      const timeoutId = setTimeout(() => {
        applyCentering();
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [centeringTrigger, initialResizeDone, layoutBoundsRef, applyCentering, setTransform]);

  // Also apply centering when initial resize completes and we have layout bounds
  // This handles the case where data loads before the diagram is visible
  useEffect(() => {
    if (initialResizeDone && layoutBoundsRef?.current && setTransform && centeringTrigger !== undefined && centeringTrigger > 0) {
      // Apply centering immediately when resize completes
      const timeoutId = setTimeout(() => {
        applyCentering();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [initialResizeDone, layoutBoundsRef, applyCentering, setTransform, centeringTrigger]);

  // Watch for container size changes and apply centering when dimensions become valid
  // This handles the case where diagram becomes visible after data is loaded
  useEffect(() => {
    if (!canvasRef.current || !layoutBoundsRef?.current || !setTransform || centeringTrigger === undefined || centeringTrigger === 0) {
      return;
    }

    const container = canvasRef.current.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        // If we now have valid dimensions and haven't centered yet, apply centering
        if (width > 0 && height > 0 && layoutBoundsRef?.current && centeringTrigger > 0) {
          applyCentering();
          // Disconnect after applying centering once
          observer.disconnect();
        }
      }
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [canvasRef, layoutBoundsRef, setTransform, centeringTrigger, applyCentering]);

  return { isResizingRef, applyCentering };
}
