/**
 * Transformer Element Renderer
 * Renders transformer symbols with dual circles
 *
 * SVG references:
 * - Two-winding: viewBox 0 0 200 120, circles at cx=90 and cx=115 with r=25 (50% overlap)
 * - Three-winding: viewBox 0 0 200 200, circles at (100,70), (70,140), (130,140) with r=50
 */

import {
  Point,
  Transform,
  DiagramElement,
  RenderStyle,
  Transformer,
} from '../../types';
import { drawFlowLabelAtPoint } from './line';

export interface TransformerRendererOptions {
  size?: number;
  lineWidth?: number;
  kBusPosition?: Point;  // Third bus (k) position for three-winding transformers
  busVoltages?: Map<number, number>;  // Map from bus number to base kV (baskv)
  /** Power flow result for this transformer */
  powerFlowData?: {
    p_from?: number;
    q_from?: number;
    p_to?: number;
    q_to?: number;
    // Three-winding transformer flows
    p_flow_1?: number;
    q_flow_1?: number;
    p_flow_2?: number;
    q_flow_2?: number;
    p_flow_3?: number;
    q_flow_3?: number;
  };
  /** Whether to show flow values on the transformer */
  showFlowValues?: boolean;
  /** When true, paint dark pink to flag the transformer as not present in the current model. */
  unmodeled?: boolean;
}

/**
 * Format voltage levels into a string like "138/345 kV"
 */
function formatVoltageLabel(
  ibus: number,
  jbus: number,
  kbus: number | undefined,
  busVoltages?: Map<number, number>
): string {
  const voltages: number[] = [];

  const iVoltage = busVoltages?.get(ibus);
  const jVoltage = busVoltages?.get(jbus);
  const kVoltage = kbus ? busVoltages?.get(kbus) : undefined;

  if (iVoltage) voltages.push(iVoltage);
  if (jVoltage) voltages.push(jVoltage);
  if (kVoltage) voltages.push(kVoltage);

  if (voltages.length === 0) {
    // Fallback to showing winding type if no voltage data
    return kbus ? '3W' : '2W';
  }

  // Sort voltages ascending for consistent display
  voltages.sort((a, b) => a - b);

  return voltages.join('/') + ' kV';
}

/**
 * Draw a two-winding transformer symbol
 */
export function drawTransformer(
  ctx: CanvasRenderingContext2D,
  iBusPos: Point,
  jBusPos: Point,
  data: Transformer,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean = false,
  isHighlighted: boolean = false,
  options: TransformerRendererOptions = {}
): void {
  const {
    size = style.transformerSize,
    lineWidth = style.lineWidth,
  } = options;

  // Check if this is a three-winding transformer (kbus > 0 means three-winding, kbus = 0 or undefined means two-winding)
  const isThreeWinding = data.kbus && data.kbus > 0;

  if (isThreeWinding) {
    // Three-winding transformer: three overlapping circles with three connection lines
    const { kBusPosition } = options;
    drawThreeWindingTransformer(ctx, iBusPos, jBusPos, data, transform, style, isSelected, isHighlighted, size, lineWidth, kBusPosition, options);
  } else {
    // Two-winding transformer: two circles side by side
    drawTwoWindingTransformer(ctx, iBusPos, jBusPos, data, transform, style, isSelected, isHighlighted, size, lineWidth, options);
  }
}

/**
 * Draw a two-winding transformer (two circles side by side)
 */
function drawTwoWindingTransformer(
  ctx: CanvasRenderingContext2D,
  iBusPos: Point,
  jBusPos: Point,
  data: Transformer,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean,
  isHighlighted: boolean,
  size: number,
  lineWidth: number,
  options: TransformerRendererOptions
): void {
  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Use butt line cap to ensure lines connect exactly at the bus edge without extending
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const angle = Math.atan2(jBusPos.y - iBusPos.y, jBusPos.x - iBusPos.x);

  // Calculate midpoint
  const midX = (iBusPos.x + jBusPos.x) / 2;
  const midY = (iBusPos.y + jBusPos.y) / 2;

  // Check if element is offline (stat === 0)
  const isOffline = data?.stat === 0;
  const unmodeled = options.unmodeled === true;

  // Determine color based on theme
  let color = style.transformerColor;
  if (isSelected) color = style.selectedColor;
  else if (isHighlighted) color = style.highlightedColor;
  else if (unmodeled) color = '#ff69b4';                // dark pink: not in current model
  else if (isOffline) color = '#b0b0b0'; // Light gray for offline elements

  // Based on SVG: circles at cx=90 and cx=115 with r=25
  // Circle centers are 25px apart
  // Scale: SVG viewBox 0 0 200 120, we scale this to our size
  // SVG circle radius = 25, SVG circle spacing = 25
  // Scale factor = size / 50 (where 50 is SVG diameter)
  const scaleFactor = size / 50;
  const circleOffset = 25 * scaleFactor * 0.7; // Reduced overlap (70% of spacing = ~30% overlap)

  // First circle (left)
  const circle1X = midX - circleOffset * Math.cos(angle);
  const circle1Y = midY - circleOffset * Math.sin(angle);

  // Second circle (right)
  const circle2X = midX + circleOffset * Math.cos(angle);
  const circle2Y = midY + circleOffset * Math.sin(angle);

  // Draw transformer circles (two circles with reduced overlap)
  ctx.shadowBlur = 0;
  ctx.fillStyle = style.backgroundColor;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  // Fill both circles first
  ctx.beginPath();
  ctx.arc(circle1X, circle1Y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(circle2X, circle2Y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Then stroke both circles
  ctx.beginPath();
  ctx.arc(circle1X, circle1Y, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(circle2X, circle2Y, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Draw connecting lines to transformer with fixed vertical segments from circles
  // Draw these AFTER circles so they appear on top
  const FIXED_LINE_LENGTH = size * 0.4; // Fixed vertical line from circle edge
  const VERTICAL_SEGMENT_LENGTH = 25; // Length of the initial vertical segment from bus
  const connectionLineWidth = 1.5; // Constant width in world space

  ctx.strokeStyle = isOffline ? '#b0b0b0' : style.transformerColor; // Light gray for offline, theme color for online
  ctx.lineWidth = connectionLineWidth;
  // Use dashed line for offline elements
  if (isOffline) {
    ctx.setLineDash([8, 4]);
  }

  // Connection points at the edges of the circles
  const firstCircleEdgeX = circle1X - (size / 2) * Math.cos(angle);
  const firstCircleEdgeY = circle1Y - (size / 2) * Math.sin(angle);

  const secondCircleEdgeX = circle2X + (size / 2) * Math.cos(angle);
  const secondCircleEdgeY = circle2Y + (size / 2) * Math.sin(angle);

  // Fixed vertical line from first circle edge (extends OUTWARD from circle toward bus)
  const firstFixedLineEndX = firstCircleEdgeX - FIXED_LINE_LENGTH * Math.cos(angle);
  const firstFixedLineEndY = firstCircleEdgeY - FIXED_LINE_LENGTH * Math.sin(angle);

  // Fixed vertical line from second circle edge (extends OUTWARD from circle toward bus)
  const secondFixedLineEndX = secondCircleEdgeX + FIXED_LINE_LENGTH * Math.cos(angle);
  const secondFixedLineEndY = secondCircleEdgeY + FIXED_LINE_LENGTH * Math.sin(angle);

  // Line from first bus to first circle (single continuous line)
  ctx.beginPath();
  // Start from the exact bus connection point (at the bus edge)
  ctx.moveTo(iBusPos.x, iBusPos.y);
  // Draw vertical segment from bus
  ctx.lineTo(iBusPos.x + (jBusPos.x > iBusPos.x ? VERTICAL_SEGMENT_LENGTH : -VERTICAL_SEGMENT_LENGTH), iBusPos.y);
  // Then connect to the fixed line end point (which extends from circle toward bus)
  ctx.lineTo(firstFixedLineEndX, firstFixedLineEndY);
  // Then draw the stretch-out line from fixed line end to circle edge
  ctx.lineTo(firstCircleEdgeX, firstCircleEdgeY);
  ctx.stroke();

  // Line from second circle to second bus (single continuous line)
  ctx.beginPath();
  // Start from the circle edge
  ctx.moveTo(secondCircleEdgeX, secondCircleEdgeY);
  // Draw the stretch-out line from circle edge to fixed line end
  ctx.lineTo(secondFixedLineEndX, secondFixedLineEndY);
  // Then draw to the end of vertical segment
  ctx.lineTo(jBusPos.x + (jBusPos.x > iBusPos.x ? -VERTICAL_SEGMENT_LENGTH : VERTICAL_SEGMENT_LENGTH), jBusPos.y);
  // Then draw vertical segment to bus
  ctx.lineTo(jBusPos.x, jBusPos.y);
  ctx.stroke();

  // Reset dash pattern
  ctx.setLineDash([]);

  // Draw transformer voltage label
  ctx.fillStyle = style.textColor;
  ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Calculate perpendicular offset for label
  const perpAngle = angle + Math.PI / 2;
  const labelOffset = size + 10;
  const labelX = midX + labelOffset * Math.cos(perpAngle);
  const labelY = midY + labelOffset * Math.sin(perpAngle);

  const voltageLabel = formatVoltageLabel(data.ibus, data.jbus, undefined, options.busVoltages);
  ctx.fillText(voltageLabel, labelX, labelY);

  // Draw power flow labels (P and Q) near each bus, the same way AC lines do
  const { powerFlowData, showFlowValues = true } = options;
  if (showFlowValues && powerFlowData && !isOffline) {
    const pFrom = powerFlowData.p_from ?? 0;  // Active power at the ibus winding
    const qFrom = powerFlowData.q_from ?? 0;  // Reactive power at the ibus winding
    const pTo = powerFlowData.p_to ?? 0;      // Active power at the jbus winding
    const qTo = powerFlowData.q_to ?? 0;      // Reactive power at the jbus winding

    // Only draw if there is meaningful power flow
    if (
      Math.abs(pFrom) > 0.01 || Math.abs(qFrom) > 0.01 ||
      Math.abs(pTo) > 0.01 || Math.abs(qTo) > 0.01
    ) {
      // P and Q near the ibus end
      drawFlowLabelAtPoint(ctx, iBusPos, jBusPos, 0.2, 22, pFrom, qFrom, style);
      // P and Q near the jbus end
      drawFlowLabelAtPoint(ctx, iBusPos, jBusPos, 0.8, 22, pTo, qTo, style);
    }
  }

  ctx.restore();
}

/**
 * Calculate the optimal orientation for a three-winding transformer based on bus positions
 * Returns which bus should connect to which circle and the rotation angle
 */
function calculateThreeWindingOrientation(
  iBusPos: Point,
  jBusPos: Point,
  kBusPosition: Point
): {
  rotationAngle: number;
  kRelativeToIJ: 'kbus' | 'ibus' | 'jbus';
  midPoint: Point;
} {
  const midX = (iBusPos.x + jBusPos.x) / 2;
  const midY = (iBusPos.y + jBusPos.y) / 2;

  // Vector from midpoint to k bus
  const kVectorX = kBusPosition.x - midX;
  const kVectorY = kBusPosition.y - midY;

  // Angle of k bus relative to the I-J line
  const ijAngle = Math.atan2(jBusPos.y - iBusPos.y, jBusPos.x - iBusPos.x);
  const kAngle = Math.atan2(kVectorY, kVectorX);

  // Normalize the angle difference to [-PI, PI]
  let angleDiff = kAngle - ijAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Determine position based on angle
  // The standard triangle formation has circles at:
  // - kbus position: 90 degrees from the I-J line
  // - ibus position: -30 degrees from the I-J line
  // - jbus position: 210 degrees from the I-J line (or -150)
  let kRelativeToIJ: 'kbus' | 'ibus' | 'jbus';
  let rotationAngle = 0;

  if (angleDiff > Math.PI / 4 && angleDiff < 3 * Math.PI / 4) {
    // k bus is roughly perpendicular (kbus position)
    kRelativeToIJ = 'kbus';
    rotationAngle = 0; // No rotation needed
  } else if (angleDiff >= -Math.PI / 12 && angleDiff <= Math.PI / 4) {
    // k bus is roughly in line with I-J (jbus position)
    kRelativeToIJ = 'jbus';
    rotationAngle = -2 * Math.PI / 3; // Rotate 120 degrees counterclockwise
  } else {
    // k bus is on the other side (ibus position)
    kRelativeToIJ = 'ibus';
    rotationAngle = 2 * Math.PI / 3; // Rotate 120 degrees clockwise
  }

  return {
    rotationAngle,
    kRelativeToIJ,
    midPoint: { x: midX, y: midY }
  };
}

/**
 * Draw a three-winding transformer (three overlapping circles with three connection lines)
 */
function drawThreeWindingTransformer(
  ctx: CanvasRenderingContext2D,
  iBusPos: Point,
  jBusPos: Point,
  data: Transformer,
  transform: Transform,
  style: RenderStyle,
  isSelected: boolean,
  isHighlighted: boolean,
  size: number,
  lineWidth: number,
  kBusPosition?: Point,
  options: TransformerRendererOptions = {}
): void {

  ctx.save();
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // Use butt line cap to ensure lines connect exactly at the bus edge without extending
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const midX = (iBusPos.x + jBusPos.x) / 2;
  const midY = (iBusPos.y + jBusPos.y) / 2;
  const angle = Math.atan2(jBusPos.y - iBusPos.y, jBusPos.x - iBusPos.x);

  // Use the actual k bus position if provided, otherwise calculate it
  let kBusX: number;
  let kBusY: number;

  if (kBusPosition) {
    kBusX = kBusPosition.x;
    kBusY = kBusPosition.y;
  } else {
    // Fallback: calculate k bus position (perpendicular to the line)
    const kBusDistance = size * 2.5;
    const perpAngle = angle + Math.PI / 2;
    kBusX = midX + kBusDistance * Math.cos(perpAngle);
    kBusY = midY + kBusDistance * Math.sin(perpAngle);
  }

  // Check if element is offline (stat === 0)
  const isOffline = data?.stat === 0;
  const unmodeled = options.unmodeled === true;

  // Determine color based on theme
  let color = style.transformerColor;
  if (isSelected) color = style.selectedColor;
  else if (isHighlighted) color = style.highlightedColor;
  else if (unmodeled) color = '#ff69b4';                // dark pink: not in current model
  else if (isOffline) color = '#b0b0b0'; // Light gray for offline elements

  // Calculate optimal orientation based on bus positions
  const orientation = calculateThreeWindingOrientation(iBusPos, jBusPos, { x: kBusX, y: kBusY });

  // Define circle positions matching SVG layout (scaled to size)
  // SVG: viewBox 0 0 200 200, circles at (100,70), (70,140), (130,140) with r=50
  // Scale factor = size / 100 (where 100 is SVG diameter)
  const scaleFactor = size / 100;

  // Standard triangle formation (before rotation)
  // kbus circle (SVG: cx=100, cy=70) - offset is (0, -30) from center (100,100)
  let topCircleX = 0;
  let topCircleY = -30 * scaleFactor;

  // ibus circle (SVG: cx=70, cy=140) - offset is (-30, +40) from center
  let bottomLeftCircleX = -30 * scaleFactor;
  let bottomLeftCircleY = 40 * scaleFactor;

  // jbus circle (SVG: cx=130, cy=140) - offset is (+30, +40) from center
  let bottomRightCircleX = 30 * scaleFactor;
  let bottomRightCircleY = 40 * scaleFactor;

  // Apply rotation if needed to better align with bus positions
  const cosRot = Math.cos(orientation.rotationAngle);
  const sinRot = Math.sin(orientation.rotationAngle);

  // Rotate each circle position around the center (0,0)
  const rotatePoint = (x: number, y: number) => ({
    x: x * cosRot - y * sinRot,
    y: x * sinRot + y * cosRot
  });

  const topCircleRotated = rotatePoint(topCircleX, topCircleY);
  const bottomLeftCircleRotated = rotatePoint(bottomLeftCircleX, bottomLeftCircleY);
  const bottomRightCircleRotated = rotatePoint(bottomRightCircleX, bottomRightCircleY);

  // Apply the rotation and translate to midpoint
  // Also rotate to align with the I-J line angle
  const cosIJ = Math.cos(angle);
  const sinIJ = Math.sin(angle);

  const transformPoint = (p: { x: number; y: number }) => ({
    x: midX + (p.x * cosIJ - p.y * sinIJ),
    y: midY + (p.x * sinIJ + p.y * cosIJ)
  });

  const topCircle = transformPoint(topCircleRotated);
  const bottomLeftCircle = transformPoint(bottomLeftCircleRotated);
  const bottomRightCircle = transformPoint(bottomRightCircleRotated);

  // Draw three overlapping circles at the center (triangle formation)
  ctx.shadowBlur = 0;
  ctx.fillStyle = style.backgroundColor;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  // Fill all circles first
  ctx.beginPath();
  ctx.arc(topCircle.x, topCircle.y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bottomLeftCircle.x, bottomLeftCircle.y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bottomRightCircle.x, bottomRightCircle.y, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Then stroke all circles
  ctx.beginPath();
  ctx.arc(topCircle.x, topCircle.y, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bottomLeftCircle.x, bottomLeftCircle.y, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bottomRightCircle.x, bottomRightCircle.y, size / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Draw three connection lines to buses with fixed straight segments from circles
  // Draw these AFTER circles so they appear on top
  const FIXED_LINE_LENGTH = size * 0.3; // Fixed straight line from circle edge
  const VERTICAL_SEGMENT_LENGTH = 25; // Length of the initial vertical segment from bus
  const connectionLineWidth = 1.5; // Constant width in world space

  ctx.strokeStyle = isOffline ? '#b0b0b0' : style.transformerColor; // Light gray for offline, theme color for online
  ctx.lineWidth = connectionLineWidth;
  // Use dashed line for offline elements
  if (isOffline) {
    ctx.setLineDash([8, 4]);
  }

  // Determine which circle connects to which bus based on orientation
  // Each circle position maps to a specific bus (kbus, ibus, jbus)
  const circles = [
    { pos: topCircle, name: 'kbus' },
    { pos: bottomLeftCircle, name: 'ibus' },
    { pos: bottomRightCircle, name: 'jbus' }
  ];

  const buses = [
    { pos: iBusPos, name: 'ibus' },
    { pos: jBusPos, name: 'jbus' },
    { pos: { x: kBusX, y: kBusY }, name: 'kbus' }
  ];

  // Match each circle to its nearest bus
  const matchedBuses = new Map<string, Point>();
  const usedBuses = new Set<number>();

  // Sort circles by distance to buses and assign unique matches
  const sortedPairs = circles.flatMap(circle => {
    return buses.map(bus => ({
      circle: circle.pos,
      circleName: circle.name,
      bus: bus.pos,
      busName: bus.name,
      distance: Math.hypot(circle.pos.x - bus.pos.x, circle.pos.y - bus.pos.y)
    }));
  }).sort((a, b) => a.distance - b.distance);

  // Assign each circle to its nearest unused bus
  sortedPairs.forEach(pair => {
    const busKey = `${pair.bus.x}_${pair.bus.y}`;
    if (!matchedBuses.has(pair.circleName) && !usedBuses.has(busKey.charCodeAt(0))) {
      matchedBuses.set(pair.circleName, pair.bus);
      usedBuses.add(busKey.charCodeAt(0));
    }
  });

  // Fallback: if any bus wasn't matched, assign it to the remaining circle
  if (matchedBuses.size < 3) {
    const unmatchedCircles = circles.filter(c => !matchedBuses.has(c.name)).map(c => c.pos);
    const unmatchedBuses = buses.filter(b => {
      const isMatched = Array.from(matchedBuses.values()).some(
        matched => matched.x === b.pos.x && matched.y === b.pos.y
      );
      return !isMatched;
    }).map(b => b.pos);

    unmatchedCircles.forEach((circle, i) => {
      if (unmatchedBuses[i]) {
        const circleName = circles.find(c => c.pos === circle)!.name;
        matchedBuses.set(circleName, unmatchedBuses[i]);
      }
    });
  }

  // Helper function to draw connection line from circle to bus
  const drawConnectionLine = (
    circlePos: Point,
    busPos: Point,
    midpoint: Point
  ): void => {
    // Calculate direction from circle center to bus
    const dirX = busPos.x - circlePos.x;
    const dirY = busPos.y - circlePos.y;
    const dist = Math.hypot(dirX, dirY) || 1;
    const normX = dirX / dist;
    const normY = dirY / dist;

    // Circle edge point (on the side toward the bus)
    const circleEdgeX = circlePos.x + (size / 2) * normX;
    const circleEdgeY = circlePos.y + (size / 2) * normY;

    // Fixed line end point (extends outward from circle toward bus)
    const fixedLineEndX = circleEdgeX + FIXED_LINE_LENGTH * normX;
    const fixedLineEndY = circleEdgeY + FIXED_LINE_LENGTH * normY;

    // Determine vertical segment direction based on bus position relative to midpoint
    const isBusRight = busPos.x > midpoint.x;

    // Draw the connection line
    ctx.beginPath();
    ctx.moveTo(busPos.x, busPos.y);
    // Draw vertical segment from bus
    ctx.lineTo(
      busPos.x + (isBusRight ? -VERTICAL_SEGMENT_LENGTH : VERTICAL_SEGMENT_LENGTH),
      busPos.y
    );
    // Connect to fixed line end point
    ctx.lineTo(fixedLineEndX, fixedLineEndY);
    // Draw line to circle edge
    ctx.lineTo(circleEdgeX, circleEdgeY);
    ctx.stroke();
  };

  // Draw connection lines
  circles.forEach(circle => {
    const bus = matchedBuses.get(circle.name);
    if (bus) {
      drawConnectionLine(circle.pos, bus, { x: midX, y: midY });
    }
  });

  // Reset dash pattern
  ctx.setLineDash([]);

  // Draw transformer voltage label
  ctx.fillStyle = style.textColor;
  ctx.font = `${style.fontSizeSmall}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Position label away from the k bus (on the opposite side)
  const kVectorX = kBusX - midX;
  const kVectorY = kBusY - midY;
  const kDist = Math.hypot(kVectorX, kVectorY) || 1;
  const labelOffset = size + 10;

  // Place label on the opposite side from k bus
  const labelX = midX - (kVectorX / kDist) * labelOffset;
  const labelY = midY - (kVectorY / kDist) * labelOffset;

  const voltageLabel = formatVoltageLabel(data.ibus, data.jbus, data.kbus, options.busVoltages);
  ctx.fillText(voltageLabel, labelX, labelY);

  // Draw power flow labels (P and Q) near each winding, the same way AC lines do
  const { powerFlowData, showFlowValues = true } = options;
  if (showFlowValues && powerFlowData && !isOffline) {
    const p1 = powerFlowData.p_flow_1 ?? 0;  // Active power at the ibus winding
    const q1 = powerFlowData.q_flow_1 ?? 0;  // Reactive power at the ibus winding
    const p2 = powerFlowData.p_flow_2 ?? 0;  // Active power at the jbus winding
    const q2 = powerFlowData.q_flow_2 ?? 0;  // Reactive power at the jbus winding
    const p3 = powerFlowData.p_flow_3 ?? 0;  // Active power at the kbus winding
    const q3 = powerFlowData.q_flow_3 ?? 0;  // Reactive power at the kbus winding

    // Only draw if there is meaningful power flow on any winding
    if ([p1, q1, p2, q2, p3, q3].some(v => Math.abs(v) > 0.01)) {
      const mid: Point = { x: midX, y: midY };
      // P and Q near the ibus winding
      drawFlowLabelAtPoint(ctx, iBusPos, mid, 0.3, 22, p1, q1, style);
      // P and Q near the jbus winding
      drawFlowLabelAtPoint(ctx, jBusPos, mid, 0.3, 22, p2, q2, style);
      // P and Q near the kbus winding
      drawFlowLabelAtPoint(ctx, { x: kBusX, y: kBusY }, mid, 0.3, 22, p3, q3, style);
    }
  }

  ctx.restore();
}

/**
 * Calculate bounds for a transformer element
 */
export function calculateTransformerBounds(
  iBusPos: Point,
  jBusPos: Point,
  options: TransformerRendererOptions = {}
): { x: number; y: number; width: number; height: number } {
  const {
    size = 20,
  } = options;

  const midX = (iBusPos.x + jBusPos.x) / 2;
  const midY = (iBusPos.y + jBusPos.y) / 2;

  const padding = size + 10;

  return {
    x: Math.min(iBusPos.x, jBusPos.x, midX - size) - padding,
    y: Math.min(iBusPos.y, jBusPos.y, midY - size) - padding,
    width: Math.abs(jBusPos.x - iBusPos.x) + padding * 2 + size * 2,
    height: Math.abs(jBusPos.y - iBusPos.y) + padding * 2 + size * 2,
  };
}

/**
 * Create a transformer diagram element
 */
export function createTransformerElement(
  xfm: Transformer,
  iBusPos: Point,
  jBusPos: Point,
  index: number,
  options: TransformerRendererOptions = {}
): DiagramElement {
  const bounds = calculateTransformerBounds(iBusPos, jBusPos, options);

  const element: DiagramElement & { toPos: Point; kBusPosition?: Point } = {
    id: `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || index}`,
    type: xfm.kbus && xfm.kbus > 0 ? 'transformer3w' : 'transformer',
    position: iBusPos,
    bounds,
    data: xfm,
    toPos: jBusPos, // Store jbus position for drawing
  };

  // Store k bus position for three-winding transformers
  if (options.kBusPosition) {
    element.kBusPosition = options.kBusPosition;
  }

  return element;
}
