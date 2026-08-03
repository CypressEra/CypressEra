/**
 * AC Line Element Renderer
 * Renders AC transmission lines
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  ACLine,
  ACLineFlowResult,
} from '../../types';

/** Line data that may be ACLine (ibus/jbus) or TwoTerminalDC (ipi/ipr) */
export type LineData = ACLine | (ACLine & { ipi?: number; ipr?: number; elementType?: string });

export interface LineRendererOptions {
  lineWidth?: number;
  labelRadius?: number;
  bundleIndex?: number;   // Index within edge bundle for spacing
  bundleTotal?: number;   // Total edges in bundle
  busVoltages?: Map<number, number>; // Map of bus numbers to their base kV
  /** Power flow results for this line */
  powerFlowData?: ACLineFlowResult;
  /** Whether to show flow values on the line */
  showFlowValues?: boolean;
  /** Element type: 'acline' | 'twotermdc' | 'vscdc' */
  elementType?: string;
  /** When true, paint the line dark pink to flag it as not present in the current model. */
  unmodeled?: boolean;
  /** Power flow for twotermdc (from twotermdc_results lookup by ipi/ipr) */
  twotermdcFlowData?: { p_flow: number; p_loss?: number };
  /** Power flow for VSC DC link (from vscdc_results lookup by ibus1/ibus2) */
  vscdcFlowData?: { p_converter1: number; p_converter2: number; p_loss?: number; q_converter1?: number; q_converter2?: number };
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
 * Get color for voltage level (falls back to default line color for compatibility)
 */
function getVoltageLevelColor(
  kv: number,
  style: RenderStyle
): string {
  const level = getVoltageLevelCategory(kv);
  // Check if style has voltage level colors
  const voltageColors = (style as any).voltageColors;
  if (voltageColors && voltageColors[level]) {
    return voltageColors[level];
  }
  // Fallback to default line color
  return style.lineColor;
}

/**
 * Draw an arrow head indicating power flow direction
 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  from: Point,
  size: number,
  color: string
): void {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return;

  // Unit vector pointing from 'from' to 'tip'
  const ux = dx / length;
  const uy = dy / length;

  // Calculate arrow head points
  const arrowAngle = Math.PI / 6; // 30 degrees
  const backLength = size * Math.cos(arrowAngle);
  const sideLength = size * Math.sin(arrowAngle);

  // Point behind the tip along the line
  const backX = tip.x - ux * backLength;
  const backY = tip.y - uy * backLength;

  // Perpendicular direction
  const perpX = -uy;
  const perpY = ux;

  // Arrow head corners
  const leftX = backX + perpX * sideLength;
  const leftY = backY + perpY * sideLength;
  const rightX = backX - perpX * sideLength;
  const rightY = backY - perpY * sideLength;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Draw a thyristor (SCR) circuit symbol on the line.
 * Standard schematic: main horizontal line, triangle (base left, tip right),
 * cathode vertical bar, gate with diagonal + short vertical stub.
 * Direction: anode at from, cathode at to.
 */
function drawThyristorSymbol(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
  color: string
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return;

  // Center of symbol on the line
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = 'none';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const angle = Math.atan2(dy, dx);
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const L = size;

  // 1) Main horizontal line (anode left, cathode right)
  ctx.beginPath();
  ctx.moveTo(-L, 0);
  ctx.lineTo(L, 0);
  ctx.stroke();

  // 2) Triangle (base vertical left, tip pointing right toward cathode) – make it larger
  const triBase = -L * 0.4;
  const triTip = L * 0.35;
  const triHalfH = L * 0.5;
  ctx.beginPath();
  ctx.moveTo(triBase, -triHalfH);
  ctx.lineTo(triTip, 0);
  ctx.lineTo(triBase, triHalfH);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();

  // 3) Cathode vertical bar (at triangle tip) – make it longer for clarity
  const barHalfH = L * 0.55;
  ctx.beginPath();
  const originalLineWidth = ctx.lineWidth;
  ctx.lineWidth = originalLineWidth
  ctx.moveTo(triTip, -barHalfH);
  ctx.lineTo(triTip, barHalfH);
  ctx.stroke();
  ctx.lineWidth = originalLineWidth;

  // 4) Gate: diagonal from top-right to center of cathode bar + vertical stub
  // Attach the gate at the vertical center of the cathode (y = 0 in local coords)
  const gateOutX = L * 0.6;
  const gateOutY = -L * 0.3;
  const gateInX = triTip;
  const gateInY = 0;

  // Diagonal gate lead
  ctx.beginPath();
  ctx.moveTo(gateOutX, gateOutY);
  ctx.lineTo(gateInX, gateInY);
  ctx.stroke();

  // Vertical gate stub – make it longer (length controls overall gate size)
  ctx.beginPath();
  ctx.moveTo(gateOutX, gateOutY - L * 0.5);
  ctx.lineTo(gateOutX, gateOutY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a VSC DC converter symbol on the line.
 * IGBT + anti-parallel diode (reference: vertical symbol, here rotated so path is along the line).
 * Two parallel branches: upper = IGBT (gate + arrow), lower = diode (triangle + cathode bar).
 */
function drawVscdcSymbol(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
  color: string
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return;

  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = 'none';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const angle = Math.atan2(dy, dx);
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const L = size;
  const leftX = -L * 0.72;
  const rightX = L * 0.72;
  const topY = -L * 0.38;   // IGBT branch
  const mainY = 0;          // Main line (diode on this line)

  // Left terminal: main line at y=0, branch up to IGBT
  ctx.beginPath();
  ctx.moveTo(leftX, mainY);
  ctx.lineTo(leftX, topY);
  ctx.stroke();
  // Right terminal: from IGBT branch down to main line
  ctx.beginPath();
  ctx.moveTo(rightX, topY);
  ctx.lineTo(rightX, mainY);
  ctx.stroke();

  // ----- IGBT branch (top): two slant legs to gate (no line between legs); gate = two flat lines + small vertical on top -----
  const leg1X = -L * 0.42;
  const leg2X = L * 0.42;
  const gateY1 = topY - L * 0.38;
  const gateY2 = topY - L * 0.5;
  const gateSmallVert = L * 0.12;
  const gateHalfW1 = L * 0.36;
  const gateHalfW2 = L * 0.22;
  const gateLeftX = -gateHalfW1 + 0.2 * (2 * gateHalfW1);
  const gateRightX = -gateHalfW1 + 0.8 * (2 * gateHalfW1);
  // Line from left terminal to first leg
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(leg1X, topY);
  ctx.stroke();
  // Leg 1 (collector): slant from line to left end of gate (current goes to gate through leg)
  ctx.beginPath();
  ctx.moveTo(leg1X, topY);
  ctx.lineTo(gateLeftX, gateY1);
  ctx.stroke();
  // Leg 2 (emitter): slant from line to right end of gate — this leg has the arrow
  ctx.beginPath();
  ctx.moveTo(leg2X, topY);
  ctx.lineTo(gateRightX, gateY1);
  ctx.stroke();
  // Line from second leg to right terminal
  ctx.beginPath();
  ctx.moveTo(leg2X, topY);
  ctx.lineTo(rightX, topY);
  ctx.stroke();
  // Gate: two flat lines (first/lower longer, upper shorter), small vertical on top
  ctx.beginPath();
  ctx.moveTo(-gateHalfW1, gateY1);
  ctx.lineTo(gateHalfW1, gateY1);
  ctx.moveTo(-gateHalfW2, gateY2);
  ctx.lineTo(gateHalfW2, gateY2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, gateY2);
  ctx.lineTo(0, gateY2 - gateSmallVert);
  ctx.stroke();
  // N-IGBT arrow at the end of the leg (near the gate)
  const t = 0.08;
  const arrowX = (1 - t) * leg2X + t * gateRightX;
  const arrowY = (1 - t) * topY + t * gateY1;
  const arrowHalfW = L * 0.04;
  const arrowH = L * 0.07;
  const legDx = leg2X - gateRightX;
  const legDy = topY - gateY1;
  const legLen = Math.sqrt(legDx * legDx + legDy * legDy) || 1;
  const dirX = legDx / legLen;
  const dirY = legDy / legLen;
  const perpX = -dirY;
  const perpY = dirX;
  const tipX = arrowX + dirX * arrowH;
  const tipY = arrowY + dirY * arrowH;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(arrowX - dirX * arrowH + perpX * arrowHalfW, arrowY - dirY * arrowH + perpY * arrowHalfW);
  ctx.lineTo(arrowX - dirX * arrowH - perpX * arrowHalfW, arrowY - dirY * arrowH - perpY * arrowHalfW);
  ctx.closePath();
  ctx.stroke();

  // ----- Anti-parallel diode on main line (y=0), diode centered at x=0 -----
  const diodeHalfW = L * 0.13;
  const barX = -diodeHalfW;
  const triBaseX = diodeHalfW;
  const barHalfH = L * 0.22;
  const triHalfH = L * 0.2;
  ctx.beginPath();
  ctx.moveTo(leftX, mainY);
  ctx.lineTo(barX, mainY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(barX, mainY - barHalfH);
  ctx.lineTo(barX, mainY + barHalfH);
  ctx.stroke();
  const triTipX = barX;
  ctx.beginPath();
  ctx.moveTo(triTipX, mainY);
  ctx.lineTo(triBaseX, mainY - triHalfH);
  ctx.lineTo(triBaseX, mainY + triHalfH);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(triBaseX, mainY);
  ctx.lineTo(rightX, mainY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw power flow labels (P and Q values) parallel to the line at a specific position
 *
 * IMPORTANT: The text must maintain a consistent relative position to the line:
 * - The distance from the line must be constant regardless of line angle
 * - The text must always be parallel to the line
 * - The text orientation must remain readable (not upside down)
 */
export function drawFlowLabelAtPoint(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  t: number,  // Position along line (0-1)
  perpOffset: number,  // Perpendicular distance from line (positive = one side, negative = other)
  powerFlow: number,
  reactiveFlow: number,
  style: RenderStyle
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return;

  // Calculate rotation angle for text (parallel to line)
  const angle = Math.atan2(dy, dx);

  // Calculate the position on the line at parameter t
  const lineX = from.x + dx * t;
  const lineY = from.y + dy * t;

  // Calculate perpendicular offset (rotated 90 degrees counter-clockwise)
  const perpX = -dy / length;
  const perpY = dx / length;

  // Calculate label position: point on line + perpendicular offset
  const labelX = lineX + perpX * perpOffset;
  const labelY = lineY + perpY * perpOffset;

  // Format the power values
  const absP = Math.abs(powerFlow);
  const formattedP = absP >= 1000
    ? `${(absP / 1000).toFixed(1)} kW`
    : `${absP.toFixed(1)} MW`;

  const absQ = Math.abs(reactiveFlow);
  const formattedQ = absQ >= 1000
    ? `${(absQ / 1000).toFixed(1)} kvar`
    : `${absQ.toFixed(1)} Mvar`;

  ctx.save();

  // CRITICAL: Translate to the label position FIRST, before any rotation
  ctx.translate(labelX, labelY);

  // Rotate text to be parallel to line
  // Ensure text is always readable (not upside down)
  let rotation = angle;
  if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
    rotation += Math.PI;
  }
  ctx.rotate(rotation);

  // Set font
  ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw the text (P on top, Q on bottom)
  // These offsets are in the text's local coordinate system (after rotation)
  const lineHeight = style.fontSizeSmall + 2;
  ctx.fillStyle = style.textColor;
  ctx.fillText(formattedP, 0, -lineHeight / 2);
  ctx.fillText(formattedQ, 0, lineHeight / 2);

  ctx.restore();
}

/**
 * Draw a power flow label (P value) parallel to the line
 * @deprecated Use drawFlowLabelAtPoint directly for more control
 */
function drawFlowLabel(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  powerFlow: number,
  reactiveFlow: number,
  style: RenderStyle
): void {
  drawFlowLabelAtPoint(ctx, from, to, 0.5, 15, powerFlow, reactiveFlow, style);
}

/** Detect if line data represents a two-terminal DC line (ipi → ipr) */
function isTwotermdc(data: LineData, options: LineRendererOptions): boolean {
  if (options.elementType === 'twotermdc') return true;
  const d = data as LineData & { ipi?: number; ipr?: number };
  return typeof d.ipi === 'number' && typeof d.ipr === 'number';
}

/** Detect if line data represents a VSC DC link (elementType = 'vscdc') */
function isVscdc(data: LineData, options: LineRendererOptions): boolean {
  return options.elementType === 'vscdc' || (data as any).elementType === 'vscdc';
}

/**
 * Draw an AC line with support for curved routing.
 * For twotermdc (elementType or data.ipi/ipr), draws two thyristor symbols along the line, direction ipi → ipr (iBusPos → jBusPos).
 */
export function drawACLine(
  ctx: CanvasRenderingContext2D,
  iBusPos: Point,
  jBusPos: Point,
  data: LineData,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: LineRendererOptions = {}
): void {
  const {
    lineWidth = style.lineWidth,
    labelRadius = 10,
    busVoltages,
    powerFlowData,
    showFlowValues = true,
    unmodeled = false,
  } = options;
  const UNMODELED_COLOR = '#ff69b4';        // dark pink: line/transformer not in current model

  const twotermdc = isTwotermdc(data, options);
  const vscdc = isVscdc(data, options);
  // For twotermdc, bus positions are ipi (from) and ipr (to); direction is ipi → ipr
  const fromPos = iBusPos;
  const toPos = jBusPos;

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Use butt line cap to ensure lines connect exactly at the bus edge without extending
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // Determine color based on state and voltage level
  let color = style.lineColor;

  // Bus numbers: twotermdc uses ipi/ipr, vscdc uses ibus/jbus, acline uses ibus/jbus
  const fromBusNum = twotermdc ? (data as any).ipi : data.ibus;
  const toBusNum = twotermdc ? (data as any).ipr : data.jbus;
  const iBusVoltage = busVoltages?.get(fromBusNum);
  const jBusVoltage = busVoltages?.get(toBusNum);
  const lineVoltage = iBusVoltage && jBusVoltage ? Math.max(iBusVoltage, jBusVoltage) : undefined;

  // Check if element is offline (stat === 0)
  const isOffline = data?.stat === 0;

  if (isSelected) color = style.lineSelectedColor;
  else if (isHighlighted) color = style.lineHighlightedColor;
  else if (unmodeled) color = UNMODELED_COLOR;
  else if (isOffline) color = '#b0b0b0'; // Light gray for offline elements
  else if (lineVoltage !== undefined) color = getVoltageLevelColor(lineVoltage, style);

  // Draw line with initial vertical segment from bus
  const VERTICAL_SEGMENT_LENGTH = 25; // Length of the initial vertical segment

  ctx.beginPath();
  ctx.moveTo(fromPos.x, fromPos.y);

  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Calculate the actual connection points (elbows) for arrow/symbol placement
  let fromElbow = fromPos;
  let toElbow = toPos;

  // Only add vertical segments if the line is long enough
  if (distance > VERTICAL_SEGMENT_LENGTH * 2) {
    const verticalSegmentEnd = {
      x: fromPos.x + (dx > 0 ? VERTICAL_SEGMENT_LENGTH : -VERTICAL_SEGMENT_LENGTH),
      y: fromPos.y
    };
    fromElbow = verticalSegmentEnd;
    ctx.lineTo(verticalSegmentEnd.x, verticalSegmentEnd.y);

    const verticalSegmentStart = {
      x: toPos.x + (dx > 0 ? -VERTICAL_SEGMENT_LENGTH : VERTICAL_SEGMENT_LENGTH),
      y: toPos.y
    };
    toElbow = verticalSegmentStart;
    ctx.lineTo(verticalSegmentStart.x, verticalSegmentStart.y);
    ctx.lineTo(toPos.x, toPos.y);
  } else {
    ctx.lineTo(toPos.x, toPos.y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  // Use dashed line for offline elements
  if (isOffline) {
    ctx.setLineDash([8, 4]);
  }
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash pattern

  // For twotermdc: draw two thyristor symbols on the main segment, direction ipi → ipr (fromElbow → toElbow)
  if (twotermdc) {
    const THYRISTOR_SIZE = 18;
    // Place symbols closer to the buses (toward ends of the segment)
    const t1 = 0.22; // near from-bus side
    const t2 = 0.78; // near to-bus side
    const p1 = {
      x: fromElbow.x + (toElbow.x - fromElbow.x) * t1,
      y: fromElbow.y + (toElbow.y - fromElbow.y) * t1,
    };
    const p2 = {
      x: fromElbow.x + (toElbow.x - fromElbow.x) * t2,
      y: fromElbow.y + (toElbow.y - fromElbow.y) * t2,
    };
    const segLen = Math.sqrt((toElbow.x - fromElbow.x) ** 2 + (toElbow.y - fromElbow.y) ** 2);
    const halfSeg = (segLen / 4) * 0.4; // slightly shorter local segment so symbol doesn't overlap bus connection
    const thyristorFrom1 = { x: p1.x - (toElbow.x - fromElbow.x) / segLen * halfSeg, y: p1.y - (toElbow.y - fromElbow.y) / segLen * halfSeg };
    const thyristorTo1 = { x: p1.x + (toElbow.x - fromElbow.x) / segLen * halfSeg, y: p1.y + (toElbow.y - fromElbow.y) / segLen * halfSeg };
    const thyristorFrom2 = { x: p2.x - (toElbow.x - fromElbow.x) / segLen * halfSeg, y: p2.y - (toElbow.y - fromElbow.y) / segLen * halfSeg };
    const thyristorTo2 = { x: p2.x + (toElbow.x - fromElbow.x) / segLen * halfSeg, y: p2.y + (toElbow.y - fromElbow.y) / segLen * halfSeg };
    drawThyristorSymbol(ctx, thyristorFrom1, thyristorTo1, THYRISTOR_SIZE, color);
    drawThyristorSymbol(ctx, thyristorFrom2, thyristorTo2, THYRISTOR_SIZE, color);
  }

  // For VSC DC: draw two converter symbols (one per converter), placed along the segment
  if (vscdc && distance > 0) {
    const VSC_SIZE = 26;
    const t1 = 0.28; // first converter, toward from-bus
    const t2 = 0.72; // second converter, toward to-bus
    const p1 = {
      x: fromElbow.x + (toElbow.x - fromElbow.x) * t1,
      y: fromElbow.y + (toElbow.y - fromElbow.y) * t1,
    };
    const p2 = {
      x: fromElbow.x + (toElbow.x - fromElbow.x) * t2,
      y: fromElbow.y + (toElbow.y - fromElbow.y) * t2,
    };
    const segLen = Math.sqrt((toElbow.x - fromElbow.x) ** 2 + (toElbow.y - fromElbow.y) ** 2);
    const halfSeg = (segLen / 4) * 0.45;
    const dx = (toElbow.x - fromElbow.x) / segLen;
    const dy = (toElbow.y - fromElbow.y) / segLen;
    const localFrom1 = { x: p1.x - dx * halfSeg, y: p1.y - dy * halfSeg };
    const localTo1 = { x: p1.x + dx * halfSeg, y: p1.y + dy * halfSeg };
    const localFrom2 = { x: p2.x - dx * halfSeg, y: p2.y - dy * halfSeg };
    const localTo2 = { x: p2.x + dx * halfSeg, y: p2.y + dy * halfSeg };
    drawVscdcSymbol(ctx, localFrom1, localTo1, VSC_SIZE, color);
    drawVscdcSymbol(ctx, localFrom2, localTo2, VSC_SIZE, color);
  }

  // Draw power flow arrows and labels if data is available and line is in service (AC lines only)
  if (!twotermdc && !vscdc && showFlowValues && powerFlowData && data?.stat !== 0) {
    const pFlow = powerFlowData.p_from ?? 0;  // Active power flow value from SDK
    const pLoss = powerFlowData.losses_mw ?? 0;  // Power loss in MW
    const qFlow = powerFlowData.q_from ?? 0;  // Reactive power flow from ibus to jbus
    const qLoss = powerFlowData.losses_mvar ?? 0;  // Reactive power loss in Mvar

    // Calculate power at each end
    // NOTE: In the current SDK data, positive p_from corresponds to net flow
    // towards ibus (jbus → ibus). To match the desired convention:
    // - Effective flow ibus → jbus when pFlow < 0
    // - Effective flow jbus → ibus when pFlow > 0
    //
    // For labels we still display magnitudes based on the raw values.
    const pAtIbus = pFlow;
    const pAtJbus = pFlow - pLoss;

    // Calculate reactive power at each end
    const qAtIbus = qFlow;  // Reactive power at ibus end
    const qAtJbus = qFlow - qLoss;  // Reactive power at jbus end

    // Only draw if there's meaningful power flow
    if (Math.abs(pFlow) > 0.01) {
      const ARROW_SIZE = 10;
      const arrowColor = isSelected ? style.lineSelectedColor : '#3b82f6';

      // Determine flow direction based on sign of pFlow
      // Effective convention we want:
      // - When "p_flow" (SDK value) is positive  → direction jbus → ibus
      // - When "p_flow" is negative            → direction ibus → jbus
      const flowFromIbus = pFlow <= 0;

      if (flowFromIbus) {
        // Flow: ibus → jbus
        drawArrowHead(ctx, fromElbow, toElbow, ARROW_SIZE, arrowColor);
        drawArrowHead(ctx, toElbow, toPos, ARROW_SIZE, arrowColor);
      } else {
        // Flow: jbus → ibus (reverse flow)
        drawArrowHead(ctx, toElbow, fromElbow, ARROW_SIZE, arrowColor);
        drawArrowHead(ctx, fromElbow, fromPos, ARROW_SIZE, arrowColor);
      }

      // Draw P and Q labels at ibus end (offset from the line)
      // Use fromElbow and toElbow (the main line, excluding vertical segments)
      // Position label at 15% from ibus end, 20 pixels perpendicular offset
      drawFlowLabelAtPoint(ctx, fromElbow, toElbow, 0.15, 20, pAtIbus, qAtIbus, style);

      // Draw P and Q labels at jbus end (offset from the line)
      // Use fromElbow and toElbow (the main line, excluding vertical segments)
      // Position label at 85% from ibus end (15% from jbus), 20 pixels perpendicular offset
      drawFlowLabelAtPoint(ctx, fromElbow, toElbow, 0.85, 20, pAtJbus, qAtJbus, style);
    }
  } else if (twotermdc && showFlowValues && data?.stat !== 0) {
    // For two-terminal DC lines: prefer flow from twotermdc_results (passed in options), else from element data
    const dcFlow = options.twotermdcFlowData?.p_flow ?? (data as any).p_flow;
    if (typeof dcFlow === 'number') {
      // Single label near the middle of the line (show even when 0)
      drawFlowLabelAtPoint(ctx, fromElbow, toElbow, 0.5, 25, dcFlow, 0, style);
    }
  } else if (vscdc && showFlowValues && data?.stat !== 0) {
    // For VSC DC links: show power at both converters using vscdc_results (or element data as fallback)
    const p1 = options.vscdcFlowData?.p_converter1 ?? (data as any).p_converter1;
    const p2 = options.vscdcFlowData?.p_converter2 ?? (data as any).p_converter2;
    const q1 = options.vscdcFlowData?.q_converter1 ?? (data as any).q_converter1 ?? 0;
    const q2 = options.vscdcFlowData?.q_converter2 ?? (data as any).q_converter2 ?? 0;

    if (typeof p1 === 'number') {
      // Label near ibus1 end (fromElbow side)
      drawFlowLabelAtPoint(ctx, fromElbow, toElbow, 0.18, 25, p1, q1, style);
    }
    if (typeof p2 === 'number') {
      // Label near ibus2 end (toElbow side)
      drawFlowLabelAtPoint(ctx, fromElbow, toElbow, 0.82, 25, p2, q2, style);
    }

    // Draw arrows to indicate net DC power direction between converters.
    // Convention here: if p_converter1 > 0, treat flow as from ibus1 → ibus2.
    if (typeof p1 === 'number' && Math.abs(p1) > 0.01) {
      const ARROW_SIZE = 10;
      const arrowColor = isSelected ? style.lineSelectedColor : '#3b82f6';
      const flowFromBus1 = p1 > 0;

      if (flowFromBus1) {
        // Flow: ibus1 → ibus2
        drawArrowHead(ctx, fromElbow, toElbow, ARROW_SIZE, arrowColor);
        drawArrowHead(ctx, toElbow, toPos, ARROW_SIZE, arrowColor);
      } else {
        // Flow: ibus2 → ibus1
        drawArrowHead(ctx, toElbow, fromElbow, ARROW_SIZE, arrowColor);
        drawArrowHead(ctx, fromElbow, fromPos, ARROW_SIZE, arrowColor);
      }
    }
  }

  ctx.restore();
}

/**
 * Calculate bounds for a line element
 */
export function calculateLineBounds(
  iBusPos: Point,
  jBusPos: Point,
  options: LineRendererOptions = {}
): { x: number; y: number; width: number; height: number } {
  const {
    lineWidth = 3,
  } = options;

  const padding = lineWidth / 2 + 5;

  return {
    x: Math.min(iBusPos.x, jBusPos.x) - padding,
    y: Math.min(iBusPos.y, jBusPos.y) - padding,
    width: Math.abs(jBusPos.x - iBusPos.x) + padding * 2,
    height: Math.abs(jBusPos.y - iBusPos.y) + padding * 2,
  };
}

/**
 * Create a line diagram element (AC or DC / twotermdc)
 */
export function createLineElement(
  line: ACLine,
  iBusPos: Point,
  jBusPos: Point,
  index: number,
  options: LineRendererOptions = {}
): DiagramElement {
  const bounds = calculateLineBounds(iBusPos, jBusPos, options);
  const lineData = line as LineData;
  const isTwotermdc = options.elementType === 'twotermdc' || (typeof (lineData as any).ipi === 'number' && typeof (lineData as any).ipr === 'number');
  const fromBus = isTwotermdc ? (lineData as any).ipi : line.ibus;
  const toBus = isTwotermdc ? (lineData as any).ipr : line.jbus;

  return {
    id: isTwotermdc ? `twotermdc_${fromBus}_${toBus}_${(lineData as any).ckt ?? index}` : `acline_${line.ibus}_${line.jbus}_${line.ckt || index}`,
    type: 'acline',
    position: iBusPos,
    bounds,
    data: line,
    toPos: jBusPos, // Store jbus position for drawing
  } as DiagramElement & { toPos: Point };
}

/**
 * Test if a point hits a line segment
 */
export function hitTestLine(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
  tolerance: number = 5
): boolean {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= tolerance;
}
