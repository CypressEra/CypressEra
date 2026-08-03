/**
 * Pan Zoom Handler
 * Manages panning and zooming logic for the NetworkDiagram canvas
 */

import { Transform } from '../types';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';

export class PanZoomHandler {
  private transformRef: React.MutableRefObject<Transform>;
  private canvasRef: React.RefObject<HTMLCanvasElement | null>;
  private animateZoom: (scale: number, offsetX: number, offsetY: number) => void;

  constructor(
    transformRef: React.MutableRefObject<Transform>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    animateZoom: (scale: number, offsetX: number, offsetY: number) => void
  ) {
    this.transformRef = transformRef;
    this.canvasRef = canvasRef;
    this.animateZoom = animateZoom;
  }

  /**
   * Handle wheel event for zooming
   */
  handleWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentTransform = this.transformRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(
      Math.max(currentTransform.scale * delta, NETWORK_DIAGRAM_CONSTANTS.MIN_SCALE),
      NETWORK_DIAGRAM_CONSTANTS.MAX_SCALE
    );

    // Calculate target offset to zoom towards mouse position
    const targetOffsetX = mouseX - (mouseX - currentTransform.offsetX) * (newScale / currentTransform.scale);
    const targetOffsetY = mouseY - (mouseY - currentTransform.offsetY) * (newScale / currentTransform.scale);

    this.animateZoom(newScale, targetOffsetX, targetOffsetY);
  }

  /**
   * Zoom in centered on canvas
   */
  zoomIn(): void {
    const currentTransform = this.transformRef.current;
    const newScale = Math.min(currentTransform.scale * 1.3, NETWORK_DIAGRAM_CONSTANTS.MAX_SCALE);

    const canvas = this.canvasRef.current;
    const centerX = canvas?.width
      ? canvas.width / 2 / (window.devicePixelRatio || 1)
      : NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_WIDTH / 2;
    const centerY = canvas?.height
      ? canvas.height / 2 / (window.devicePixelRatio || 1)
      : NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_HEIGHT / 2;

    const targetOffsetX = centerX - (centerX - currentTransform.offsetX) * (newScale / currentTransform.scale);
    const targetOffsetY = centerY - (centerY - currentTransform.offsetY) * (newScale / currentTransform.scale);

    this.animateZoom(newScale, targetOffsetX, targetOffsetY);
  }

  /**
   * Zoom out centered on canvas
   */
  zoomOut(): void {
    const currentTransform = this.transformRef.current;
    const newScale = Math.max(currentTransform.scale * 0.7, NETWORK_DIAGRAM_CONSTANTS.MIN_SCALE);

    const canvas = this.canvasRef.current;
    const centerX = canvas?.width
      ? canvas.width / 2 / (window.devicePixelRatio || 1)
      : NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_WIDTH / 2;
    const centerY = canvas?.height
      ? canvas.height / 2 / (window.devicePixelRatio || 1)
      : NETWORK_DIAGRAM_CONSTANTS.DEFAULT_CANVAS_HEIGHT / 2;

    const targetOffsetX = centerX - (centerX - currentTransform.offsetX) * (newScale / currentTransform.scale);
    const targetOffsetY = centerY - (centerY - currentTransform.offsetY) * (newScale / currentTransform.scale);

    this.animateZoom(newScale, targetOffsetX, targetOffsetY);
  }

  /**
   * Reset view to default
   */
  resetView(): void {
    this.animateZoom(
      NETWORK_DIAGRAM_CONSTANTS.DEFAULT_SCALE,
      0,
      0
    );
  }

  /**
   * Update pan offset during panning
   */
  updatePan(dx: number, dy: number): Transform {
    const current = this.transformRef.current;
    return {
      ...current,
      offsetX: current.offsetX + dx,
      offsetY: current.offsetY + dy,
    };
  }
}
