/**
 * Load Element Renderer
 * Renders load elements as triangles
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  Load,
} from '../../types';

export interface LoadRendererOptions {
  size?: number;
  connectedBusPosition?: Point;
  mirrored?: boolean;  // If true, mirror the element horizontally
  busVoltage?: number;  // Base kV of the connected bus for voltage-based coloring
  unmodeled?: boolean; // Paint dark pink to flag the element as not present in the current model
}

/**
 * Get voltage level category from base kV
 */
function getVoltageLevelCategory(kv: number): 'ehv' | 'hv' | 'mv' | 'lv' {
  if (kv >= 345) return 'ehv';
  if (kv >= 138) return 'hv';
  if (kv >= 34.5) return 'mv';
  return 'lv';
}

/**
 * Get color for voltage level (falls back to default load color for compatibility)
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
  // Fallback to default load color
  return style.loadColor;
}

/**
 * Draw a load symbol (triangle - circuit element style)
 * The load is oriented horizontally with the connection line extending from the left side
 */
export function drawLoad(
  ctx: CanvasRenderingContext2D,
  position: Point,
  data: Load,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: LoadRendererOptions = {}
): void {
  const {
    size = style.loadSize,
    connectedBusPosition,
    mirrored = false,
    busVoltage,
  } = options;

  // Check if element is offline (status === 0 or stat === 0)
  const isOffline = (data as any)?.status === 0 || (data as any)?.stat === 0;

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Determine color based on voltage level and offline status
  let color = style.loadColor;
  if (isSelected) color = style.selectedColor;
  else if (isHighlighted) color = style.highlightedColor;
  else if (options.unmodeled) color = '#ff69b4';        // dark pink: not in current model
  else if (isOffline) color = '#b0b0b0'; // Light gray for offline elements
  else if (busVoltage !== undefined) color = getVoltageLevelColor(busVoltage, style);

  const halfSize = size / 2;

  // Draw connection line to bus first (so it appears behind the symbol)
  // The line is drawn vertically (perpendicular) from the bus to the load
  // IMPORTANT: Draw connection line BEFORE applying mirroring transform
  if (connectedBusPosition) {
    const connectionLineWidth = 1.5; // Constant width in world space
    ctx.strokeStyle = color; // Same color as element
    ctx.lineWidth = connectionLineWidth;
    // Use dashed line for offline elements
    if (isOffline) {
      ctx.setLineDash([8, 4]);
    }

    // The bus connection point is on the side of the bus (left or right)
    // We need to draw a line perpendicular to the bus first, then connect to the load
    // Perpendicular means horizontal from the bus connection point

    // Determine which side of the bus we're connecting from
    const isFromLeftSide = position.x < connectedBusPosition.x;
    const perpendicularLength = 25; // Length of perpendicular segment

    // Calculate the perpendicular point (horizontal from bus connection)
    const perpendicularEnd = {
      x: connectedBusPosition.x + (isFromLeftSide ? -perpendicularLength : perpendicularLength),
      y: connectedBusPosition.y
    };

    // Determine which side of the load to connect to
    // Connect to the vertical side (base) of the triangle
    // When not mirrored: base is on the right side (position.x + halfSize)
    // When mirrored: base is on the left side (position.x - halfSize)
    const loadConnectionX = mirrored ? position.x - halfSize : position.x + halfSize;

    ctx.beginPath();
    // Start from the exact bus connection point (at the bus edge)
    ctx.moveTo(connectedBusPosition.x, connectedBusPosition.y);
    // Draw perpendicular (horizontal) segment from bus
    ctx.lineTo(perpendicularEnd.x, perpendicularEnd.y);
    // Then connect to the load at the appropriate side
    ctx.lineTo(loadConnectionX, position.y);
    ctx.stroke();
    // Reset dash pattern
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  // Save state before applying mirroring for shapes
  ctx.save();

  // Apply mirroring if needed - mirror horizontally at the element's center
  if (mirrored) {
    ctx.translate(position.x, position.y);
    ctx.scale(-1, 1);
    ctx.translate(-position.x, -position.y);
  }

  // Draw triangle pointing left (horizontal orientation)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.fillStyle = style.backgroundColor;  // Use background color to fill (covers connection line)
  ctx.lineWidth = 1;

  // Triangle pointing left (base on right, point on left - toward the bus)
  // When mirrored, this will point right instead
  ctx.beginPath();
  ctx.moveTo(position.x + halfSize, position.y - halfSize);
  ctx.lineTo(position.x + halfSize, position.y + halfSize);
  ctx.lineTo(position.x - halfSize, position.y);
  ctx.closePath();

  // Fill with background color first (opaque, covers connection line)
  ctx.fill();
  // Then stroke with the color
  ctx.stroke();

  // Restore to undo mirroring for text
  ctx.restore();

  // Draw load value - not affected by mirroring (pl may be null for newly added loads)
  const loadData = data as Load;
  const pl = loadData?.pl;
  if (pl != null && typeof pl === 'number') {
    ctx.fillStyle = style.textColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `${pl.toFixed(1)} MW`,
      position.x + halfSize,
      position.y - halfSize - 5
    );
  }

  ctx.restore();
}

/**
 * Calculate bounds for a load element
 */
export function calculateLoadBounds(
  position: Point,
  options: LoadRendererOptions = {}
): { x: number; y: number; width: number; height: number } {
  const {
    size = 24,
  } = options;

  const halfSize = size / 2;
  const padding = 5;

  return {
    x: position.x - halfSize - padding,
    y: position.y - halfSize - padding,
    width: size + padding * 2,
    height: size + padding * 2,
  };
}

/**
 * Create a load diagram element
 */
export function createLoadElement(
  load: Load,
  position: Point,
  options: LoadRendererOptions = {}
): DiagramElement {
  const bounds = calculateLoadBounds(position, options);

  return {
    id: `load_${load.ibus}_${load.loadid || '0'}`,
    type: 'load',
    position,
    bounds,
    data: load,
  };
}
