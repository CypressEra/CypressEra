/**
 * Canvas Renderer for Power Grid SLD
 * Handles all drawing operations with proper layering and caching
 */

import {
  Point,
  Bounds,
  Transform,
  DiagramElement,
  RenderStyle,
  LayerConfig,
} from '../types/index';

// Import element drawing functions and types
import {
  drawBus,
  drawACLine,
  drawTransformer,
  drawLoad,
  drawGenerator,
  drawFixedShunt,
  drawSwitchedShunt,
  getBusRendererOptionsForElement,
} from './elements';
import { LineRendererOptions } from './elements/line';

export interface RenderOptions {
  antialiasing?: boolean;
  pixelRatio?: number;
  showBounds?: boolean;
  debugMode?: boolean;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixelRatio: number;
  private width: number;
  private height: number;
  private style: RenderStyle;
  private layers: Map<string, LayerConfig>;
  private cache: Map<string, OffscreenCanvas>;
  private needsRedraw: Set<string>;

  constructor(canvas: HTMLCanvasElement, style: RenderStyle, options: RenderOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    this.ctx = ctx;
    this.pixelRatio = options.pixelRatio || window.devicePixelRatio || 1;
    this.style = style;
    this.cache = new Map();
    this.needsRedraw = new Set();

    // Initialize layers
    this.layers = new Map([
      ['grid', { id: 'grid', name: 'Grid', visible: true, zIndex: 0 }],
      ['connections', { id: 'connections', name: 'Connections', visible: true, zIndex: 10 }],
      ['elements', { id: 'elements', name: 'Elements', visible: true, zIndex: 20 }],
      ['labels', { id: 'labels', name: 'Labels', visible: true, zIndex: 30 }],
      ['overlays', { id: 'overlays', name: 'Overlays', visible: true, zIndex: 40 }],
      ['selection', { id: 'selection', name: 'Selection', visible: true, zIndex: 50 }],
    ]);

    this.width = 0;
    this.height = 0;

    this.resize(canvas.clientWidth, canvas.clientHeight);
  }

  /**
   * Resize the canvas
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const dpr = this.pixelRatio;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Reset transform and apply DPR scaling
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear all caches on resize
    this.cache.clear();
    this.markAllLayersForRedraw();

    // Fill with theme background immediately so we never show a black flash before first render
    if (width > 0 && height > 0) {
      this.clear();
    }
  }

  /**
   * Mark a layer for redraw
   */
  markLayerForRedraw(layerId: string): void {
    this.needsRedraw.add(layerId);
  }

  /**
   * Mark all layers for redraw
   */
  markAllLayersForRedraw(): void {
    this.layers.forEach((_, id) => this.needsRedraw.add(id));
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.ctx.fillStyle = this.style.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw grid (disabled - grid not shown)
   */
  drawGrid(_transform: Transform): void {
    // Grid display is disabled
    return;
  }

  /**
   * Draw a bus element
   */
  drawBus(
    element: DiagramElement,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: { busHeight?: number; busWidth?: number; hitboxPadding?: number; powerFlowData?: { vm?: number; va?: number }; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('elements')?.visible) return;
    const defaultOptions = getBusRendererOptionsForElement(element);
    const mergedOptions = { ...defaultOptions, ...options };
    drawBus(this.ctx, element, transform, this.style, isSelected, isHighlighted, mergedOptions);
  }

  /**
   * Draw an AC line
   */
  drawACLine(
    iBusPos: Point,
    jBusPos: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: LineRendererOptions & { busVoltages?: Map<number, number>; powerFlowData?: any; showFlowValues?: boolean }
  ): void {
    if (!this.layers.get('connections')?.visible) return;
    drawACLine(this.ctx, iBusPos, jBusPos, data, transform, this.style, isSelected, isHighlighted, options || {});
  }

  /**
   * Draw a transformer symbol
   */
  drawTransformer(
    iBusPos: Point,
    jBusPos: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    kBusPosition?: Point,
    busVoltages?: Map<number, number>,
    options?: { powerFlowData?: any; showFlowValues?: boolean; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('connections')?.visible) return;
    drawTransformer(this.ctx, iBusPos, jBusPos, data, transform, this.style, isSelected, isHighlighted, {
      kBusPosition,
      busVoltages,
      ...options
    });
  }

  /**
   * Draw a load symbol
   */
  drawLoad(
    position: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: { connectedBusPosition?: Point; mirrored?: boolean; busVoltage?: number; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('elements')?.visible) return;
    drawLoad(this.ctx, position, data, transform, this.style, isSelected, isHighlighted, options || {});
  }

  /**
   * Draw a generator symbol
   */
  drawGenerator(
    position: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: { connectedBusPosition?: Point; mirrored?: boolean; busVoltage?: number; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('elements')?.visible) return;
    drawGenerator(this.ctx, position, data, transform, this.style, isSelected, isHighlighted, options || {});
  }

  /**
   * Draw a fixed shunt symbol
   */
  drawFixedShunt(
    position: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: { connectedBusPosition?: Point; mirrored?: boolean; busVoltage?: number; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('elements')?.visible) return;
    drawFixedShunt(this.ctx, position, data, transform, this.style, isSelected, isHighlighted, options || {});
  }

  /**
   * Draw a switched shunt symbol
   */
  drawSwitchedShunt(
    position: Point,
    data: any,
    transform: Transform,
    isSelected: boolean = false,
    isHighlighted: boolean = false,
    options?: { connectedBusPosition?: Point; mirrored?: boolean; busVoltage?: number; unmodeled?: boolean }
  ): void {
    if (!this.layers.get('elements')?.visible) return;
    drawSwitchedShunt(this.ctx, position, data, transform, this.style, isSelected, isHighlighted, options || {});
  }

  /**
   * Draw selection rectangle
   */
  drawSelectionRect(bounds: Bounds, transform: Transform): void {
    if (!this.layers.get('selection')?.visible) return;

    this.ctx.save();
    this.ctx.translate(transform.offsetX, transform.offsetY);
    this.ctx.scale(transform.scale, transform.scale);

    this.ctx.strokeStyle = this.style.selectedColor;
    this.ctx.lineWidth = 2 / transform.scale;
    this.ctx.setLineDash([5 / transform.scale, 5 / transform.scale]);
    this.ctx.fillStyle = this.style.selectedColor;
    this.ctx.globalAlpha = 0.1;

    this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.ctx.globalAlpha = 1.0;
    this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  /**
   * Draw draggable line endpoint handles (at the elbow, not bus connection)
   */
  drawLineEndpointHandles(
    elements: Map<string, DiagramElement>,
    mouseWorldPos: Point | null,
    transform: Transform
  ): void {
    if (!this.layers.get('overlays')?.visible) return;
    if (!mouseWorldPos) return;

    const HANDLE_SIZE = 8;
    const HIT_TOLERANCE = 12;
    const VERTICAL_SEGMENT_LENGTH = 25; // Must match the value in line.ts

    this.ctx.save();
    this.ctx.translate(transform.offsetX, transform.offsetY);
    this.ctx.scale(transform.scale, transform.scale);

    Array.from(elements.values()).forEach((element) => {
      if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
        const lineEl = element as any;

        // Calculate the elbow positions (end of vertical segments, away from bus)
        const fromPos = element.position;
        const toPos = lineEl.toPos;
        const dx = toPos.x - fromPos.x;
        const distance = Math.sqrt(dx * dx + Math.pow(toPos.y - fromPos.y, 2));

        // Calculate from elbow (end of vertical segment at from side)
        let fromElbow = fromPos;
        if (distance > VERTICAL_SEGMENT_LENGTH * 2) {
          fromElbow = {
            x: fromPos.x + (dx > 0 ? VERTICAL_SEGMENT_LENGTH : -VERTICAL_SEGMENT_LENGTH),
            y: fromPos.y
          };
        }

        // Calculate to elbow (end of vertical segment at to side)
        let toElbow = toPos;
        if (distance > VERTICAL_SEGMENT_LENGTH * 2) {
          toElbow = {
            x: toPos.x + (dx > 0 ? -VERTICAL_SEGMENT_LENGTH : VERTICAL_SEGMENT_LENGTH),
            y: toPos.y
          };
        }

        // Check from elbow
        const fromDist = Math.sqrt(
          Math.pow(mouseWorldPos.x - fromElbow.x, 2) +
          Math.pow(mouseWorldPos.y - fromElbow.y, 2)
        );

        // Check to elbow
        const toDist = Math.sqrt(
          Math.pow(mouseWorldPos.x - toElbow.x, 2) +
          Math.pow(mouseWorldPos.y - toElbow.y, 2)
        );

        // Draw handle for from elbow if hovered
        if (fromDist <= HIT_TOLERANCE) {
          this.drawEndpointHandle(fromElbow.x, fromElbow.y, HANDLE_SIZE);
        }

        // Draw handle for to elbow if hovered
        if (toDist <= HIT_TOLERANCE) {
          this.drawEndpointHandle(toElbow.x, toElbow.y, HANDLE_SIZE);
        }
      }
    });

    this.ctx.restore();
  }

  /**
   * Draw a single endpoint handle
   */
  private drawEndpointHandle(x: number, y: number, size: number): void {
    const halfSize = size / 2;

    // Draw outer circle (white with border)
    this.ctx.beginPath();
    this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();
    this.ctx.strokeStyle = '#1e3a8a';
    this.ctx.lineWidth = 2 / this.ctx.getTransform().a;
    this.ctx.stroke();

    // Draw inner dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, halfSize / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = '#1e3a8a';
    this.ctx.fill();
  }

  /**
   * Update render style
   */
  updateStyle(style: Partial<RenderStyle>): void {
    this.style = { ...this.style, ...style };
    this.markAllLayersForRedraw();
  }

  /**
   * Draw highlight rings around bus nodes for graph analysis results.
   * @param busPositions Map from busNumber → world-space {x, y} position
   * @param highlightedBuses Map from busNumber → highlight kind
   * @param busHalfHeight Half the visual height of a bus bar (world units)
   * @param transform Current canvas transform
   */
  drawHighlightRings(
    busPositions: Map<number, { x: number; y: number }>,
    highlightedBuses: Map<number, 'source' | 'path' | 'neighbour'>,
    busHalfHeight: number,
    transform: Transform,
  ): void {
    if (highlightedBuses.size === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    highlightedBuses.forEach((kind, busNumber) => {
      const pos = busPositions.get(busNumber);
      if (!pos) return;
      const color = kind === 'source' ? '#3b82f6' : '#f59e0b'; // blue : amber
      const radius = busHalfHeight + 6 / transform.scale;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 / transform.scale;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  /**
   * Set layer visibility
   */
  setLayerVisibility(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
      this.markLayerForRedraw(layerId);
    }
  }

  /**
   * Get canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number, transform: Transform): Point {
    return {
      x: (screenX - transform.offsetX) / transform.scale,
      y: (screenY - transform.offsetY) / transform.scale,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number, transform: Transform): Point {
    return {
      x: worldX * transform.scale + transform.offsetX,
      y: worldY * transform.scale + transform.offsetY,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.cache.forEach(canvas => {
      // OffscreenCanvas may not have close in all browsers
      if ('close' in canvas) {
        (canvas as any).close();
      }
    });
    this.cache.clear();
  }
}
