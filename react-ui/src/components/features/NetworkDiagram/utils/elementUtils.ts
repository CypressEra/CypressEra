/**
 * Element Utilities
 * Utility functions for working with diagram elements
 */

import {
  Point,
  DiagramElement,
  Bounds,
  ElementType,
} from '../types';
import {
  getBusHeightForElement,
  DEFAULT_BUS_HEIGHT,
  BUS_RESIZE_HANDLE_HEIGHT,
  BUS_RESIZE_HANDLE_HALF_WIDTH,
} from '../renderers/elements/bus';

/**
 * Test if a point is within bounds
 */
export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Calculate distance from point to line segment
 * Returns the perpendicular distance from the point to the line segment
 */
export function pointToLineSegmentDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  // Line segment has zero length
  if (lenSq === 0) return distance(point, lineStart);

  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx: number;
  let yy: number;

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
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Test if a point is within line hit tolerance
 * Uses perpendicular distance to the line segment
 */
export function pointNearLine(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
  tolerance: number = 8
): boolean {
  return pointToLineSegmentDistance(point, lineStart, lineEnd) <= tolerance;
}

/**
 * Find element at position (hit test) with improved line detection
 * Priority: buses > devices > lines (to avoid accidental line selection)
 */
export function findElementAtPosition(
  elements: Map<string, DiagramElement>,
  position: Point,
  lineHitTolerance: number = 8
): DiagramElement | null {
  const candidates: Array<{ element: DiagramElement; priority: number }> = [];

  elements.forEach((element) => {
    let isHit = false;

    // For line elements (acline, transformer), use segment-based hit detection
    if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
      const lineElement = element as any;
      const toPos = lineElement.toPos;

      if (toPos) {
        // Check if point is near the line segment
        isHit = pointNearLine(position, element.position, toPos, lineHitTolerance);
      } else {
        // Fallback to bounds if toPos is not available
        isHit = pointInBounds(position, element.bounds);
      }
    } else {
      // For non-line elements (buses, loads, generators), use bounds
      isHit = pointInBounds(position, element.bounds);
    }

    if (isHit) {
      // Assign priority: buses (3) > devices (2) > lines (1)
      let priority = 1;
      if (element.type === 'bus') {
        priority = 3;
      } else if (element.type === 'load' || element.type === 'generator' ||
                 element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
        priority = 2;
      }

      candidates.push({ element, priority });
    }
  });

  if (candidates.length === 0) return null;

  // Sort by priority (descending) and return the highest priority element
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].element;
}

export interface BusResizeHandleHit {
  element: DiagramElement;
  edge: 'bottom';
}

/**
 * Find bus whose height-resize handle is at the given position.
 * The handle is a strip at the bottom of the bus.
 */
export function findBusResizeHandleAtPosition(
  elements: Map<string, DiagramElement>,
  position: Point,
  defaultBusHeight: number = DEFAULT_BUS_HEIGHT
): BusResizeHandleHit | null {
  const busElements = Array.from(elements.values());
  for (const element of busElements) {
    if (element.type !== 'bus') continue;
    const h = getBusHeightForElement(element, defaultBusHeight);
    const bottomY = element.position.y + h / 2;
    const inY =
      position.y >= bottomY &&
      position.y <= bottomY + BUS_RESIZE_HANDLE_HEIGHT;
    const inX = Math.abs(position.x - element.position.x) <= BUS_RESIZE_HANDLE_HALF_WIDTH;
    if (inY && inX) {
      return { element, edge: 'bottom' };
    }
  }
  return null;
}

/**
 * Find elements within bounds (for selection)
 */
export function findElementsInBounds(
  elements: Map<string, DiagramElement>,
  bounds: Bounds
): DiagramElement[] {
  const found: DiagramElement[] = [];

  elements.forEach((element) => {
    const elementBounds = element.bounds;
    // Check for intersection
    if (
      elementBounds.x < bounds.x + bounds.width &&
      elementBounds.x + elementBounds.width > bounds.x &&
      elementBounds.y < bounds.y + bounds.height &&
      elementBounds.y + elementBounds.height > bounds.y
    ) {
      found.push(element);
    }
  });

  return found;
}

/**
 * Filter elements by type
 */
export function filterElementsByType(
  elements: Map<string, DiagramElement>,
  type: ElementType
): DiagramElement[] {
  return Array.from(elements.values()).filter(el => el.type === type);
}

/**
 * Filter elements by bus connection
 */
export function findElementsConnectedToBus(
  elements: Map<string, DiagramElement>,
  busNumber: number
): DiagramElement[] {
  const connected: DiagramElement[] = [];

  elements.forEach((element) => {
    const data = element.data;
    if (!data) return;

    // Check if element connects to this bus
    if ('ibus' in data && data.ibus === busNumber) {
      connected.push(element);
    } else if ('jbus' in data && data.jbus === busNumber) {
      connected.push(element);
    } else if ('k' in data && data.k === busNumber) {
      connected.push(element);
    }
  });

  return connected;
}

/**
 * Update element position and bounds
 */
export function updateElementPosition(
  element: DiagramElement,
  newPosition: Point
): DiagramElement {
  const updated = { ...element };
  updated.position = newPosition;

  // Update bounds based on element type
  const dx = newPosition.x - element.position.x;
  const dy = newPosition.y - element.position.y;

  updated.bounds = {
    ...element.bounds,
    x: element.bounds.x + dx,
    y: element.bounds.y + dy,
  };

  return updated;
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate center point of bounds
 */
export function boundsCenter(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

/**
 * Calculate bounding box of multiple elements
 */
export function calculateBoundingBox(elements: DiagramElement[]): Bounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach(element => {
    const bounds = element.bounds;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Normalize selection bounds (handle negative width/height)
 */
export function normalizeBounds(bounds: Bounds): Bounds {
  let x = bounds.x;
  let y = bounds.y;
  let width = bounds.width;
  let height = bounds.height;

  if (width < 0) {
    x = x + width;
    width = Math.abs(width);
  }

  if (height < 0) {
    y = y + height;
    height = Math.abs(height);
  }

  return { x, y, width, height };
}

/**
 * Check if two bounds intersect
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Get element ID from bus number
 */
export function busElementId(busNumber: number): string {
  return `bus_${busNumber}`;
}

/**
 * Get element ID from line data
 */
export function lineElementId(ibus: number, jbus: number, ckt?: string | number, index = 0): string {
  return `acline_${ibus}_${jbus}_${ckt || index}`;
}

/**
 * Get element ID from transformer data
 */
export function transformerElementId(ibus: number, jbus: number, ckt?: string | number, index = 0): string {
  return `xfm_${ibus}_${jbus}_${ckt || index}`;
}

/**
 * Get element ID from load data
 */
export function loadElementId(ibus: number, loadid?: string): string {
  return `load_${ibus}_${loadid || '0'}`;
}

/**
 * Get element ID from generator data
 */
export function generatorElementId(ibus: number, machid?: string): string {
  return `gen_${ibus}_${machid || '0'}`;
}

/**
 * Parse bus number from element ID
 */
export function parseBusNumberFromId(elementId: string): number | null {
  const match = elementId.match(/_(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Check if element is a bus
 */
export function isBusElement(element: DiagramElement): boolean {
  return element.type === 'bus';
}

/**
 * Check if element is a line (AC line or transformer)
 */
export function isLineElement(element: DiagramElement): boolean {
  return element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w';
}

/**
 * Check if element is a device (load, generator, shunt)
 */
export function isDeviceElement(element: DiagramElement): boolean {
  return element.type === 'load' || element.type === 'generator' || element.type === 'fixed_shunt' || element.type === 'switched_shunt';
}

/**
 * Get connected buses for an element
 */
export function getElementBuses(element: DiagramElement): number[] {
  const data = element.data as Record<string, unknown>;
  if (!data) return [];

  const buses: number[] = [];
  // acline: ibus/jbus; twotermdc: ipi/ipr
  const from = data.ipi ?? data.ibus;
  const to = data.ipr ?? data.jbus;
  if (typeof from === 'number') buses.push(from);
  if (typeof to === 'number') buses.push(to);
  if ('k' in data && typeof data.k === 'number' && data.k > 0) {
    buses.push(data.k);
  }
  if ('kbus' in data && typeof data.kbus === 'number' && data.kbus > 0) {
    buses.push(data.kbus);
  }

  return buses;
}
