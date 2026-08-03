/**
 * Generator Element Renderer
 * Renders generator elements as circles with 'G' inside
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  Generator,
} from '../../types';

export interface GeneratorRendererOptions {
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
 * Get color for voltage level (falls back to default generator color for compatibility)
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
  // Fallback to default generator color
  return style.generatorColor;
}

/**
 * Draw a generator symbol
 */
export function drawGenerator(
  ctx: CanvasRenderingContext2D,
  position: Point,
  data: Generator,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: GeneratorRendererOptions = {}
): void {
  const {
    size = style.generatorSize,
    connectedBusPosition,
    mirrored = false,
    busVoltage,
  } = options;

  // Check if element is offline (stat === 0)
  const isOffline = data?.stat === 0;

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Determine color based on voltage level and offline status
  let color = style.generatorColor;
  if (isSelected) color = style.selectedColor;
  else if (isHighlighted) color = style.highlightedColor;
  else if (options.unmodeled) color = '#ff69b4';        // dark pink: not in current model
  else if (isOffline) color = '#b0b0b0'; // Light gray for offline elements
  else if (busVoltage !== undefined) color = getVoltageLevelColor(busVoltage, style);

  // Draw connection line to bus first (so it appears behind the symbol)
  // The line is drawn vertically (perpendicular) from the bus to the generator
  // IMPORTANT: Draw connection line BEFORE applying mirroring transform
  if (connectedBusPosition) {
    const radius = size / 2;
    const connectionLineWidth = 1.5; // Constant width in world space

    // Determine which side of the bus we're connecting from
    const isFromLeftSide = position.x < connectedBusPosition.x;
    const perpendicularLength = 25; // Length of perpendicular segment

    // Calculate the perpendicular point (horizontal from bus connection)
    const perpendicularEnd = {
      x: connectedBusPosition.x + (isFromLeftSide ? -perpendicularLength : perpendicularLength),
      y: connectedBusPosition.y
    };

    // Calculate the point on the edge of the circle closest to the bus
    // When mirrored, connect to the right side; when not mirrored, connect to the left
    const edgeX = mirrored ? position.x + radius : position.x - radius;

    ctx.strokeStyle = color; // Same color as element
    ctx.lineWidth = connectionLineWidth;
    // Use dashed line for offline elements
    if (isOffline) {
      ctx.setLineDash([8, 4]);
    }
    ctx.beginPath();
    // Start from the exact bus connection point (at the bus edge)
    ctx.moveTo(connectedBusPosition.x, connectedBusPosition.y);
    // Draw perpendicular (horizontal) segment from bus
    ctx.lineTo(perpendicularEnd.x, perpendicularEnd.y);
    // Then connect to generator edge
    ctx.lineTo(edgeX, position.y);
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

  // Draw circle
  ctx.strokeStyle = color;
  ctx.fillStyle = style.backgroundColor;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(position.x, position.y, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();

  // Draw sinusoid (sine wave) inside
  // SVG coordinates: viewBox 0 0 120 120, circle at (60,60) radius 45
  // Path: M 30 60, C 40 40, 50 40, 60 60, C 70 80, 80 80, 90 60
  // Scale to our size
  const scaleX = size / 120;
  const scaleY = size / 120;
  const offsetX = position.x - size / 2;
  const offsetY = position.y - size / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Map SVG coordinates to canvas
  // M 30 60 -> Start point
  ctx.moveTo(offsetX + 30 * scaleX, offsetY + 60 * scaleY);

  // C 40 40, 50 40, 60 60 -> First cubic bezier (going up)
  // control1 (40, 40), control2 (50, 40), end (60, 60)
  ctx.bezierCurveTo(
    offsetX + 40 * scaleX, offsetY + 40 * scaleY,
    offsetX + 50 * scaleX, offsetY + 40 * scaleY,
    offsetX + 60 * scaleX, offsetY + 60 * scaleY
  );

  // C 70 80, 80 80, 90 60 -> Second cubic bezier (going down)
  // control1 (70, 80), control2 (80, 80), end (90, 60)
  ctx.bezierCurveTo(
    offsetX + 70 * scaleX, offsetY + 80 * scaleY,
    offsetX + 80 * scaleX, offsetY + 80 * scaleY,
    offsetX + 90 * scaleX, offsetY + 60 * scaleY
  );

  ctx.stroke();

  // Restore to undo mirroring for text
  ctx.restore();

  // Draw generation value (not affected by mirroring)
  const genData = data as Generator;
  const pg = genData?.pg;
  if (pg != null && typeof pg === 'number') {
    ctx.fillStyle = style.textColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `${pg.toFixed(1)} MW`,
      position.x,
      position.y + size / 2 + 12
    );
  }

  ctx.restore();
}

/**
 * Calculate bounds for a generator element
 */
export function calculateGeneratorBounds(
  position: Point,
  options: GeneratorRendererOptions = {}
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
 * Create a generator diagram element
 */
export function createGeneratorElement(
  gen: Generator,
  position: Point,
  options: GeneratorRendererOptions = {}
): DiagramElement {
  const bounds = calculateGeneratorBounds(position, options);

  return {
    id: `gen_${gen.ibus}_${gen.machid || '0'}`,
    type: 'generator',
    position,
    bounds,
    data: gen,
  };
}
