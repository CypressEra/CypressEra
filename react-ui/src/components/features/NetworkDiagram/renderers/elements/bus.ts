/**
 * Bus Element Renderer
 * Renders bus elements as thick vertical lines (circuit element style)
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  Bus,
} from '../../types';

export interface BusRendererOptions {
  busHeight?: number;
  busWidth?: number;
  hitboxPadding?: number;
  /** Power flow result for this bus (contains vm - voltage magnitude in pu) */
  powerFlowData?: {
    vm?: number;        // Voltage magnitude (pu)
    va?: number;        // Voltage angle (degrees)
  };
  /** When true, paint dark pink to flag the element as not present in the current model. */
  unmodeled?: boolean;
}

/** Default bus bar height when not overridden per element */
export const DEFAULT_BUS_HEIGHT = 90;

/** Min/max bus height when resizing by drag */
export const MIN_BUS_HEIGHT = 40;
export const MAX_BUS_HEIGHT = 300;

/** Resize handle at bottom of bus (height of hit area, half-width from center) */
export const BUS_RESIZE_HANDLE_HEIGHT = 10;
export const BUS_RESIZE_HANDLE_HALF_WIDTH = 16;

/** Height per connection for auto-growing buses */
export const HEIGHT_PER_CONNECTION = 15;

/** Minimum auto-grow threshold (only auto-grow when connections exceed this) */
export const AUTO_GROW_MIN_CONNECTIONS = 3;

/**
 * Calculate auto-grow bus height based on connection count
 * @param connectionCount Total number of connections to the bus
 * @returns Calculated height (clamped to MIN_BUS_HEIGHT and MAX_BUS_HEIGHT)
 */
export function calculateAutoGrowBusHeight(connectionCount: number): number {
  if (connectionCount <= AUTO_GROW_MIN_CONNECTIONS) {
    return DEFAULT_BUS_HEIGHT;
  }

  // Calculate height based on connection count
  // More gradual growth: each connection adds less height
  const calculatedHeight = DEFAULT_BUS_HEIGHT + (connectionCount - AUTO_GROW_MIN_CONNECTIONS) * HEIGHT_PER_CONNECTION;

  // Clamp to min/max bounds
  return Math.max(MIN_BUS_HEIGHT, Math.min(MAX_BUS_HEIGHT, calculatedHeight));
}

/**
 * Get voltage level category from base kV
 */
export function getVoltageLevelCategory(kv: number): 'ehv' | 'hv' | 'mv' | 'lv' {
  if (kv >= 345) return 'ehv';
  if (kv >= 138) return 'hv';
  if (kv >= 34.5) return 'mv';
  return 'lv';
}

/**
 * Get color for voltage level (falls back to default color for compatibility)
 * Returns black for absent or 0 kV values
 */
function getVoltageLevelColor(
  kv: number,
  style: RenderStyle
): string {
  // Return black for absent or 0 kV values
  if (!kv || kv === 0) {
    return '#000000';
  }

  const level = getVoltageLevelCategory(kv);
  // Check if style has voltage level colors
  const voltageColors = (style as any).voltageColors;
  if (voltageColors && voltageColors[level]) {
    return voltageColors[level];
  }
  // Fallback to default bus color
  return style.busColor;
}

/**
 * Draw a bus element
 */
export function drawBus(
  ctx: CanvasRenderingContext2D,
  element: DiagramElement,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: BusRendererOptions = {}
): void {
  const {
    busHeight = DEFAULT_BUS_HEIGHT,
    busWidth = 6,
    powerFlowData,
    unmodeled = false,
  } = options;

  const { position, data } = element;
  const busData = data as Bus;

  // Determine color based on voltage level
  let color = getVoltageLevelColor(busData?.baskv ?? 0, style);
  if (isSelected) color = style.selectedColor;
  else if (unmodeled) color = '#ff69b4';                // dark pink: not in current model

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Draw thick vertical line (bus bar) - no rounded corners
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = busWidth;
  ctx.lineCap = 'butt'; // Square ends instead of round

  ctx.beginPath();
  ctx.moveTo(position.x, position.y - busHeight / 2);
  ctx.lineTo(position.x, position.y + busHeight / 2);
  ctx.stroke();


  // Draw base kV above bus (baskv may be null)
  const baskv = busData?.baskv;
  const vm = powerFlowData?.vm; // Voltage magnitude in pu

  if (baskv != null && typeof baskv === 'number') {
    ctx.fillStyle = style.textColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'center';

    // Display voltage pu on top of base kV
    if (vm != null && typeof vm === 'number') {
      // Draw both vm (pu) and baskv on separate lines
      // pu is above kV
      ctx.fillText(
        `${vm.toFixed(3)} pu`,
        position.x,
        position.y - busHeight / 2 - 22
      );
      ctx.fillText(
        `${baskv.toFixed(1)} kV`,
        position.x,
        position.y - busHeight / 2 - 8
      );
    } else {
      // Only draw base kV if no power flow data
      ctx.fillText(
        `${baskv.toFixed(1)} kV`,
        position.x,
        position.y - busHeight / 2 - 8
      );
    }
  } else if (vm != null && typeof vm === 'number') {
    // Only draw vm if no base kV
    ctx.fillStyle = style.textColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `${vm.toFixed(3)} pu`,
      position.x,
      position.y - busHeight / 2 - 8
    );
  }

  // Draw bus number below bus
  ctx.fillStyle = style.labelColor;
  ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    (data as Bus)?.ibus?.toString() || '',
    position.x,
    position.y + busHeight / 2 + 15
  );

  // Draw name if available (below bus number)
  if (busData?.name) {
    ctx.fillStyle = style.labelColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      busData.name,
      position.x,
      position.y + busHeight / 2 + 28
    );
  }

  // Draw resize handle at bottom when selected or hovered (drag to expand height)
  if (isSelected || isHighlighted) {
    const bottomY = position.y + busHeight / 2;
    const hw = BUS_RESIZE_HANDLE_HALF_WIDTH;
    ctx.strokeStyle = style.selectedColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(position.x - hw, bottomY);
    ctx.lineTo(position.x + hw, bottomY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Small grip dots
    ctx.fillStyle = style.selectedColor;
    [-hw * 0.6, 0, hw * 0.6].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(position.x + dx, bottomY, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}

/**
 * Calculate bounds for a bus element
 * Uses a wider hitbox width to make dragging easier, especially when multiple
 * loads/generators are connected to the bus
 */
export function calculateBusBounds(
  position: Point,
  options: BusRendererOptions = {}
): { x: number; y: number; width: number; height: number } {
  const {
    busHeight = DEFAULT_BUS_HEIGHT,
    busWidth = 6,
    hitboxPadding = 1,
  } = options;

  // Use a minimum hitbox width of 24 pixels (12 pixels on each side) to make
  // dragging easier, especially from the center when multiple devices are connected
  const minHitboxWidth = 24;
  const calculatedWidth = busWidth + hitboxPadding * 2;
  const hitboxWidth = Math.max(calculatedWidth, minHitboxWidth);

  return {
    x: position.x - hitboxWidth / 2,
    y: position.y - busHeight / 2 - hitboxPadding,
    width: hitboxWidth,
    height: busHeight + hitboxPadding * 2,
  };
}

/**
 * Get effective bus height for an element (element.busHeight or default)
 */
export function getBusHeightForElement(
  element: DiagramElement,
  defaultHeight: number = DEFAULT_BUS_HEIGHT
): number {
  if (element.type !== 'bus') return defaultHeight;
  return element.busHeight ?? defaultHeight;
}

/**
 * Build renderer options for a bus element (uses element.busHeight when set)
 */
export function getBusRendererOptionsForElement(
  element: DiagramElement,
  defaults: Partial<BusRendererOptions> = {}
): BusRendererOptions {
  const height = getBusHeightForElement(element, defaults.busHeight ?? DEFAULT_BUS_HEIGHT);
  return {
    busHeight: height,
    busWidth: defaults.busWidth ?? 6,
    hitboxPadding: defaults.hitboxPadding ?? 1,
    ...defaults,
  };
}

/**
 * Create a bus diagram element
 */
export function createBusElement(
  bus: Bus,
  position: Point,
  options: BusRendererOptions = {}
): DiagramElement {
  const bounds = calculateBusBounds(position, options);

  return {
    id: `bus_${bus.ibus}`,
    type: 'bus',
    position,
    bounds,
    data: bus,
  };
}
