/**
 * Switched Shunt Element Renderer
 *
 * Same as fixed shunt but the ground-side plate is curved,
 * concave facing toward the bus-side plate.
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  SwitchedShunt,
} from '../../types';

export interface SwitchedShuntRendererOptions {
  size?: number;
  connectedBusPosition?: Point;
  mirrored?: boolean;
  busVoltage?: number;
  unmodeled?: boolean;
}

function getVoltageLevelCategory(kv: number): 'ehv' | 'hv' | 'mv' | 'lv' {
  if (kv >= 345) return 'ehv';
  if (kv >= 138) return 'hv';
  if (kv >= 34.5) return 'mv';
  return 'lv';
}

function getVoltageLevelColor(kv: number, style: RenderStyle): string {
  if (!kv || kv === 0) return '#000000';
  const level = getVoltageLevelCategory(kv);
  const voltageColors = (style as any).voltageColors;
  if (voltageColors && voltageColors[level]) return voltageColors[level];
  return style.shuntColor;
}

export function drawSwitchedShunt(
  ctx: CanvasRenderingContext2D,
  position: Point,
  data: SwitchedShunt,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: SwitchedShuntRendererOptions = {}
): void {
  const {
    size = style.shuntSize,
    connectedBusPosition,
    mirrored = false,
    busVoltage,
  } = options;

  const isOffline = data?.stat === 0;

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  let color = style.shuntColor;
  if (isSelected) color = style.selectedColor;
  else if (isHighlighted) color = style.highlightedColor;
  else if (options.unmodeled) color = '#ff69b4';        // dark pink: not in current model
  else if (isOffline) color = '#b0b0b0';
  else if (busVoltage !== undefined) color = getVoltageLevelColor(busVoltage, style);

  // Geometry
  const plateHeight = size;
  const plateGap = size * 0.2;
  const groundLeadLen = size * 0.3;
  const lineWidth = 1.5;

  const plateMidY = position.y;
  const plateTop = position.y - plateHeight / 2;
  const plateBot = position.y + plateHeight / 2;

  // mirrored=false → shunt is LEFT of bus → bus is on RIGHT → bus plate is right
  // mirrored=true  → shunt is RIGHT of bus → bus is on LEFT → bus plate is left
  const dir = mirrored ? -1 : 1;

  const groundPlateX = position.x;
  const busPlateX = position.x + dir * plateGap;
  const groundX = groundPlateX - dir * groundLeadLen;

  // --- Connection line from bus to bus-side plate ---
  if (connectedBusPosition) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (isOffline) ctx.setLineDash([8, 4]);

    const isFromLeftSide = position.x < connectedBusPosition.x;
    const perpLen = 25;
    const perpEnd = {
      x: connectedBusPosition.x + (isFromLeftSide ? -perpLen : perpLen),
      y: connectedBusPosition.y
    };

    ctx.beginPath();
    ctx.moveTo(connectedBusPosition.x, connectedBusPosition.y);
    ctx.lineTo(perpEnd.x, perpEnd.y);
    ctx.lineTo(busPlateX, plateMidY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Bus-side plate (straight vertical line)
  ctx.beginPath();
  ctx.moveTo(busPlateX, plateTop);
  ctx.lineTo(busPlateX, plateBot);
  ctx.stroke();

  // Ground-side plate — CURVED, concave away from bus-side plate
  // Curve bulges toward bus (inward), concave faces outward
  const curveBulge = plateGap * 0.35;
  ctx.beginPath();
  ctx.moveTo(groundPlateX, plateTop);
  ctx.quadraticCurveTo(
    groundPlateX + dir * curveBulge * 2,  // control X: inward (toward bus)
    plateMidY,
    groundPlateX,
    plateBot
  );
  ctx.stroke();

  // Horizontal line from curve midpoint to ground symbol
  // Quadratic bezier midpoint at t=0.5 is at: (startX + 2*ctrlX + endX) / 4
  // Since startX = groundPlateX, endX = groundPlateX, ctrlX = groundPlateX + dir*curveBulge*2
  // midpoint X = (groundPlateX + 2*(groundPlateX + dir*curveBulge*2) + groundPlateX) / 4
  //            = groundPlateX + dir * curveBulge
  const curveMidX = groundPlateX + dir * curveBulge;
  ctx.beginPath();
  ctx.moveTo(curveMidX, plateMidY);
  ctx.lineTo(groundX, plateMidY);
  ctx.stroke();

  // Ground symbol: three vertical lines of decreasing height
  const gSpacing = size * 0.1;
  const gBaseH = plateHeight * 0.5;
  for (let i = 0; i < 3; i++) {
    const x = groundX - dir * i * gSpacing;
    const h = gBaseH * (1 - i * 0.25);
    ctx.beginPath();
    ctx.moveTo(x, plateMidY - h / 2);
    ctx.lineTo(x, plateMidY + h / 2);
    ctx.stroke();
  }

  // Value label - show Q from power flow results if available
  const q = data?.q;
  if (q != null && typeof q === 'number') {
    ctx.fillStyle = style.textColor;
    ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${q.toFixed(1)} MVAr`, position.x + dir * plateGap / 2, plateTop - 5);
  }

  ctx.restore();
}

export function calculateSwitchedShuntBounds(
  position: Point,
  options: SwitchedShuntRendererOptions = {}
): { x: number; y: number; width: number; height: number } {
  const { size = 24 } = options;
  const halfSize = size / 2;
  const padding = 5;

  return {
    x: position.x - halfSize - padding - 10,
    y: position.y - halfSize - padding,
    width: size + padding * 2 + 15,
    height: size + padding * 2,
  };
}

export function createSwitchedShuntElement(
  shunt: SwitchedShunt,
  position: Point,
  options: SwitchedShuntRendererOptions = {}
): DiagramElement {
  const bounds = calculateSwitchedShuntBounds(position, options);
  return {
    id: `switched_shunt_${shunt.ibus}_${shunt.swid || '0'}`,
    type: 'switched_shunt',
    position,
    bounds,
    data: shunt,
  };
}
