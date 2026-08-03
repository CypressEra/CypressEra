/**
 * Drag Handler
 * Manages element dragging logic for the NetworkDiagram
 */

import { Point, DiagramElement } from '../types';
import { BusConnectionInfo } from '../utils/busConnectionPoints';
import { findElementsConnectedToBus } from '../utils/elementUtils';
import { getConnectionPointRelativeToBusCenter, getConnectionPointWithDynamicY, updateElementConnectionSide, updateBusCenterInConnectionInfo, updateConnectionPointYOffset } from '../utils/busConnectionPoints';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';
import { calculateBusBounds, getBusHeightForElement } from '../renderers/elements/bus';

export interface ElementDragInfo {
  elementId: string;
  originalPosition: Point;
  originalToPos?: Point;
  connectedLinesOriginalPositions?: Map<string, { fromPos: Point; toPos: Point }>;
  connectedDevicesOriginalPositions?: Map<string, { position: Point; connectedBusPosition: Point }>;
  connectedBusesOriginalPositions?: Map<string, Point>;
  isDraggingEndpoint?: boolean;  // If true, dragging a line endpoint along bus
  endpointIndex?: 'from' | 'to';  // Which endpoint is being dragged
  originalEndpointYOffset?: number; // Original Y offset of the endpoint being dragged
  draggedBusNumber?: number; // Bus number whose endpoint is being dragged
}

export class DragHandler {
  private elementsRef: React.MutableRefObject<Map<string, DiagramElement>>;
  private busConnectionInfosRef: React.MutableRefObject<Map<string, BusConnectionInfo>>;

  constructor(
    elementsRef: React.MutableRefObject<Map<string, DiagramElement>>,
    busConnectionInfosRef: React.MutableRefObject<Map<string, BusConnectionInfo>>
  ) {
    this.elementsRef = elementsRef;
    this.busConnectionInfosRef = busConnectionInfosRef;
  }

  /**
   * Create drag info for an element about to be dragged
   */
  createDragInfo(clickedElement: DiagramElement): ElementDragInfo {
    const clickedElementId = clickedElement.id;
    const draggedBusNumber = clickedElementId.startsWith('bus_')
      ? parseInt(clickedElementId.substring(4))
      : null;

    const connectedLinesOriginalPositions: Map<string, { fromPos: Point; toPos: Point }> = new Map();
    const connectedDevicesOriginalPositions: Map<string, { position: Point; connectedBusPosition: Point }> = new Map();
    const connectedBusesOriginalPositions: Map<string, Point> = new Map();

    if (draggedBusNumber !== null) {
      // Bus is being dragged - store positions of connected elements
      const connectedElements = findElementsConnectedToBus(this.elementsRef.current, draggedBusNumber);
      connectedElements.forEach((el) => {
        if (el.type === 'acline' || el.type === 'transformer' || el.type === 'transformer3w') {
          const lineEl = el as any;
          connectedLinesOriginalPositions.set(el.id, {
            fromPos: { ...el.position },
            toPos: { ...lineEl.toPos },
          });
        } else if (el.type === 'load' || el.type === 'generator' ||
                   el.type === 'fixed_shunt' || el.type === 'switched_shunt') {
          connectedDevicesOriginalPositions.set(el.id, {
            position: { ...el.position },
            connectedBusPosition: { ...(el as any).connectedBusPosition },
          });
        }
      });
    } else if (clickedElement.type === 'acline' || clickedElement.type === 'transformer' || clickedElement.type === 'transformer3w') {
      // Line is being dragged - store positions of connected buses and their devices
      const elementData = clickedElement.data;
      const fromBusId = `bus_${elementData.ibus}`;
      const toBusId = `bus_${elementData.jbus}`;
      const fromBusNumber = elementData.ibus;
      const toBusNumber = elementData.jbus;

      this.elementsRef.current.forEach((el) => {
        if (el.id === fromBusId) {
          connectedBusesOriginalPositions.set(fromBusId, { ...el.position });
        }
        if (el.id === toBusId) {
          connectedBusesOriginalPositions.set(toBusId, { ...el.position });
        }

        if (el.type === 'load' || el.type === 'generator' ||
            el.type === 'fixed_shunt' || el.type === 'switched_shunt') {
          const elData = el.data;
          if (elData.ibus === fromBusNumber || elData.ibus === toBusNumber) {
            connectedDevicesOriginalPositions.set(el.id, {
              position: { ...el.position },
              connectedBusPosition: { ...(el as any).connectedBusPosition },
            });
          }
        }
      });
    }

    const lineElement = clickedElement as any;
    return {
      elementId: clickedElementId,
      originalPosition: { ...clickedElement.position },
      originalToPos: lineElement.toPos ? { ...lineElement.toPos } : undefined,
      connectedLinesOriginalPositions,
      connectedDevicesOriginalPositions,
      connectedBusesOriginalPositions,
    };
  }

  /**
   * Create drag info for dragging a line endpoint along a bus
   */
  createEndpointDragInfo(
    lineElement: DiagramElement,
    endpointIndex: 'from' | 'to',
    busNumber: number,
    clickPosition: Point
  ): ElementDragInfo {
    const lineEl = lineElement as any;

    // Get the bus connection info
    const busId = `bus_${busNumber}`;
    const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);
    const busElement = this.elementsRef.current.get(busId);

    let originalEndpointYOffset = 0;

    if (busConnectionInfo && busElement) {
      const connectionPoint = busConnectionInfo.leftConnections.get(lineElement.id) ||
                              busConnectionInfo.rightConnections.get(lineElement.id);
      if (connectionPoint) {
        originalEndpointYOffset = connectionPoint.yOffset;
      }
    }

    const connectedLinesOriginalPositions: Map<string, { fromPos: Point; toPos: Point }> = new Map();
    connectedLinesOriginalPositions.set(lineElement.id, {
      fromPos: { ...lineElement.position },
      toPos: { ...lineEl.toPos },
    });

    return {
      elementId: lineElement.id,
      originalPosition: { ...lineElement.position },
      originalToPos: { ...lineEl.toPos },
      connectedLinesOriginalPositions,
      isDraggingEndpoint: true,
      endpointIndex,
      originalEndpointYOffset,
      draggedBusNumber: busNumber,
    };
  }

  /**
   * Update element positions during dragging
   */
  updateDragPositions(
    elementId: string,
    dragStart: Point,
    currentPos: Point,
    dragInfo: ElementDragInfo
  ): void {
    // Handle endpoint dragging (line endpoint moving along bus)
    if (dragInfo.isDraggingEndpoint && dragInfo.endpointIndex && dragInfo.draggedBusNumber !== undefined) {
      this.updateLineEndpointOnBus(elementId, dragInfo, currentPos);
      return;
    }

    const dx = currentPos.x - dragStart.x;
    const dy = currentPos.y - dragStart.y;

    const draggedBusNumber = elementId.startsWith('bus_') ? parseInt(elementId.substring(4)) : null;
    const draggedElement = this.elementsRef.current.get(elementId);
    const isDraggingDevice = draggedElement?.type === 'load' || draggedElement?.type === 'generator' ||
                            draggedElement?.type === 'fixed_shunt' || draggedElement?.type === 'switched_shunt';

    // Update element position
    this.elementsRef.current.forEach((element) => {
      if (element.id === elementId) {
        this.updateElementPosition(element, dragInfo, dx, dy);

        // If dragging a device (load or generator), update its connection to the bus
        if (isDraggingDevice) {
          this.updateDeviceConnectionSide(element);
        }
      }

      // If dragging a bus, update connected elements
      if (draggedBusNumber !== null) {
        this.updateConnectedElementsForBus(element, draggedBusNumber, dragInfo, dx, dy);
      }

      // If dragging a line, update connected buses and their elements
      if (dragInfo.connectedBusesOriginalPositions && dragInfo.connectedBusesOriginalPositions.size > 0) {
        this.updateConnectedElementsForLine(element, elementId, dragInfo, dx, dy);
      }
    });
  }

  private updateElementPosition(element: DiagramElement, dragInfo: ElementDragInfo, dx: number, dy: number): void {
    element.position.x = dragInfo.originalPosition.x + dx;
    element.position.y = dragInfo.originalPosition.y + dy;

    if (element.type === 'bus') {
      // Use calculateBusBounds to ensure consistent hitbox calculation
      const busHeight = getBusHeightForElement(element, NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT);
      element.bounds = calculateBusBounds(element.position, {
        busHeight,
        busWidth: NETWORK_DIAGRAM_CONSTANTS.BUS_WIDTH,
        hitboxPadding: NETWORK_DIAGRAM_CONSTANTS.BUS_BOUNDS_PADDING,
      });
    } else if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
      const lineElement = element as any;
      if (lineElement.toPos && dragInfo.originalToPos) {
        lineElement.toPos.x = dragInfo.originalToPos.x + dx;
        lineElement.toPos.y = dragInfo.originalToPos.y + dy;
      }
      if (lineElement.toPos) {
        element.bounds.x = Math.min(element.position.x, lineElement.toPos.x);
        element.bounds.y = Math.min(element.position.y, lineElement.toPos.y);
        element.bounds.width = Math.abs(lineElement.toPos.x - element.position.x);
        element.bounds.height = Math.abs(lineElement.toPos.y - element.position.y);
      }
    } else {
      element.bounds.x = element.position.x - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
      element.bounds.y = element.position.y - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
    }
  }

  /**
   * Update device connection side when the device is dragged
   * This updates the connection point on the bus based on which side of the bus the device is now on
   * Uses dynamic Y positioning so the connection point follows the device's Y position
   * Also updates the mirrored property when the device crosses to the opposite side
   */
  private updateDeviceConnectionSide(deviceElement: DiagramElement): void {
    if (deviceElement.type !== 'load' && deviceElement.type !== 'generator' &&
        deviceElement.type !== 'fixed_shunt' && deviceElement.type !== 'switched_shunt') return;

    const elementData = deviceElement.data;
    const busId = `bus_${elementData.ibus}`;
    const busElement = this.elementsRef.current.get(busId);

    if (!busElement) return;

    const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);
    if (!busConnectionInfo) return;

    // Determine which side of the bus the device is on
    const isOnRightSide = deviceElement.position.x > busElement.position.x;

    // Update the mirrored property - devices on the right side should be mirrored
    (deviceElement as any).mirrored = isOnRightSide;

    // Update the connection side based on the device's current position
    updateElementConnectionSide(busConnectionInfo, deviceElement.id, deviceElement.position);

    // Use dynamic Y positioning so the connection point follows the device's Y position
    const connectionPoint = getConnectionPointWithDynamicY(
      busConnectionInfo,
      deviceElement.id,
      busElement.position,
      deviceElement.position
    );

    if (connectionPoint) {
      (deviceElement as any).connectedBusPosition = {
        x: connectionPoint.x,
        y: connectionPoint.y,
      };
    }
  }

  /**
   * Update a line's endpoint position on a bus during endpoint dragging
   */
  private updateLineEndpointOnBus(
    elementId: string,
    dragInfo: ElementDragInfo,
    currentPos: Point
  ): void {
    if (!dragInfo.endpointIndex || dragInfo.draggedBusNumber === undefined) return;

    const lineElement = this.elementsRef.current.get(elementId);
    if (!lineElement || !(lineElement.type === 'acline' || lineElement.type === 'transformer' || lineElement.type === 'transformer3w')) {
      return;
    }

    const busId = `bus_${dragInfo.draggedBusNumber}`;
    const busElement = this.elementsRef.current.get(busId);
    const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);

    if (!busElement || !busConnectionInfo) return;

    const lineEl = lineElement as any;
    const elementData = lineElement.data;

    // Calculate new Y offset based on current mouse position
    const newYOffset = currentPos.y - busElement.position.y;

    // Update the connection point's Y offset
    updateConnectionPointYOffset(busConnectionInfo, elementId, newYOffset);

    // Update the line's endpoint position
    const side = currentPos.x < busElement.position.x ? 'left' : 'right';
    const xOffset = side === 'left' ? -busConnectionInfo.busWidth / 2 : busConnectionInfo.busWidth / 2;

    // Get the clamped Y offset from the connection point (which already has padding applied)
    const connectionPoint = busConnectionInfo.leftConnections.get(elementId) ||
                            busConnectionInfo.rightConnections.get(elementId);
    const clampedYOffset = connectionPoint ? connectionPoint.yOffset : newYOffset;

    const newConnectionPoint = {
      x: busElement.position.x + xOffset,
      y: busElement.position.y + clampedYOffset,
    };

    // Update the appropriate endpoint
    if (dragInfo.endpointIndex === 'from') {
      if (elementData.ibus === dragInfo.draggedBusNumber) {
        lineElement.position.x = newConnectionPoint.x;
        lineElement.position.y = newConnectionPoint.y;
      }
    } else if (dragInfo.endpointIndex === 'to') {
      if (elementData.jbus === dragInfo.draggedBusNumber) {
        lineEl.toPos.x = newConnectionPoint.x;
        lineEl.toPos.y = newConnectionPoint.y;
      }
    }

    // Update bounds
    lineElement.bounds.x = Math.min(lineElement.position.x, lineEl.toPos.x);
    lineElement.bounds.y = Math.min(lineElement.position.y, lineEl.toPos.y);
    lineElement.bounds.width = Math.abs(lineEl.toPos.x - lineElement.position.x);
    lineElement.bounds.height = Math.abs(lineEl.toPos.y - lineElement.position.y);
  }

  private updateConnectedElementsForBus(
    element: DiagramElement,
    draggedBusNumber: number,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const draggedBusId = `bus_${draggedBusNumber}`;
    const draggedBusElement = this.elementsRef.current.get(draggedBusId);

    if (!draggedBusElement) return;

    if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
      this.updateLinePositionForBus(element, draggedBusNumber, draggedBusElement, dragInfo, dx, dy);
    } else if (element.type === 'load' || element.type === 'generator' ||
               element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
      this.updateDevicePositionForBus(element, draggedBusNumber, draggedBusElement, dragInfo, dx, dy);
    }
  }

  private updateLinePositionForBus(
    element: DiagramElement,
    draggedBusNumber: number,
    draggedBusElement: DiagramElement,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const lineElement = element as any;
    const elementData = element.data;
    const originalPositions = dragInfo.connectedLinesOriginalPositions?.get(element.id);

    if (!(elementData.ibus === draggedBusNumber || elementData.jbus === draggedBusNumber) || !originalPositions) {
      return;
    }

    const busConnectionInfo = this.busConnectionInfosRef.current.get(`bus_${draggedBusNumber}`);
    const newBusCenter = draggedBusElement.position;

    if (busConnectionInfo) {
      updateBusCenterInConnectionInfo(busConnectionInfo, newBusCenter);
      const connectionPoint = getConnectionPointRelativeToBusCenter(busConnectionInfo, element.id, newBusCenter);

      if (elementData.ibus === draggedBusNumber && connectionPoint) {
        element.position.x = connectionPoint.x;
        element.position.y = connectionPoint.y;
      } else if (elementData.ibus === draggedBusNumber) {
        element.position.x = originalPositions.fromPos.x + dx;
        element.position.y = originalPositions.fromPos.y + dy;
      }

      if (elementData.jbus === draggedBusNumber && connectionPoint) {
        lineElement.toPos.x = connectionPoint.x;
        lineElement.toPos.y = connectionPoint.y;
      } else if (elementData.jbus === draggedBusNumber) {
        lineElement.toPos.x = originalPositions.toPos.x + dx;
        lineElement.toPos.y = originalPositions.toPos.y + dy;
      }
    } else {
      if (elementData.ibus === draggedBusNumber) {
        element.position.x = originalPositions.fromPos.x + dx;
        element.position.y = originalPositions.fromPos.y + dy;
      }
      if (elementData.jbus === draggedBusNumber) {
        lineElement.toPos.x = originalPositions.toPos.x + dx;
        lineElement.toPos.y = originalPositions.toPos.y + dy;
      }
    }

    element.bounds.x = Math.min(element.position.x, lineElement.toPos.x);
    element.bounds.y = Math.min(element.position.y, lineElement.toPos.y);
    element.bounds.width = Math.abs(lineElement.toPos.x - element.position.x);
    element.bounds.height = Math.abs(lineElement.toPos.y - element.position.y);
  }

  private updateDevicePositionForBus(
    element: DiagramElement,
    draggedBusNumber: number,
    draggedBusElement: DiagramElement,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const elementData = element.data;
    const originalPositions = dragInfo.connectedDevicesOriginalPositions?.get(element.id);

    if (elementData.ibus !== draggedBusNumber || !originalPositions) {
      return;
    }

    element.position.x = originalPositions.position.x + dx;
    element.position.y = originalPositions.position.y + dy;

    const busConnectionInfo = this.busConnectionInfosRef.current.get(`bus_${draggedBusNumber}`);
    const newBusCenter = draggedBusElement.position;

    if (busConnectionInfo) {
      updateBusCenterInConnectionInfo(busConnectionInfo, newBusCenter);

      // Update the connection side based on the element's current position
      updateElementConnectionSide(busConnectionInfo, element.id, element.position);

      // Use dynamic Y positioning for the connection point
      const connectionPoint = getConnectionPointWithDynamicY(
        busConnectionInfo,
        element.id,
        newBusCenter,
        element.position
      );

      if (connectionPoint) {
        (element as any).connectedBusPosition = {
          x: connectionPoint.x,
          y: connectionPoint.y,
        };
      } else {
        (element as any).connectedBusPosition = {
          x: originalPositions.connectedBusPosition.x + dx,
          y: originalPositions.connectedBusPosition.y + dy,
        };
      }
    } else {
      (element as any).connectedBusPosition = {
        x: originalPositions.connectedBusPosition.x + dx,
        y: originalPositions.connectedBusPosition.y + dy,
      };
    }

    element.bounds.x = element.position.x - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
    element.bounds.y = element.position.y - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
  }

  private updateConnectedElementsForLine(
    element: DiagramElement,
    draggedLineId: string,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const draggedLine = this.elementsRef.current.get(draggedLineId);
    if (!draggedLine || !(draggedLine.type === 'acline' || draggedLine.type === 'transformer' || draggedLine.type === 'transformer3w')) {
      return;
    }

    const draggedLineData = draggedLine.data;
    const fromBusNumber = draggedLineData.ibus;
    const toBusNumber = draggedLineData.jbus;
    const connectedBusesOriginalPositions = dragInfo.connectedBusesOriginalPositions!;

    // Update bus positions
    if (element.type === 'bus') {
      const busNumber = parseInt(element.id.substring(4));
      if (busNumber === fromBusNumber || busNumber === toBusNumber) {
        const originalBusPos = connectedBusesOriginalPositions.get(element.id);
        if (originalBusPos) {
          element.position.x = originalBusPos.x + dx;
          element.position.y = originalBusPos.y + dy;

          // Use calculateBusBounds to ensure consistent hitbox calculation
          const busHeight = getBusHeightForElement(element, NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT);
          element.bounds = calculateBusBounds(element.position, {
            busHeight,
            busWidth: NETWORK_DIAGRAM_CONSTANTS.BUS_WIDTH,
            hitboxPadding: NETWORK_DIAGRAM_CONSTANTS.BUS_BOUNDS_PADDING,
          });

          const busConnectionInfo = this.busConnectionInfosRef.current.get(element.id);
          if (busConnectionInfo) {
            updateBusCenterInConnectionInfo(busConnectionInfo, element.position);
          }
        }
      }
    }

    // Update other lines
    if ((element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') && element.id !== draggedLineId) {
      this.updateOtherLinePosition(element, fromBusNumber, toBusNumber, connectedBusesOriginalPositions, dragInfo, dx, dy);
    }

    // Update devices
    if (element.type === 'load' || element.type === 'generator' ||
        element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
      this.updateDevicePositionForLineDrag(element, fromBusNumber, toBusNumber, connectedBusesOriginalPositions, dragInfo, dx, dy);
    }
  }

  private updateOtherLinePosition(
    element: DiagramElement,
    fromBusNumber: number,
    toBusNumber: number,
    connectedBusesOriginalPositions: Map<string, Point>,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const lineElement = element as any;
    const elementData = element.data;

    const connectsToBus = elementData.ibus === fromBusNumber || elementData.ibus === toBusNumber ||
      elementData.jbus === fromBusNumber || elementData.jbus === toBusNumber;

    if (!connectsToBus) return;

    if (elementData.ibus === fromBusNumber || elementData.ibus === toBusNumber) {
      const busId = `bus_${elementData.ibus}`;
      const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);
      if (busConnectionInfo) {
        const newBusPos = {
          x: (connectedBusesOriginalPositions.get(busId)?.x || 0) + dx,
          y: (connectedBusesOriginalPositions.get(busId)?.y || 0) + dy
        };
        const connectionPoint = getConnectionPointRelativeToBusCenter(busConnectionInfo, element.id, newBusPos);
        if (connectionPoint) {
          element.position.x = connectionPoint.x;
          element.position.y = connectionPoint.y;
        }
      }
    }

    if (elementData.jbus === fromBusNumber || elementData.jbus === toBusNumber) {
      const busId = `bus_${elementData.jbus}`;
      const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);
      if (busConnectionInfo) {
        const newBusPos = {
          x: (connectedBusesOriginalPositions.get(busId)?.x || 0) + dx,
          y: (connectedBusesOriginalPositions.get(busId)?.y || 0) + dy
        };
        const connectionPoint = getConnectionPointRelativeToBusCenter(busConnectionInfo, element.id, newBusPos);
        if (connectionPoint) {
          lineElement.toPos.x = connectionPoint.x;
          lineElement.toPos.y = connectionPoint.y;
        }
      }
    }

    element.bounds.x = Math.min(element.position.x, lineElement.toPos.x);
    element.bounds.y = Math.min(element.position.y, lineElement.toPos.y);
    element.bounds.width = Math.abs(lineElement.toPos.x - element.position.x);
    element.bounds.height = Math.abs(lineElement.toPos.y - element.position.y);
  }

  private updateDevicePositionForLineDrag(
    element: DiagramElement,
    fromBusNumber: number,
    toBusNumber: number,
    connectedBusesOriginalPositions: Map<string, Point>,
    dragInfo: ElementDragInfo,
    dx: number,
    dy: number
  ): void {
    const elementData = element.data;
    if (elementData.ibus !== fromBusNumber && elementData.ibus !== toBusNumber) {
      return;
    }

    const busId = `bus_${elementData.ibus}`;
    const originalPositions = dragInfo.connectedDevicesOriginalPositions?.get(element.id);

    if (!originalPositions) return;

    element.position.x = originalPositions.position.x + dx;
    element.position.y = originalPositions.position.y + dy;

    const busConnectionInfo = this.busConnectionInfosRef.current.get(busId);
    if (busConnectionInfo) {
      const newBusPos = {
        x: (connectedBusesOriginalPositions.get(busId)?.x || 0) + dx,
        y: (connectedBusesOriginalPositions.get(busId)?.y || 0) + dy
      };

      // Update the connection side based on the element's current position
      updateElementConnectionSide(busConnectionInfo, element.id, element.position);

      // Use dynamic Y positioning for the connection point
      const connectionPoint = getConnectionPointWithDynamicY(
        busConnectionInfo,
        element.id,
        newBusPos,
        element.position
      );

      if (connectionPoint) {
        (element as any).connectedBusPosition = {
          x: connectionPoint.x,
          y: connectionPoint.y,
        };
      } else {
        (element as any).connectedBusPosition = {
          x: originalPositions.connectedBusPosition.x + dx,
          y: originalPositions.connectedBusPosition.y + dy,
        };
      }
    } else {
      (element as any).connectedBusPosition = {
        x: originalPositions.connectedBusPosition.x + dx,
        y: originalPositions.connectedBusPosition.y + dy,
      };
    }

    element.bounds.x = element.position.x - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
    element.bounds.y = element.position.y - NETWORK_DIAGRAM_CONSTANTS.ELEMENT_HIT_BOX_SIZE;
  }
}
