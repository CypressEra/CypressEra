/**
 * useTransform Hook
 * Manages canvas transform (scale, offset) and smooth zoom animations
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Transform } from '../types';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';

interface UseTransformOptions {
  initialTransform?: Partial<Transform>;
}

interface UseTransformReturn {
  transform: Transform;
  transformRef: React.MutableRefObject<Transform>;
  targetTransformRef: React.MutableRefObject<Transform | null>;
  isAnimatingRef: React.MutableRefObject<boolean>;
  animateZoom: (scale: number, offsetX: number, offsetY: number) => void;
  cancelAnimation: () => void;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
}

export function useTransform(options: UseTransformOptions = {}): UseTransformReturn {
  const { initialTransform = {} } = options;

  const [transform, setTransformState] = useState<Transform>({
    scale: initialTransform.scale || NETWORK_DIAGRAM_CONSTANTS.DEFAULT_SCALE,
    offsetX: initialTransform.offsetX || 0,
    offsetY: initialTransform.offsetY || 0,
  });

  const transformRef = useRef<Transform>(transform);
  const isAnimatingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const targetTransformRef = useRef<Transform | null>(null);

  // Update ref whenever state changes (but NOT during animation)
  useEffect(() => {
    if (!isAnimatingRef.current) {
      transformRef.current = transform;
    }
  }, [transform]);

  // Smooth zoom animation - uses target-based approach for rapid scrolling
  const animateZoom = useCallback((
    targetScale: number,
    targetOffsetX: number,
    targetOffsetY: number
  ) => {
    // Update the target transform
    targetTransformRef.current = { scale: targetScale, offsetX: targetOffsetX, offsetY: targetOffsetY };

    // If animation is already running, just update the target and return
    if (animationFrameRef.current !== null) {
      return;
    }

    const animate = () => {
      const target = targetTransformRef.current;
      if (!target) {
        animationFrameRef.current = null;
        isAnimatingRef.current = false;
        return;
      }

      const current = transformRef.current;

      // Calculate the difference
      const diffScale = target.scale - current.scale;
      const diffOffsetX = target.offsetX - current.offsetX;
      const diffOffsetY = target.offsetY - current.offsetY;

      // Use relative tolerance (percentage) instead of absolute
      const relativeTolerance = NETWORK_DIAGRAM_CONSTANTS.ANIMATION_RELATIVE_TOLERANCE;
      const isClose =
        Math.abs(diffScale) < Math.abs(target.scale) * relativeTolerance &&
        Math.abs(diffOffsetX) < Math.abs(target.offsetX) * relativeTolerance + 0.1 &&
        Math.abs(diffOffsetY) < Math.abs(target.offsetY) * relativeTolerance + 0.1;

      if (isClose) {
        // Snap to target and stop immediately
        transformRef.current = target;
        setTransformState(target);
        animationFrameRef.current = null;
        isAnimatingRef.current = false;
        targetTransformRef.current = null;
        return;
      }

      // Interpolate towards target
      const factor = NETWORK_DIAGRAM_CONSTANTS.ZOOM_ANIMATION_FACTOR;
      const newTransform: Transform = {
        scale: current.scale + diffScale * factor,
        offsetX: current.offsetX + diffOffsetX * factor,
        offsetY: current.offsetY + diffOffsetY * factor,
      };

      transformRef.current = newTransform;
      setTransformState(newTransform);

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    isAnimatingRef.current = true;
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Cancel any ongoing animation
  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isAnimatingRef.current = false;
    targetTransformRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    transform,
    transformRef,
    targetTransformRef,
    isAnimatingRef,
    animateZoom,
    cancelAnimation,
    setTransform: setTransformState,
  };
}
