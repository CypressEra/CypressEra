/**
 * useCanvasInteraction Hook
 * Handles all mouse/keyboard interactions for the canvas
 */

import { useRef, useCallback, useState } from 'react';
import { Point, DiagramElement, Transform, Bounds } from '../types';
import { DragHandler, ElementDragInfo, PanZoomHandler, SelectionHandler } from '../interaction';
import { findElementAtPosition, findBusResizeHandleAtPosition } from '../utils/elementUtils';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';
import { calculateBusBounds, MIN_BUS_HEIGHT, MAX_BUS_HEIGHT } from '../renderers/elements/bus';
import { recalculateBusConnectionPoints, applyConnectionPointsToElements } from '../utils/busConnectionPoints';

interface UseCanvasInteractionOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  rendererRef: React.MutableRefObject<any>;
  elementsRef: React.MutableRefObject<Map<string, DiagramElement>>;
  /** Ref to visible elements only (hidden elements excluded). Used for hit-testing so hidden elements are not interactable. */
  visibleElementsRef: React.MutableRefObject<Map<string, DiagramElement>>;
  busConnectionInfosRef: React.MutableRefObject<Map<string, any>>;
  transformRef: React.MutableRefObject<Transform>;
  transform: Transform;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
  selectedElements: Set<string>;
  setSelectedElements: React.Dispatch<React.SetStateAction<Set<string>>>;
  cancelAnimation: () => void;
  animateZoom: (scale: number, offsetX: number, offsetY: number) => void;
  renderFunctionRef: React.MutableRefObject<(() => void) | null>;
  onElementClick?: (element: DiagramElement) => void;
  onElementDoubleClick?: (element: DiagramElement) => void;
  onCanvasClick?: (position: Point) => void;
  interactive?: boolean;
}

interface UseCanvasInteractionReturn {
  isDragging: boolean;
  isPanning: boolean;
  dragStart: Point | null;
  elementDragInfo: ElementDragInfo | null;
  selectionBounds: Bounds | null;
  hasDraggedRef: React.MutableRefObject<boolean>;
  isDraggingEndpoint: boolean;
  mouseWorldPos: Point | null;
  hoveredElementId: string | null;
  handleCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleCanvasDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleWheel: (e: WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: () => void;
}

export function useCanvasInteraction(
  options: UseCanvasInteractionOptions
): UseCanvasInteractionReturn {
  const {
    canvasRef,
    rendererRef,
    elementsRef,
    visibleElementsRef,
    busConnectionInfosRef,
    transformRef,
    transform,
    setTransform,
    selectedElements,
    setSelectedElements,
    cancelAnimation,
    animateZoom,
    renderFunctionRef,
    onElementClick,
    onElementDoubleClick,
    onCanvasClick,
    interactive = true,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [elementDragInfo, setElementDragInfo] = useState<ElementDragInfo | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState(false);
  const [busResizeInfo, setBusResizeInfo] = useState<{
    elementId: string;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const hasDraggedRef = useRef(false);

  // Initialize handlers
  const dragHandler = useRef<DragHandler | null>(null);
  const panZoomHandler = useRef<PanZoomHandler | null>(null);
  const selectionHandler = useRef<SelectionHandler | null>(null);

  // Initialize handlers on first render
  if (!dragHandler.current) {
    dragHandler.current = new DragHandler(elementsRef, busConnectionInfosRef);
  }
  if (!panZoomHandler.current) {
    panZoomHandler.current = new PanZoomHandler(transformRef, canvasRef, animateZoom);
  }
  if (!selectionHandler.current) {
    selectionHandler.current = new SelectionHandler(visibleElementsRef);
  }

  // Transform screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    return {
      x: (screenX - transform.offsetX) / transform.scale,
      y: (screenY - transform.offsetY) / transform.scale,
    };
  }, [transform]);

  // Helper to detect if clicking near a line endpoint (at the elbow, not the bus connection)
  const findLineEndpointAtPosition = useCallback((worldPos: Point): { element: DiagramElement; endpointIndex: 'from' | 'to'; busNumber: number } | null => {
    const ENDPOINT_HIT_TOLERANCE = 12; // Hit tolerance for line endpoints
    const VERTICAL_SEGMENT_LENGTH = 15; // Must match the value in line.ts

    const elements = Array.from(visibleElementsRef.current.values());
    for (const element of elements) {
      if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
        const lineEl = element as any;
        const elementData = element.data;

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
          Math.pow(worldPos.x - fromElbow.x, 2) +
          Math.pow(worldPos.y - fromElbow.y, 2)
        );
        if (fromDist <= ENDPOINT_HIT_TOLERANCE) {
          return { element, endpointIndex: 'from', busNumber: elementData.ibus };
        }

        // Check to elbow
        const toDist = Math.sqrt(
          Math.pow(worldPos.x - toElbow.x, 2) +
          Math.pow(worldPos.y - toElbow.y, 2)
        );
        if (toDist <= ENDPOINT_HIT_TOLERANCE) {
          return { element, endpointIndex: 'to', busNumber: elementData.jbus };
        }
      }
    }
    return null;
  }, []);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    if (e.button !== 0) return;

    if (hasDraggedRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas || !rendererRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = screenToWorld(x, y);
    const clickedElement = selectionHandler.current?.findElementAtPosition(worldPos);

    if (clickedElement) {
      if (e.shiftKey) {
        setSelectedElements(prev => {
          const newSet = new Set(prev);
          if (newSet.has(clickedElement.id)) {
            newSet.delete(clickedElement.id);
          } else {
            newSet.add(clickedElement.id);
          }
          return newSet;
        });
      } else {
        setSelectedElements(new Set([clickedElement.id]));
      }
      onElementClick?.(clickedElement);
    } else {
      if (!e.shiftKey) {
        setSelectedElements(new Set());
      }
    }

    onCanvasClick?.({ x, y });
  }, [interactive, onElementClick, onCanvasClick, screenToWorld, setSelectedElements]);

  // Handle canvas double-click (toggle element on/off)
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    if (e.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas || !rendererRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = screenToWorld(x, y);
    const clickedElement = selectionHandler.current?.findElementAtPosition(worldPos);

    if (clickedElement) {
      onElementDoubleClick?.(clickedElement);
    }
  }, [interactive, onElementDoubleClick, screenToWorld]);

  // Handle wheel (zoom)
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!interactive) return;
    panZoomHandler.current?.handleWheel(e);
  }, [interactive]);

  // Handle mouse down (start pan or drag)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = screenToWorld(x, y);

    // Check for line endpoints FIRST, before element detection
    // This ensures line endpoints can be dragged even when they overlap with bus bounds
    const endpointInfo = findLineEndpointAtPosition(worldPos);

    const busResizeHandle = findBusResizeHandleAtPosition(
      visibleElementsRef.current,
      worldPos,
      NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT
    );

    // Only find element at position if not clicking on an endpoint
    // This gives endpoint dragging priority over bus dragging
    const clickedElement = endpointInfo ? null : selectionHandler.current?.findElementAtPosition(worldPos);

    if (e.button === 0 && e.shiftKey) {
      // Left-click + shift for lasso selection
      cancelAnimation();
      setIsDragging(true);
      setDragStart(worldPos);
      setSelectionBounds({
        x: worldPos.x,
        y: worldPos.y,
        width: 0,
        height: 0,
      });
    } else if (e.button === 0 && endpointInfo && !e.shiftKey) {
      // Left-click on line endpoint (and not on bus) - start dragging endpoint
      cancelAnimation();
      setIsDragging(true);
      setIsDraggingEndpoint(true);
      setDragStart(worldPos);
      hasDraggedRef.current = false;

      const dragInfo = dragHandler.current?.createEndpointDragInfo(
        endpointInfo.element,
        endpointInfo.endpointIndex,
        endpointInfo.busNumber,
        worldPos
      );
      if (dragInfo) {
        setElementDragInfo(dragInfo);
      }
      canvas.style.cursor = 'ns-resize'; // Use north-south resize cursor for vertical movement
    } else if (e.button === 0 && busResizeHandle && !e.shiftKey) {
      // Left-click on bus height resize handle - start resizing bus height
      cancelAnimation();
      setIsDragging(true);
      setDragStart(worldPos);
      hasDraggedRef.current = false;
      const busEl = busResizeHandle.element;
      setSelectedElements(new Set([busEl.id])); // Select bus so resize handle is visible while dragging
      const currentHeight = busEl.busHeight ?? NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT;
      setBusResizeInfo({
        elementId: busEl.id,
        startY: worldPos.y,
        startHeight: currentHeight,
      });
      canvas.style.cursor = 'ns-resize';
    } else if (e.button === 0 && clickedElement && !e.shiftKey) {
      // Left-click on element - start dragging immediately (no select step)
      cancelAnimation();
      setIsDragging(true);
      setDragStart(worldPos);
      hasDraggedRef.current = false;

      const dragInfo = dragHandler.current?.createDragInfo(clickedElement);
      if (dragInfo) {
        setElementDragInfo(dragInfo);
      }
      canvas.style.cursor = 'grabbing';
    } else if (e.button === 1 || (e.button === 0 && !clickedElement && !endpointInfo)) {
      // Middle mouse or left-click on empty space for pan
      cancelAnimation();
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [interactive, screenToWorld, cancelAnimation, findLineEndpointAtPosition]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldPos = screenToWorld(x, y);

    // Update mouse world position for endpoint handle rendering
    setMouseWorldPos(worldPos);

    // Update hovered element for bus resize handle on hover (and cursor)
    const hoveredElement = selectionHandler.current?.findElementAtPosition(worldPos);
    if (!isDragging && !isPanning) {
      setHoveredElementId(hoveredElement?.id ?? null);
    }

    // Update cursor
    const hoveredEndpoint = findLineEndpointAtPosition(worldPos);
    const hoveredBusResize = findBusResizeHandleAtPosition(
      visibleElementsRef.current,
      worldPos,
      NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT
    );
    if (elementDragInfo) {
      canvas.style.cursor = isDraggingEndpoint ? 'ns-resize' : 'grabbing';
    } else if (busResizeInfo) {
      canvas.style.cursor = 'ns-resize';
    } else if (hoveredBusResize) {
      canvas.style.cursor = 'ns-resize';
    } else if (hoveredEndpoint) {
      canvas.style.cursor = 'ns-resize'; // Show north-south resize cursor for endpoints
    } else if (hoveredElement) {
      canvas.style.cursor = 'grab';
    } else if (isPanning) {
      canvas.style.cursor = 'grabbing';
    } else if (isDragging) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = interactive ? 'grab' : 'default';
    }

    // Handle bus height resize
    if (isDragging && busResizeInfo) {
      const el = elementsRef.current.get(busResizeInfo.elementId);
      if (el && el.type === 'bus') {
        const dy = worldPos.y - busResizeInfo.startY;
        const newHeight = Math.min(
          MAX_BUS_HEIGHT,
          Math.max(MIN_BUS_HEIGHT, busResizeInfo.startHeight + dy * 2)
        );
        el.busHeight = newHeight;
        el.bounds = calculateBusBounds(el.position, {
          busHeight: newHeight,
          busWidth: NETWORK_DIAGRAM_CONSTANTS.BUS_WIDTH,
          hitboxPadding: 1,
        });
        // Update connection info and push new connection points to lines/devices so they stay on the bus
        const busInfo = busConnectionInfosRef.current.get(busResizeInfo.elementId);
        if (busInfo) {
          busInfo.busHeight = newHeight;
          recalculateBusConnectionPoints(busInfo);
          applyConnectionPointsToElements(busInfo, elementsRef.current);
        }
      }
      requestAnimationFrame(() => renderFunctionRef.current?.());
      return;
    }

    // Handle element dragging
    if (isDragging && dragStart && elementDragInfo) {
      const dx = worldPos.x - dragStart.x;
      const dy = worldPos.y - dragStart.y;

      if (Math.abs(dx) > NETWORK_DIAGRAM_CONSTANTS.DRAG_THRESHOLD ||
          Math.abs(dy) > NETWORK_DIAGRAM_CONSTANTS.DRAG_THRESHOLD) {
        hasDraggedRef.current = true;
      }

      dragHandler.current?.updateDragPositions(
        elementDragInfo.elementId,
        dragStart,
        worldPos,
        elementDragInfo
      );

      requestAnimationFrame(() => renderFunctionRef.current?.());
      return;
    }

    // Handle panning
    if (isPanning && dragStart && !elementDragInfo) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      if (Math.abs(dx) > NETWORK_DIAGRAM_CONSTANTS.DRAG_THRESHOLD ||
          Math.abs(dy) > NETWORK_DIAGRAM_CONSTANTS.DRAG_THRESHOLD) {
        hasDraggedRef.current = true;
      }

      const newTransform = panZoomHandler.current?.updatePan(dx, dy);
      if (newTransform) {
        transformRef.current = newTransform;
        setTransform(newTransform);
      }

      setDragStart({ x: e.clientX, y: e.clientY });
      requestAnimationFrame(() => renderFunctionRef.current?.());
    }

    // Handle lasso selection
    if (isDragging && dragStart && !elementDragInfo) {
      const bounds = selectionHandler.current?.calculateSelectionBounds(dragStart, worldPos);
      if (bounds) {
        setSelectionBounds(bounds);

        const selectedElements = selectionHandler.current?.findElementsInBounds(dragStart, worldPos);
        if (selectedElements) {
          const newSelection = new Set(selectionHandler.current?.getElementIds(selectedElements));
          setSelectedElements(newSelection);
        }

        requestAnimationFrame(() => renderFunctionRef.current?.());
      }
    }

    // Trigger render for endpoint handles when hovering
    if (hoveredEndpoint && !isDragging) {
      requestAnimationFrame(() => renderFunctionRef.current?.());
    }
  }, [interactive, isPanning, isDragging, dragStart, elementDragInfo, busResizeInfo, screenToWorld, setSelectedElements, isDraggingEndpoint]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setIsDraggingEndpoint(false);
    setBusResizeInfo(null);
    setDragStart(null);
    setElementDragInfo(null);
    setSelectionBounds(null);
    setTimeout(() => {
      hasDraggedRef.current = false;
    }, 0);
  }, []);

  return {
    isDragging,
    isPanning,
    dragStart,
    elementDragInfo,
    selectionBounds,
    hasDraggedRef,
    isDraggingEndpoint,
    mouseWorldPos,
    hoveredElementId,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
