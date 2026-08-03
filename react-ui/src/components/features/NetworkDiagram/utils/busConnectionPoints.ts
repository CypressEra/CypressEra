/**
 * Bus Connection Points Utility
 * Calculates optimal connection points on buses for lines and devices
 */

import { Point, DiagramElement } from '../types';

// Padding from bus edges for connection points (in world units)
const BUS_CONNECTION_PADDING = 15; // 15px padding from top and bottom

/** Minimum vertical spacing between connection points on the same side (avoids overlay when bus grows) */
const MIN_CONNECTION_SPACING = 14;

export interface ConnectionPoint {
  point: Point;
  side: 'left' | 'right';
  yOffset: number;  // Offset from bus center (negative = above, positive = below)
  index: number;    // Connection index on this side
  useDynamicY?: boolean; // If true, Y position tracks element position instead of being distributed
}

export interface BusConnectionInfo {
  busId: string;
  busCenter: Point;
  busHeight: number;
  busWidth: number;
  leftConnections: Map<string, ConnectionPoint>;  // elementId -> connection point
  rightConnections: Map<string, ConnectionPoint>; // elementId -> connection point
}

/**
 * Calculate connection point on a bus for a line
 * @param busCenter - Center position of the bus
 * @param busHeight - Height of the bus
 * @param busWidth - Width of the bus
 * @param targetPos - Position of the target element (other end of the line)
 * @param connectionIndex - Index of this connection (for spacing multiple connections)
 * @param totalConnections - Total number of connections on this side
 * @param busConnectionInfo - Optional existing bus connection info for tracking
 */
export function calculateBusConnectionPoint(
  busCenter: Point,
  busHeight: number,
  busWidth: number,
  targetPos: Point,
  connectionIndex: number = 0,
  totalConnections: number = 1,
  busConnectionInfo?: BusConnectionInfo
): ConnectionPoint {
  // Determine which side of the bus to connect to based on target position
  const side = targetPos.x < busCenter.x ? 'left' : 'right';

  // Calculate the Y offset for this connection (clamped so connections stay inside bus)
  const halfBusHeight = busHeight / 2 - BUS_CONNECTION_PADDING;
  // Use the full available height to distribute connections; enforce min spacing to avoid overlay
  const availableHeight = busHeight - BUS_CONNECTION_PADDING * 2;
  const maxSpacing = 60;
  const divisor = Math.max(totalConnections - 1, 1);
  const idealSpacing = availableHeight / divisor;
  const spacing = Math.max(
    MIN_CONNECTION_SPACING,
    Math.min(idealSpacing, maxSpacing)
  );
  const startY = -((totalConnections - 1) * spacing) / 2;
  let yOffset = startY + connectionIndex * spacing;
  yOffset = Math.max(-halfBusHeight, Math.min(halfBusHeight, yOffset));

  // Calculate the actual connection point
  // Use the outer edge of the bus to ensure lines connect fully without gaps
  const xOffset = side === 'left' ? -busWidth / 2 : busWidth / 2;

  return {
    point: {
      x: busCenter.x + xOffset,
      y: busCenter.y + yOffset,
    },
    side,
    yOffset,
    index: connectionIndex,
  };
}

/**
 * Create a new bus connection info object
 */
export function createBusConnectionInfo(
  busId: string,
  busCenter: Point,
  busHeight: number = 90,
  busWidth: number = 6
): BusConnectionInfo {
  return {
    busId,
    busCenter,
    busHeight,
    busWidth,
    leftConnections: new Map(),
    rightConnections: new Map(),
  };
}

/**
 * Add a connection to bus connection info
 */
export function addConnectionToBus(
  busInfo: BusConnectionInfo,
  elementId: string,
  targetPos: Point
): ConnectionPoint {
  // Determine which side
  const side = targetPos.x < busInfo.busCenter.x ? 'left' : 'right';
  const connections = side === 'left' ? busInfo.leftConnections : busInfo.rightConnections;

  // Calculate connection index
  const index = connections.size;

  // Calculate connection point
  const connectionPoint = calculateBusConnectionPoint(
    busInfo.busCenter,
    busInfo.busHeight,
    busInfo.busWidth,
    targetPos,
    index,
    index + 1, // This will be updated after all connections are added
    busInfo
  );

  // Store the connection
  connections.set(elementId, connectionPoint);

  return connectionPoint;
}

/**
 * Recalculate all connection points for a bus (called after all connections are added)
 */
export function recalculateBusConnectionPoints(busInfo: BusConnectionInfo): void {
  // Recalculate left side
  const leftCount = busInfo.leftConnections.size;
  const leftEntries = Array.from(busInfo.leftConnections.entries());
  busInfo.leftConnections.clear();

  leftEntries.forEach(([elementId, oldConn], index) => {
    const connectionPoint = calculateBusConnectionPoint(
      busInfo.busCenter,
      busInfo.busHeight,
      busInfo.busWidth,
      oldConn.point, // Use old point to determine side
      index,
      leftCount,
      busInfo
    );
    busInfo.leftConnections.set(elementId, connectionPoint);
  });

  // Recalculate right side
  const rightCount = busInfo.rightConnections.size;
  const rightEntries = Array.from(busInfo.rightConnections.entries());
  busInfo.rightConnections.clear();

  rightEntries.forEach(([elementId, oldConn], index) => {
    const connectionPoint = calculateBusConnectionPoint(
      busInfo.busCenter,
      busInfo.busHeight,
      busInfo.busWidth,
      oldConn.point, // Use old point to determine side
      index,
      rightCount,
      busInfo
    );
    busInfo.rightConnections.set(elementId, connectionPoint);
  });
}

/**
 * Get connection point for an element
 */
export function getConnectionPoint(
  busInfo: BusConnectionInfo,
  elementId: string
): ConnectionPoint | undefined {
  return (
    busInfo.leftConnections.get(elementId) ||
    busInfo.rightConnections.get(elementId)
  );
}

/**
 * Get the actual point coordinates for an element's connection
 */
export function getConnectionPointCoordinates(
  busInfo: BusConnectionInfo,
  elementId: string
): Point | undefined {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  return connectionPoint?.point;
}

/**
 * Get connection point coordinates relative to a given bus center
 * This is used during dragging when the bus has moved from its original position
 */
export function getConnectionPointRelativeToBusCenter(
  busInfo: BusConnectionInfo,
  elementId: string,
  currentBusCenter: Point
): Point | undefined {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  if (!connectionPoint) return undefined;

  // Calculate the connection point based on the current bus center
  // Use the stored side and yOffset to position correctly
   const xOffset = connectionPoint.side === 'left' ? - busInfo.busWidth / 2: busInfo.busWidth / 2;

  return {
    x: currentBusCenter.x + xOffset,
    y: currentBusCenter.y + connectionPoint.yOffset,
  };
}

/**
 * Update the bus height in connection info and recalculate connection points
 * Call this when a bus's height changes (e.g., from auto-grow or manual resize)
 */
export function updateBusHeightInConnectionInfo(
  busInfo: BusConnectionInfo,
  newBusHeight: number
): void {
  busInfo.busHeight = newBusHeight;

  // Recalculate all connection points with the new height
  recalculateBusConnectionPoints(busInfo);

  // Update the point coordinates based on new yOffsets
  busInfo.leftConnections.forEach((conn) => {
    const xOffset = -busInfo.busWidth / 2;
    conn.point = {
      x: busInfo.busCenter.x + xOffset,
      y: busInfo.busCenter.y + conn.yOffset,
    };
  });

  busInfo.rightConnections.forEach((conn) => {
    const xOffset = busInfo.busWidth / 2;
    conn.point = {
      x: busInfo.busCenter.x + xOffset,
      y: busInfo.busCenter.y + conn.yOffset,
    };
  });
}

/**
 * Update the bus center in connection info (call when bus is moved)
 */
export function updateBusCenterInConnectionInfo(
  busInfo: BusConnectionInfo,
  newBusCenter: Point
): void {
  busInfo.busCenter = newBusCenter;

  // Update all connection points
  busInfo.leftConnections.forEach((conn, elementId) => {
    const xOffset = -busInfo.busWidth / 2;
    conn.point = {
      x: newBusCenter.x + xOffset,
      y: newBusCenter.y + conn.yOffset,
    };
  });

  busInfo.rightConnections.forEach((conn, elementId) => {
    const xOffset = busInfo.busWidth / 2;
    conn.point = {
      x: newBusCenter.x + xOffset,
      y: newBusCenter.y + conn.yOffset,
    };
  });
}

/**
 * Get connection point dynamically based on current element position
 * This determines which side of the bus to connect from based on where the element is currently located
 */
export function getConnectionPointRelativeToBusCenterAndElementPos(
  busInfo: BusConnectionInfo,
  elementId: string,
  currentBusCenter: Point,
  elementPosition: Point
): Point | undefined {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  if (!connectionPoint) return undefined;

  // Determine side based on element's current position relative to bus
  const side = elementPosition.x < currentBusCenter.x ? 'left' : 'right';
  const xOffset = side === 'left' ? -busInfo.busWidth / 2 : busInfo.busWidth / 2;

  return {
    x: currentBusCenter.x + xOffset,
    y: currentBusCenter.y + connectionPoint.yOffset,
  };
}

/**
 * Update the connection side for an element based on its current position
 */
export function updateElementConnectionSide(
  busInfo: BusConnectionInfo,
  elementId: string,
  elementPosition: Point
): void {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  if (!connectionPoint) return;

  // Determine new side based on element position
  const newSide = elementPosition.x < busInfo.busCenter.x ? 'left' : 'right';
  const oldSide = connectionPoint.side;

  // Only update if side changed
  if (newSide !== oldSide) {
    // Remove from old side
    if (oldSide === 'left') {
      busInfo.leftConnections.delete(elementId);
    } else {
      busInfo.rightConnections.delete(elementId);
    }

    // Update side and add to new side
    connectionPoint.side = newSide;

    if (newSide === 'left') {
      busInfo.leftConnections.set(elementId, connectionPoint);
    } else {
      busInfo.rightConnections.set(elementId, connectionPoint);
    }

    // Recalculate connection points to redistribute properly
    recalculateBusConnectionPoints(busInfo);
  }
}

/**
 * Get connection point with dynamic Y positioning
 * The Y position on the bus will match the element's Y position (clamped to bus height)
 * This allows devices to connect at any Y position on the bus
 */
export function getConnectionPointWithDynamicY(
  busInfo: BusConnectionInfo,
  elementId: string,
  currentBusCenter: Point,
  elementPosition: Point
): Point | undefined {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  if (!connectionPoint) return undefined;

  // Determine side based on element's current position relative to bus
  const side = elementPosition.x < currentBusCenter.x ? 'left' : 'right';
  const xOffset = side === 'left' ? -busInfo.busWidth / 2 : busInfo.busWidth / 2;

  // Calculate Y offset based on element's actual Y position
  // Clamp the Y position to be within the bus height (with padding from edges)
  const halfBusHeight = busInfo.busHeight / 2 - BUS_CONNECTION_PADDING;
  const clampedYOffset = Math.max(
    -halfBusHeight,
    Math.min(halfBusHeight, elementPosition.y - currentBusCenter.y)
  );

  return {
    x: currentBusCenter.x + xOffset,
    y: currentBusCenter.y + clampedYOffset,
  };
}

/**
 * Update the Y offset of a connection point (for dragging line endpoints along bus)
 */
export function updateConnectionPointYOffset(
  busInfo: BusConnectionInfo,
  elementId: string,
  newYOffset: number
): void {
  const connectionPoint = getConnectionPoint(busInfo, elementId);
  if (!connectionPoint) return;

  // Clamp to bus height with padding from edges
  const halfBusHeight = busInfo.busHeight / 2 - BUS_CONNECTION_PADDING;
  connectionPoint.yOffset = Math.max(
    -halfBusHeight,
    Math.min(halfBusHeight, newYOffset)
  );

  // Update the point coordinates
  const xOffset = connectionPoint.side === 'left' ? -busInfo.busWidth / 2 : busInfo.busWidth / 2;
  connectionPoint.point = {
    x: busInfo.busCenter.x + xOffset,
    y: busInfo.busCenter.y + connectionPoint.yOffset,
  };
}

/**
 * Apply this bus's connection points to connected elements (lines and devices).
 * Call after recalculating connection points (e.g. when bus height changes) so
 * line endpoints and device connection positions stay on the bus.
 */
export function applyConnectionPointsToElements(
  busInfo: BusConnectionInfo,
  elements: Map<string, DiagramElement>
): void {
  const busNumber = parseInt(busInfo.busId.replace('bus_', ''), 10);
  if (Number.isNaN(busNumber)) return;

  const updateElement = (elementId: string, point: Point) => {
    const el = elements.get(elementId);
    if (!el) return;

    if (el.type === 'acline' || el.type === 'transformer' || el.type === 'transformer3w') {
      const lineEl = el as DiagramElement & { toPos: Point; kBusPosition?: Point };
      const data = el.data as { ibus?: number; jbus?: number; ipi?: number; ipr?: number; kbus?: number };
      const fromBus = data.ipi ?? data.ibus;
      const toBus = data.ipr ?? data.jbus;
      if (fromBus === busNumber) {
        lineEl.position = { ...point };
      } else if (toBus === busNumber && lineEl.toPos) {
        lineEl.toPos.x = point.x;
        lineEl.toPos.y = point.y;
      } else if (data.kbus === busNumber && lineEl.kBusPosition) {
        lineEl.kBusPosition.x = point.x;
        lineEl.kBusPosition.y = point.y;
      }
      if (lineEl.toPos) {
        lineEl.bounds.x = Math.min(lineEl.position.x, lineEl.toPos.x);
        lineEl.bounds.y = Math.min(lineEl.position.y, lineEl.toPos.y);
        lineEl.bounds.width = Math.abs(lineEl.toPos.x - lineEl.position.x);
        lineEl.bounds.height = Math.abs(lineEl.toPos.y - lineEl.position.y);
      }
    } else if (el.type === 'load' || el.type === 'generator' ||
               el.type === 'fixed_shunt' || el.type === 'switched_shunt') {
      const deviceEl = el as DiagramElement & { connectedBusPosition?: Point };
      deviceEl.connectedBusPosition = { ...point };
    }
  };

  busInfo.leftConnections.forEach((conn, elementId) => updateElement(elementId, conn.point));
  busInfo.rightConnections.forEach((conn, elementId) => updateElement(elementId, conn.point));
}
