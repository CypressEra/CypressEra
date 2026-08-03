/**
 * Network Diagram Container Component
 * Main container that holds the canvas and manages the diagram
 */

import React, { useRef, useCallback, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { useTheme } from '@/components/ui';
import { CanvasRenderer } from '../renderers/CanvasRenderer';
import { ContextMenu, MenuItem } from '../../../common/ContextMenu';
import { AlertModal } from '../../../common';
import { DiagramElement, NetworkDataset, NetworkDiagramProps, Transform, Bounds, Point } from '../types';
import { NetworkDiagramCanvas } from './NetworkDiagramCanvas';
import { RenderController } from '../controllers/RenderController';
import { ContextMenuBuilder } from '../menus/ContextMenuBuilder';
import { getRenderStyle, ThemeType } from '../config/themes';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';
import { PanZoomHandler } from '../interaction/PanZoomHandler';
import { SelectionHandler } from '../interaction/SelectionHandler';
import { BusSelectorModal } from '../../../common/Modal/variants/bus-selector';
import { LocateBusModal } from '../../../common/Modal/variants/locate-bus';
import { GrowBusConnectionsModal } from '../../../common/Modal/variants/grow-bus-connections';
import { ShortestPathModal } from '../../../common/Modal/variants/shortest-path';
import { NeighbourElementsModal } from '../../../common/Modal/variants/neighbour-elements';
import { ParameterEditorModal, ParameterCategory } from '../../../common/Modal/variants/parameter-editor';
import { getBusesWithinNAway, findPathBetweenBuses } from '../utils/busGraphUtils';
import { getParameterCategories, ELEMENT_IDENTIFIERS } from '../../../../parameters';
import { PowerFlowApp, ELEMENT_TYPES } from '../../../../sdk';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../../../../hooks';

// Import hooks
import { useTransform } from '../hooks/useTransform';
import { useElementSelection } from '../hooks/useElementSelection';
import { useCanvasResize } from '../hooks/useCanvasResize';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useDataProcessing } from '../hooks/useDataProcessing';
import { calculateBusBounds } from '../renderers/elements/bus';
import { calculateLoadBounds } from '../renderers/elements/load';
import { calculateGeneratorBounds } from '../renderers/elements/generator';
import { calculateFixedShuntBounds } from '../renderers/elements/fixed_shunt';
import { calculateSwitchedShuntBounds } from '../renderers/elements/switched_shunt';
import { updateBusCenterInConnectionInfo, applyConnectionPointsToElements, createBusConnectionInfo, addConnectionToBus } from '../utils/busConnectionPoints';
import { findElementAtPosition } from '../utils/elementUtils';
import { normalizeBusListConfig } from '../utils/busListUtils';
import { serialize as serializeDiagramDoc, deserialize as deserializeDiagramDoc } from '../io';

import '../NetworkDiagram.css';

/** Find a position in empty space near existing bus positions (for newly plotted buses) */
function findNearbyEmptyPosition(existingPositions: Point[], spacing: number): Point {
  if (existingPositions.length === 0) {
    return { x: 0, y: 0 };
  }
  const cx = existingPositions.reduce((s, p) => s + p.x, 0) / existingPositions.length;
  const cy = existingPositions.reduce((s, p) => s + p.y, 0) / existingPositions.length;
  // Place new bus in a circle around centroid so multiple buses don't stack
  const angleDeg = (existingPositions.length * 60) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + spacing * Math.cos(angleRad),
    y: cy + spacing * Math.sin(angleRad),
  };
}

export interface NetworkDiagramRef {
  updateData: (data: NetworkDataset) => void;
  updatePowerFlowResults: (results: any) => void;
  highlightElements: (elementIds: string[]) => void;
  selectElements: (elementIds: string[]) => void;
  resetView: () => void;
  exportAsPNG: () => void;
  fitToView: () => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  /** Plot specific buses on the diagram (dynamic runtime plotting) */
  plotBuses: (busNumbers: number[]) => void;
  /** Serialize the current diagram to the cypressera.diagram wire format. */
  saveDiagram: (options?: import('../io').SerializeOptions) => Promise<import('../io').SerializeResult>;
  /** Load a saved cypressera.diagram file/string/bytes and apply its layout.
   *  Returns the deserialization result (errors or { elements, warnings }). */
  loadDiagram: (input: string | Uint8Array | ArrayBuffer) => Promise<import('../io').DeserializeResult>;
  /** Suppress canvas paints immediately. Call BEFORE switching the network
   *  panel to diagram view so the initial mount / resize-observer cascade
   *  cannot paint a fit-to-content frame before loadDiagram applies the saved
   *  view. The gate is auto-released by loadDiagram (or its safety timeout). */
  beginDiagramLoad: () => void;
}

export const NetworkDiagramContainer = React.forwardRef<NetworkDiagramRef, NetworkDiagramProps>(({
  data,
  powerFlowResults,
  initialBusConfig,
  onElementClick,
  onElementDoubleClick,
  onSelectionChange,
  onCanvasClick,
  onElementsChanged,
  onContextMenuOpenDiagram,
  onContextMenuSaveDiagram,
  className = '',
  style,
  theme: themeProp,
  showLabels = true,
  showFlowValues = true,
  interactive = true,
  initialTransform = {},
  layoutConfig = { algorithm: 'force' },
  triggerLoadFile,
  sessionKey,
}, ref) => {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const renderFunctionRef = useRef<(() => void) | null>(null);
  // Tracks when renderer becomes available so useCanvasResize re-runs (e.g. after empty state → data)
  const [rendererReady, setRendererReady] = useState(0);

  // Control element visibility - initially hidden, show when user right-clicks "Plot All Buses"
  const [showElements, setShowElements] = useState(false);

  // Track plotted buses - Set of bus numbers that should be visible
  // null means show all buses, Set means show only buses in the set
  const [plottedBusNumbers, setPlottedBusNumbers] = useState<Set<number> | null>(null);
  // Ref to track plotted buses for immediate access (avoids closure staleness in async handlers)
  const plottedBusNumbersRef = useRef<Set<number> | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    plottedBusNumbersRef.current = plottedBusNumbers;
  }, [plottedBusNumbers]);

  const [isBusSelectorOpen, setIsBusSelectorOpen] = useState(false);
  const [isLocateBusModalOpen, setIsLocateBusModalOpen] = useState(false);
  const [isGrowBusModalOpen, setIsGrowBusModalOpen] = useState(false);
  const [growBusSourceBusNumber, setGrowBusSourceBusNumber] = useState<number | null>(null);

  // Graph analysis modal state
  const [isShortestPathModalOpen, setIsShortestPathModalOpen] = useState(false);
  const [shortestPathSourceBus, setShortestPathSourceBus] = useState<number | null>(null);
  const [isNeighbourElementsModalOpen, setIsNeighbourElementsModalOpen] = useState(false);
  const [neighbourElementsSourceBus, setNeighbourElementsSourceBus] = useState<number | null>(null);

  // Parameter editor modal state
  const [isParamEditorOpen, setIsParamEditorOpen] = useState(false);
  const [selectedElementData, setSelectedElementData] = useState<any>(null);
  const [selectedElementType, setSelectedElementType] = useState<string>('');
  const [selectedElementId, setSelectedElementId] = useState<string>('');
  const [paramCategories, setParamCategories] = useState<ParameterCategory[]>([]);
  // Track if we're in "add" mode (vs modify mode) - for adding generators/loads to buses
  const [isAddMode, setIsAddMode] = useState(false);

  // Hidden elements - Set of element IDs that should be hidden (removed from diagram)
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<string>>(new Set());

  // Delete element confirmation (reference: NetworkDataTable delete flow)
  const [deleteElementConfirmation, setDeleteElementConfirmation] = useState<{
    isOpen: boolean;
    element: DiagramElement | null;
    elementType: string; // SDK type: bus | load | generator | acline | transformer
    identifier: Record<string, any> | null;
    elementInfo: string;
  }>({
    isOpen: false,
    element: null,
    elementType: '',
    identifier: null,
    elementInfo: '',
  });

  // Visible elements ref: used for hit-testing so hidden elements are not clickable/hoverable
  const visibleElementsRef = useRef<Map<string, DiagramElement>>(new Map());

  // Pending diagram load: when loadDiagram is called before the diagram has been
  // plotted (elementsRef is empty), we stash the loaded state here and trigger
  // plotting. A useEffect drains this once elementsRef populates.
  const pendingLoadRef = useRef<DiagramElement[] | null>(null);

  // Saved view (scale + offset) carried by the most recent loaded cyd. Drain
  // restores this AFTER applyLoadedLayout so the viewport matches what was
  // saved instead of a fit-to-content auto-center.
  const pendingDiagramViewRef = useRef<Transform | null>(null);

  // Paint-gate ref: when set, render() returns early. Used by Path C drain to
  // hide intermediate frames (recreate, auto-centering, etc.) so the user
  // sees one clean transition from the previous view to the final cyd view.
  // Distinct from pendingLoadRef because Path A (ghost) sets pendingLoadRef
  // for a future model-load drain but still wants its ghost render to paint.
  const suppressPaintsRef = useRef<boolean>(false);

  // Safety release for the paint gate set by beginDiagramLoad(). If
  // loadDiagram never arrives (download fails, ref disposed mid-flight) we
  // must not leave the canvas permanently blank — this timeout force-clears
  // the gate after 5s and paints whatever's current.
  const beginLoadSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (beginLoadSafetyTimeoutRef.current) clearTimeout(beginLoadSafetyTimeoutRef.current);
  }, []);

  // Ghost-load → model-arrival is its own flash window: when `data` flips
  // from null to truthy while a pending cyd load is still queued, the model
  // factory replaces ghost elements with factory-positioned real ones, and
  // the visibleElementsRef RAF would paint that intermediate state BEFORE
  // the drain effect (which applies the saved positions + saved view) gets
  // a chance to run. Re-arm the paint gate synchronously here so every RAF
  // queued during this commit cycle bails out; the drain's 200ms release
  // timeout owns clearing it and firing the single final paint.
  useLayoutEffect(() => {
    if (data && pendingLoadRef.current !== null) {
      suppressPaintsRef.current = true;
    }
  }, [data]);

  // Bus numbers present in the most recent loaded cyd. Drain narrows
  // plottedBusNumbers to this set so the canvas shows ONLY what was saved —
  // any buses the user hadn't plotted at save time stay hidden after load.
  const pendingPlottedBusesRef = useRef<Set<number> | null>(null);

  // Extract the set of bus numbers referenced by a list of loaded in-memory
  // DiagramElements. Buses contribute their own ibus; lines contribute both
  // endpoints; devices contribute their owning bus.
  const collectBusNumbersFromLoaded = useCallback((elements: DiagramElement[]): Set<number> => {
    const result = new Set<number>();
    for (const el of elements) {
      const anyEl = el as any;
      const data = anyEl.data ?? {};
      if (el.type === 'bus') {
        if (typeof data.ibus === 'number') result.add(data.ibus);
      } else if (el.type === 'acline' || el.type === 'transformer' || el.type === 'transformer3w') {
        if (typeof anyEl.fromBus === 'number') result.add(anyEl.fromBus);
        if (typeof anyEl.toBus   === 'number') result.add(anyEl.toBus);
        if (typeof data.kbus === 'number' && data.kbus > 0) result.add(data.kbus);
      } else if (el.type === 'two_term_dc' || el.type === 'vsc_dc') {
        if (typeof anyEl.fromBus === 'number') result.add(anyEl.fromBus);
        if (typeof anyEl.toBus   === 'number') result.add(anyEl.toBus);
      } else if (el.type === 'load' || el.type === 'generator' || el.type === 'fixed_shunt' || el.type === 'switched_shunt') {
        const busNum = anyEl.bus ?? data.ibus;
        if (typeof busNum === 'number') result.add(busNum);
      }
    }
    return result;
  }, []);

  // Refs used by the brute-force viewport-pinning loop (see ghost-load + drain).
  // We capture the desired transform (scale + offset) at ghost-load time and
  // replay it on a 50ms interval for ~1.5s after model load, to defeat resize
  // observers, useCanvasResize setTimeouts, and other async paths that recompute
  // the transform based on changed canvas dimensions or stale layoutBoundsRef.
  const pinnedTransformRef = useRef<Transform | null>(null);

  const transformPinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transformPinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (transformPinIntervalRef.current) clearInterval(transformPinIntervalRef.current);
    if (transformPinTimeoutRef.current) clearTimeout(transformPinTimeoutRef.current);
  }, []);

  // Compute layout bounds from a list of in-memory elements so the canvas can
  // center on them. Used by the ghost-load path (when there's no model yet) and
  // by the post-drain re-centering (after the drain applies cyd positions to
  // the freshly-created model elements, the original auto-layout bounds are
  // stale and the viewport ends up looking at the wrong area).
  const computeBoundsFromElements = useCallback((elements: DiagramElement[] | Map<string, DiagramElement>) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    const visit = (el: DiagramElement) => {
      const p = el.position;
      if (!p) return;
      any = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    };
    if (Array.isArray(elements)) elements.forEach(visit);
    else elements.forEach(visit);
    if (!any) return null;
    return {
      bounds: { minX, minY, maxX, maxY },
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, []);

  // Ghost-mode rendering: when a diagram is loaded without a model (or with a
  // model that doesn't contain everything in the file), we still want to show
  // the saved layout. `hasGhostDiagram` flips the empty-state guard so the
  // canvas paints even without `data`.
  const [hasGhostDiagram, setHasGhostDiagram] = useState(false);

  // Track the previous session key to detect session changes (e.g., loading a different file). Session ID does not change after add/modify.
  const previousSessionKeyRef = useRef<string | undefined>(sessionKey);
  const sessionChanged = previousSessionKeyRef.current !== sessionKey;

  // Theme: follow project theme (useTheme) when theme prop is not set; otherwise use prop override
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const { showError } = useNotification();
  const theme: ThemeType = themeProp ?? (isDark ? 'dark' : 'light');
  const renderStyle = getRenderStyle(theme);

  // Use custom hooks
  const {
    transform,
    transformRef,
    targetTransformRef,
    isAnimatingRef,
    animateZoom,
    cancelAnimation,
    setTransform,
  } = useTransform({ initialTransform });

  const {
    selectedElements,
    setSelectedElements,
    selectMultiple,
  } = useElementSelection();

  // When a .cyd was loaded in ghost mode and a model is now arriving, hide
  // sessionChanged from useDataProcessing so it (a) doesn't clear elementsRef,
  // (b) doesn't bump centeringTrigger, and (c) the factory's position-
  // preservation kicks in (it only saves existing positions when
  // !sessionChanged). End result: the diagram stays exactly where the ghost
  // left it, and the auto-centering pipeline never runs.
  const sessionChangedForDataProcessing =
    pendingLoadRef.current !== null ? false : sessionChanged;

  // Data processing
  const {
    elementsRef,
    edgeBundlesRef,
    busConnectionInfosRef,
    layoutBoundsRef,
    centeringTrigger,
    elementsUpdateTrigger,
    computeStatus,
    computeProgress,
    computeError,
    cancelCompute,
  } = useDataProcessing({
    data,
    layoutConfig,
    showElements,
    sessionChanged: sessionChangedForDataProcessing,
    plottedBusNumbers,
    powerFlowResults,
  });

  // Reset element visibility and bus selection when a NEW session is loaded
  // This preserves plot state during data refresh (e.g., after modify/add/delete operations)
  useEffect(() => {
    if (data && sessionChanged) {
      // If a .cyd was already loaded in ghost mode and the model is now
      // arriving, keep the diagram plotted so the drain effect can snap the
      // saved layout onto the new real elements. Otherwise the new-session
      // reset would wipe everything.
      const restoreFromGhost = pendingLoadRef.current !== null;
      console.log('[NetworkDiagram] session change', { restoreFromGhost, sessionKey });
      setShowElements(restoreFromGhost ? true : false);
      setHiddenElementIds(new Set());
      previousSessionKeyRef.current = sessionKey;
      // Short-circuit when restoring from a ghost-mode load: skip the
      // initial-bus-config bookkeeping below. Plot ONLY the cyd's bus subset
      // (not the whole model) so unsaved buses don't appear after the model
      // arrives.
      if (restoreFromGhost) {
        const subset = pendingPlottedBusesRef.current;
        setPlottedBusNumbers(subset && subset.size > 0 ? subset : null);
        return;
      }

      // Initialize plottedBusNumbers from initialBusConfig if provided
      if (initialBusConfig) {
        const busNumbers = normalizeBusListConfig(initialBusConfig);
        if (busNumbers && busNumbers.size > 0) {
          // If includeConnectedBuses is specified, we need to expand the bus list
          const config = initialBusConfig;
          const includeConnected = typeof config === 'object' && 'includeConnectedBuses' in config
            ? (config as any).includeConnectedBuses
            : false;

          if (includeConnected) {
            // Build neighbor map and include connected buses
            const neighborMap = new Map<number, Set<number>>();
            const aclines = data.aclines || [];
            const transformers = data.transformers || [];
            const twotermdc = data.twotermdc || [];
            const vscdc = (data as any).vscdc || [];

            const addConnection = (fromBus: number, toBus: number) => {
              if (!neighborMap.has(fromBus)) {
                neighborMap.set(fromBus, new Set());
              }
              neighborMap.get(fromBus)!.add(toBus);
            };

            aclines.forEach(line => {
              addConnection(line.ibus, line.jbus);
              addConnection(line.jbus, line.ibus);
            });

            twotermdc.forEach(line => {
              addConnection(line.ipi, line.ipr);
              addConnection(line.ipr, line.ipi);
            });

            vscdc.forEach((device: { ibus1: number; ibus2: number; stat?: number }) => {
              if (device.stat === 0) return;
              addConnection(device.ibus1, device.ibus2);
              addConnection(device.ibus2, device.ibus1);
            });

            transformers.forEach(tf => {
              addConnection(tf.ibus, tf.jbus);
              addConnection(tf.jbus, tf.ibus);
              if (tf.kbus && tf.kbus > 0) {
                addConnection(tf.ibus, tf.kbus);
                addConnection(tf.kbus, tf.ibus);
                addConnection(tf.jbus, tf.kbus);
                addConnection(tf.kbus, tf.jbus);
              }
            });

            const maxDepth = typeof config === 'object' && 'maxConnectionDepth' in config
              ? ((config as any).maxConnectionDepth ?? 1)
              : 1;

            const expandedBuses = new Set<number>();
            const startBuses = Array.from(busNumbers);
            let currentLayer = new Set(startBuses);
            startBuses.forEach(b => expandedBuses.add(b));

            for (let hop = 0; hop < maxDepth; hop++) {
              const nextLayer = new Set<number>();
              currentLayer.forEach(bus => {
                const neighbors = neighborMap.get(bus);
                if (neighbors) {
                  neighbors.forEach(neighbor => {
                    if (!expandedBuses.has(neighbor)) {
                      expandedBuses.add(neighbor);
                      nextLayer.add(neighbor);
                    }
                  });
                }
              });
              currentLayer = nextLayer;
            }

            setPlottedBusNumbers(expandedBuses);
          } else {
            setPlottedBusNumbers(busNumbers);
          }
        } else {
          setPlottedBusNumbers(null);
        }
      } else {
        setPlottedBusNumbers(null);
      }
    }
  }, [data, sessionKey, sessionChanged, initialBusConfig]);

  // Canvas resize
  const { isResizingRef, applyCentering } = useCanvasResize({
    canvasRef,
    rendererRef,
    transformRef,
    renderFunctionRef,
    layoutBoundsRef,
    setTransform,
    centeringTrigger,
    rendererReady,
  });

  // Map diagram element type to SDK element type (transformer3w -> transformer); SDK uses value type 'bus'|'load'|...
  const getSdkElementType = useCallback((diagramType: string): string => {
    if (diagramType === 'transformer3w') return 'transformer';
    if (diagramType === 'fixed_shunt') return 'fixshunt';
    if (diagramType === 'switched_shunt') return 'swshunt';
    return diagramType;
  }, []);

  // Build identifier from element data (same as NetworkDataTable)
  const buildIdentifierFromElement = useCallback((element: DiagramElement): Record<string, any> => {
    const sdkType = getSdkElementType(element.type);
    const identifierFields = ELEMENT_IDENTIFIERS[sdkType] || [];
    const identifier: Record<string, any> = {};
    const data = element.data as Record<string, any>;
    identifierFields.forEach(field => {
      if (data[field] !== undefined) {
        identifier[field] = data[field];
      }
    });
    return identifier;
  }, [getSdkElementType]);

  // Element types that support status toggling (have stat field)
  const TOGGLEABLE_ELEMENT_TYPES = ['load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt', 'twotermdc', 'vscdc'];

  // Handle element double-click to toggle on/off status
  const handleElementDoubleClick = useCallback(async (element: DiagramElement) => {
    const sdkType = getSdkElementType(element.type);

    // Only toggle elements that have a stat field
    if (!TOGGLEABLE_ELEMENT_TYPES.includes(sdkType)) {
      return;
    }

    const identifier = buildIdentifierFromElement(element);
    const data = element.data as Record<string, any>;

    // Get current status - stat field: 0=off, 1=on
    const currentStat = data.stat ?? data.status ?? 1;
    const newStat = currentStat === 0 ? 1 : 0;

    try {
      await PowerFlowApp.modifyElement(sdkType as keyof typeof ELEMENT_TYPES, identifier, { stat: newStat });
    } catch (error: any) {
      console.error('Failed to toggle element status:', error);
      showError(t('common:error'), error?.message ?? 'Failed to toggle element status');
    }
  }, [getSdkElementType, buildIdentifierFromElement, showError, t]);

  // Canvas interaction
  const {
    isPanning,
    selectionBounds,
    mouseWorldPos,
    hoveredElementId,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useCanvasInteraction({
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
    onElementDoubleClick: onElementDoubleClick ?? handleElementDoubleClick,
    onCanvasClick,
    interactive,
  });

  // Find buses connected to a bus via lines or transformers
  // Uses raw data instead of created elements to find all connections,
  // including those to buses that are not currently plotted
  const findConnectedBuses = useCallback((busNumber: number): Set<number> => {
    const connected = new Set<number>();

    // Check AC lines
    data?.aclines?.forEach((line) => {
      if (line.stat === 0) return; // Skip out of service lines
      if (line.ibus === busNumber && line.jbus) {
        connected.add(line.jbus);
      } else if (line.jbus === busNumber && line.ibus) {
        connected.add(line.ibus);
      }
    });

    // Check two-terminal DC lines
    data?.twotermdc?.forEach((line: { ipi: number; ipr: number; stat?: number }) => {
      if (line.stat === 0) return;
      if (line.ipi === busNumber) connected.add(line.ipr);
      else if (line.ipr === busNumber) connected.add(line.ipi);
    });

    // Check VSC DC links
    (data as any)?.vscdc?.forEach((device: { ibus1: number; ibus2: number; stat?: number }) => {
      if (device.stat === 0) return;
      if (device.ibus1 === busNumber) connected.add(device.ibus2);
      else if (device.ibus2 === busNumber) connected.add(device.ibus1);
    });

    // Check transformers
    data?.transformers?.forEach((xfm) => {
      if (xfm.stat === 0) return; // Skip out of service transformers
      if (xfm.ibus === busNumber) {
        if (xfm.jbus) connected.add(xfm.jbus);
        if (xfm.kbus && xfm.kbus > 0) connected.add(xfm.kbus);
      } else if (xfm.jbus === busNumber) {
        if (xfm.ibus) connected.add(xfm.ibus);
        if (xfm.kbus && xfm.kbus > 0) connected.add(xfm.kbus);
      } else if (xfm.kbus === busNumber && xfm.kbus > 0) {
        if (xfm.ibus) connected.add(xfm.ibus);
        if (xfm.jbus) connected.add(xfm.jbus);
      }
    });

    return connected;
  }, [data]);

  /** Collect element IDs for a bus and all elements connected to it (used when unhiding on plot) */
  const getElementIdsForBusAndConnections = useCallback((busNumber: number): Set<string> => {
    const ids = new Set<string>();
    const elements = elementsRef.current;
    const busId = `bus_${busNumber}`;
    const busEl = elements.get(busId);
    if (busEl?.type === 'bus') {
      ids.add(busId);
    }
    elements.forEach((element, id) => {
      if (element.type === 'load' || element.type === 'generator' ||
          element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
        const data = element.data as { ibus?: number };
        if (data.ibus === busNumber) ids.add(id);
      } else if (element.type === 'acline') {
        const lineData = element.data as { ibus?: number; jbus?: number; ipi?: number; ipr?: number };
        const from = lineData.ipi ?? lineData.ibus;
        const to = lineData.ipr ?? lineData.jbus;
        if (from === busNumber || to === busNumber) ids.add(id);
      } else if (element.type === 'transformer' || element.type === 'transformer3w') {
        const xfmData = element.data as { ibus?: number; jbus?: number; kbus?: number };
        if (xfmData.ibus === busNumber || xfmData.jbus === busNumber ||
            (xfmData.kbus !== undefined && xfmData.kbus > 0 && xfmData.kbus === busNumber)) {
          ids.add(id);
        }
      }
    });
    return ids;
  }, []);

  // Add a bus and buses that connect it to already-plotted buses (non-recursive)
  // Returns the order in which buses were added (for proper repositioning)
  const addBusWithConnections = useCallback((
    busNumber: number,
    alreadyPlottedSet: Set<number>,
    currentPlottedSet: Set<number>,
    addedOrder: number[] = []
  ): number[] => {
    const busesToAdd = new Set<number>();

    // Also check transformers to see if we need to add kbus
    const elements = elementsRef.current;
    elements.forEach((element) => {
      if (element.type === 'transformer3w') {
        const xfmData = element.data as { ibus?: number; jbus?: number; kbus?: number };
        // If new bus connects via 3-winding transformer to an already-plotted bus, add kbus
        if (xfmData.ibus === busNumber && alreadyPlottedSet.has(xfmData.jbus!)) {
          if (xfmData.kbus && xfmData.kbus > 0) {
            busesToAdd.add(xfmData.kbus);
          }
        } else if (xfmData.jbus === busNumber && alreadyPlottedSet.has(xfmData.ibus!)) {
          if (xfmData.kbus && xfmData.kbus > 0) {
            busesToAdd.add(xfmData.kbus);
          }
        }
      }
    });

    // Always add the bus that the user requested to plot (allow plotting any bus, not only those
    // connected to already-plotted buses via lines/transformers)
    if (!currentPlottedSet.has(busNumber)) {
      currentPlottedSet.add(busNumber);
      addedOrder.push(busNumber);
    }

    // Add kbus for 3-winding transformers
    busesToAdd.forEach((kbus) => {
      if (!currentPlottedSet.has(kbus)) {
        currentPlottedSet.add(kbus);
        addedOrder.push(kbus);
      }
    });

    return addedOrder;
  }, [elementsRef]);

  // Reposition a bus (and its connected loads/generators) to nearby empty space when adding to the plotted set
  const repositionBusToNearbyEmptySpace = useCallback((
    busNumber: number,
    currentPlottedSet: Set<number> | null
  ) => {
    const currentSet = currentPlottedSet ?? new Set<number>();
    if (currentSet.size === 0) return; // Keep layout position for first bus

    const elements = elementsRef.current;
    const busId = `bus_${busNumber}`;
    const el = elements.get(busId);
    if (!el || el.type !== 'bus') return;

    const oldPosition = { x: el.position.x, y: el.position.y };
    const existingPositions: Point[] = [];
    currentSet.forEach((n) => {
      const b = elements.get(`bus_${n}`);
      if (b?.position) existingPositions.push(b.position);
    });
    const newPosition = findNearbyEmptyPosition(
      existingPositions,
      NETWORK_DIAGRAM_CONSTANTS.PLOT_BUS_SPACING
    );
    const dx = newPosition.x - oldPosition.x;
    const dy = newPosition.y - oldPosition.y;

    // Move the bus
    el.position.x = newPosition.x;
    el.position.y = newPosition.y;
    el.bounds = calculateBusBounds(el.position, {
      busHeight: NETWORK_DIAGRAM_CONSTANTS.BUS_HEIGHT,
      busWidth: NETWORK_DIAGRAM_CONSTANTS.BUS_WIDTH,
    });

    const busInfos = busConnectionInfosRef.current;
    const busInfo = busInfos.get(busId);
    if (busInfo) {
      updateBusCenterInConnectionInfo(busInfo, newPosition);
      applyConnectionPointsToElements(busInfo, elements);
    }

    // Move connected loads, generators, and shunts by the same delta so they stay beside the bus
    const loadSize = 20;
    const genSize = 24;
    const shuntSize = 20;
    elements.forEach((element) => {
      if (element.type === 'load') {
        const loadData = element.data as { ibus?: number };
        if (loadData.ibus === busNumber) {
          element.position.x += dx;
          element.position.y += dy;
          element.bounds = calculateLoadBounds(element.position, { size: loadSize });
        }
      } else if (element.type === 'generator') {
        const genData = element.data as { ibus?: number };
        if (genData.ibus === busNumber) {
          element.position.x += dx;
          element.position.y += dy;
          element.bounds = calculateGeneratorBounds(element.position, { size: genSize });
        }
      } else if (element.type === 'fixed_shunt') {
        const shuntData = element.data as { ibus?: number };
        if (shuntData.ibus === busNumber) {
          element.position.x += dx;
          element.position.y += dy;
          element.bounds = calculateFixedShuntBounds(element.position, { size: shuntSize });
        }
      } else if (element.type === 'switched_shunt') {
        const shuntData = element.data as { ibus?: number };
        if (shuntData.ibus === busNumber) {
          element.position.x += dx;
          element.position.y += dy;
          element.bounds = calculateSwitchedShuntBounds(element.position, { size: shuntSize });
        }
      }
    });
  }, []);

  // Apply a loaded diagram's positions/geometry to the currently-rendered
  // elements. Used by both the immediate-apply path (elements already plotted)
  // and the deferred drain path (we just auto-plotted in response to load).
  const applyLoadedLayout = useCallback((loadedElements: DiagramElement[]) => {
    const live = elementsRef.current;
    const wireIndex = new Map<string, DiagramElement>();
    live.forEach(el => { if (el.wireId) wireIndex.set(el.wireId, el); });

    let applied = 0;
    const ghosted: string[] = [];
    for (const loaded of loadedElements) {
      const target =
        (loaded.wireId && wireIndex.get(loaded.wireId)) ||
        live.get(loaded.id);
      if (!target) {
        // Element exists in the saved file but not in the current model.
        // Add it as a ghost so the user sees what's missing.
        loaded.unmodeled = true;
        live.set(loaded.id, loaded);
        ghosted.push(`${loaded.type} ${loaded.id}`);
        continue;
      }
      target.position = loaded.position;
      target.bounds = loaded.bounds;
      target.wireId = loaded.wireId;
      // Mark the live element as "matched"; clear any stale ghost marker.
      target.unmodeled = false;
      if (target.type === 'bus' && 'busHeight' in loaded && loaded.busHeight !== undefined) {
        target.busHeight = loaded.busHeight;
      }
      // Line endpoint: renderer uses element.position (FROM) and (element as any).toPos (TO).
      const loadedAny = loaded as any;
      if (loadedAny.toPos) {
        (target as any).toPos = loadedAny.toPos;
        (target as any).controlPoints = loadedAny.controlPoints;
      }
      // Device connection point + mirrored side.
      if (loadedAny.connectedBusPosition) {
        (target as any).connectedBusPosition = loadedAny.connectedBusPosition;
        (target as any).mirrored = loadedAny.mirrored;
      }
      applied++;
    }
    if (ghosted.length > 0) {
      console.warn(
        `[NetworkDiagram] ${ghosted.length} element(s) in the loaded diagram are not in the current model (rendered as ghosts):`,
        ghosted.slice(0, 5)
      );
    }
    requestAnimationFrame(() => render());
    return { applied, ghosted };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementsRef]);

  // Notify parent about element-count changes so menu items (e.g. Save →
  // Diagram) can reflect the "diagram is plotted" state.
  useEffect(() => {
    if (onElementsChanged) onElementsChanged(elementsRef.current.size);
  }, [elementsUpdateTrigger, elementsRef, onElementsChanged, hasGhostDiagram]);

  // Drain a pending diagram load once the elements have been populated by
  // useDataProcessing (which only runs after `showElements` becomes true).
  useEffect(() => {
    if (!pendingLoadRef.current) return;
    if (elementsRef.current.size === 0) return;
    // Only drain once the factory's real elements have replaced any ghost
    // injection — detect that by looking for at least one non-ghost element
    // in the live map (real model elements never carry `unmodeled`).
    let hasRealElement = false;
    elementsRef.current.forEach(el => { if (!el.unmodeled) hasRealElement = true; });
    console.log('[NetworkDiagram] drain check', {
      hasPending: true,
      liveCount: elementsRef.current.size,
      hasRealElement,
      hasGhostDiagram,
    });
    if (!hasRealElement) return;
    const loaded = pendingLoadRef.current;
    pendingLoadRef.current = null;
    // suppressPaintsRef stays true through applyLoadedLayout's RAF render
    // (so that intermediate paint never lands), the competing useCanvasResize
    // setTimeouts (50ms + 100ms), and finally is cleared by the 200ms
    // timeout below — which also fires the ONE clean final paint.
    applyLoadedLayout(loaded);
    // Prefer the cyd's saved view (the user's actual pan/zoom at save time)
    // over a snapshot of applyCentering's fit-to-content. Falls back to the
    // captured transform from ghost-load if no saved view exists.
    const savedView = pendingDiagramViewRef.current;
    pendingDiagramViewRef.current = null;
    pendingPlottedBusesRef.current = null;
    const pinned = savedView ?? pinnedTransformRef.current;
    if (pinned) {
      // Apply the transform synchronously so the eventual paint uses it.
      setTransform(pinned);
      transformRef.current = pinned;
      if (transformPinTimeoutRef.current) clearTimeout(transformPinTimeoutRef.current);
      // After the competing async work has fired (useCanvasResize's 50ms +
      // 100ms applyCentering setTimeouts), re-apply the transform once more
      // (in case one of them overwrote it during the gated window), release
      // the paint gate, and fire ONE clean render with the final state.
      transformPinTimeoutRef.current = setTimeout(() => {
        setTransform(pinned);
        transformRef.current = pinned;
        suppressPaintsRef.current = false;
        renderFunctionRef.current?.();
        pinnedTransformRef.current = null;     // release; user owns viewport now
        transformPinTimeoutRef.current = null;
      }, 200);
    } else {
      // No saved view → no pin, but still gate paints briefly so the cascade
      // of recreate+centering settles before the first visible frame.
      if (transformPinTimeoutRef.current) clearTimeout(transformPinTimeoutRef.current);
      transformPinTimeoutRef.current = setTimeout(() => {
        suppressPaintsRef.current = false;
        renderFunctionRef.current?.();
        transformPinTimeoutRef.current = null;
      }, 200);
    }
    // Also keep layoutBoundsRef in sync so any later "reset view" matches.
    const bounds = computeBoundsFromElements(elementsRef.current);
    if (bounds) layoutBoundsRef.current = bounds;
    // Ghost mode is over — a real model is now driving the canvas.
    if (hasGhostDiagram) setHasGhostDiagram(false);
  }, [elementsUpdateTrigger, applyLoadedLayout, elementsRef, hasGhostDiagram, layoutBoundsRef, computeBoundsFromElements, setTransform, transformRef]);

  // Filter elements based on plotted buses and hidden elements.
  //
  // Computed once per relevant change (elements/plotted/showElements/hidden)
  // instead of on every render call. `getFilteredElements()` returns this cached
  // map — it used to re-iterate the full element set on each of its ~5 call
  // sites + effect re-evaluations, which was a noticeable cost on model load.
  const filteredElements = useMemo<Map<string, DiagramElement>>(() => {
    // If showElements is false, return empty map
    if (!showElements) {
      return new Map<string, DiagramElement>();
    }

    // If plottedBusNumbers is null, show all elements (except hidden)
    if (plottedBusNumbers === null) {
      const filtered = new Map<string, DiagramElement>();
      elementsRef.current.forEach((element, id) => {
        if (!hiddenElementIds.has(id)) {
          filtered.set(id, element);
        }
      });
      return filtered;
    }

    // Otherwise, filter to show plotted buses, their connected devices, and connecting lines/transformers
    const filtered = new Map<string, DiagramElement>();

    elementsRef.current.forEach((element, id) => {
      // Skip hidden elements
      if (hiddenElementIds.has(id)) {
        return;
      }
      // Ghost elements (from a loaded diagram with no model backing) bypass the
      // bus-number filter — they don't belong to the current model so the filter
      // can't classify them; we just always render them.
      if (element.unmodeled) {
        filtered.set(id, element);
        return;
      }

      if (element.type === 'bus') {
        const busData = element.data as any;
        if (plottedBusNumbers.has(busData.ibus)) {
          filtered.set(id, element);
        }
      }
      // Show loads connected to plotted buses
      else if (element.type === 'load') {
        const loadData = element.data as any;
        if (plottedBusNumbers.has(loadData.ibus)) {
          filtered.set(id, element);
        }
      }
      // Show generators connected to plotted buses
      else if (element.type === 'generator') {
        const genData = element.data as any;
        if (plottedBusNumbers.has(genData.ibus)) {
          filtered.set(id, element);
        }
      }
      // Show fixed shunts connected to plotted buses
      else if (element.type === 'fixed_shunt') {
        const shuntData = element.data as any;
        if (plottedBusNumbers.has(shuntData.ibus)) {
          filtered.set(id, element);
        }
      }
      // Show switched shunts connected to plotted buses
      else if (element.type === 'switched_shunt') {
        const shuntData = element.data as any;
        if (plottedBusNumbers.has(shuntData.ibus)) {
          filtered.set(id, element);
        }
      }
      // Show lines that connect two plotted buses (acline: ibus/jbus; twotermdc: ipi/ipr)
      else if (element.type === 'acline') {
        const lineData = element.data as { ibus?: number; jbus?: number; ipi?: number; ipr?: number };
        const fromBus = lineData.ipi ?? lineData.ibus;
        const toBus = lineData.ipr ?? lineData.jbus;
        if (fromBus != null && toBus != null &&
            plottedBusNumbers.has(fromBus) &&
            plottedBusNumbers.has(toBus)) {
          filtered.set(id, element);
        }
      }
      // Show transformers that connect plotted buses
      else if (element.type === 'transformer' || element.type === 'transformer3w') {
        const xfmData = element.data as { ibus?: number; jbus?: number; kbus?: number };
        const hasIbus = xfmData.ibus && plottedBusNumbers.has(xfmData.ibus);
        const hasJbus = xfmData.jbus && plottedBusNumbers.has(xfmData.jbus);
        const hasKbus = xfmData.kbus && xfmData.kbus > 0 && plottedBusNumbers.has(xfmData.kbus);

        // Show transformer if at least two of its buses are plotted
        if ((hasIbus && hasJbus) || (hasIbus && hasKbus) || (hasJbus && hasKbus)) {
          filtered.set(id, element);
        }
      }
    });

    return filtered;
    // elementsUpdateTrigger bumps whenever elementsRef.current is rebuilt, so the
    // memo recomputes against the latest elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plottedBusNumbers, showElements, hiddenElementIds, elementsUpdateTrigger]);

  /** Returns the memoized filtered element map (stable identity per change). */
  const getFilteredElements = useCallback(() => filteredElements, [filteredElements]);

  // Main render function - using ref to avoid stale closure
  const render = useCallback(() => {
    // While a Path C cyd-load is settling, suppress paints. The drain (which
    // fires only after useDataProcessing recreates the element subset)
    // applies the cyd positions, restores the saved transform, clears this
    // flag, and triggers ONE final paint. Intermediate frames (default
    // transform, factory positions, fit-to-content centerings) stay invisible
    // so the user sees a single clean transition from the previous view to
    // the final cyd view.
    if (suppressPaintsRef.current) {
      return;
    }
    const currentTransform = transformRef.current;

    if (!rendererRef.current) {
      return;
    }

    // Use filtered elements if bus is selected, otherwise use all elements
    const elementsToRender = getFilteredElements();

    // Build bus voltages map from elements
    const busVoltages = new Map<number, number>();
    elementsToRender.forEach((element) => {
      if (element.type === 'bus') {
        const busData = element.data as any;
        if (busData.baskv !== undefined) {
          busVoltages.set(busData.ibus, busData.baskv);
        }
      }
    });

    const renderController = new RenderController({
      renderer: rendererRef.current,
      elements: elementsToRender,
      edgeBundles: edgeBundlesRef.current,
      selectedElements,
      selectionBounds,
      isResizing: isResizingRef.current,
      mouseWorldPos,
      busVoltages,
      hoveredElementId: hoveredElementId ?? null,
      powerFlowResults,
      showFlowValues,
    });

    renderController.render(currentTransform, false);
  }, [selectedElements, selectionBounds, mouseWorldPos, hoveredElementId, getFilteredElements, powerFlowResults, showFlowValues]);

  // Update the render function ref whenever render changes
  useEffect(() => {
    renderFunctionRef.current = render;
  }, [render]);

  // Keep visibleElementsRef in sync and trigger render when selectedElements, selectionBounds, or transform changes
  useEffect(() => {
    visibleElementsRef.current = getFilteredElements();
    requestAnimationFrame(() => render());
  }, [selectedElements, selectionBounds, transform, render, getFilteredElements, elementsUpdateTrigger]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    items: MenuItem[];
  }>({
    isOpen: false,
    position: null,
    items: [],
  });

  // Show delete element confirmation (reference: NetworkDataTable showDeleteConfirmation)
  const showDeleteElementConfirmation = useCallback((element: DiagramElement) => {
    const sdkType = getSdkElementType(element.type);
    const identifier = buildIdentifierFromElement(element);
    const identifierFields = ELEMENT_IDENTIFIERS[sdkType] || [];
    const data = element.data as Record<string, any>;
    const elementInfo = identifierFields
      .map(field => `${field}=${data[field] ?? ''}`)
      .join(', ');
    setDeleteElementConfirmation({
      isOpen: true,
      element,
      elementType: sdkType,
      identifier,
      elementInfo,
    });
  }, [getSdkElementType, buildIdentifierFromElement]);

  // Handle delete element (called after confirmation, same as NetworkDataTable handleDeleteElement)
  const handleDeleteElement = useCallback(async () => {
    const { elementType, identifier } = deleteElementConfirmation;
    if (!identifier || !elementType) return;

    setDeleteElementConfirmation({
      isOpen: false,
      element: null,
      elementType: '',
      identifier: null,
      elementInfo: '',
    });

    try {
      await PowerFlowApp.deleteElement(elementType as 'bus' | 'load' | 'generator' | 'acline' | 'transformer', identifier);
      // Network refresh is done by usePowerFlowSDK (EDIT_COMPLETE event)
    } catch (error: any) {
      console.error('Failed to delete element:', error);
      showError(t('common:error'), error?.message ?? t('contextMenu.deleteError', { error: 'Unknown error' }));
    }
  }, [deleteElementConfirmation, showError, t]);

  // Zoom to a specific bus position: center the bus in the viewport at a reasonable zoom level
  const zoomToBusPosition = useCallback((busX: number, busY: number) => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const targetScale = window.devicePixelRatio > 1 ? 1.5 : 2.0;
    // Use container dimensions (CSS pixels), not canvas buffer dimensions (retina-scaled)
    const canvasWidth = container.clientWidth || canvas.clientWidth;
    const canvasHeight = container.clientHeight || canvas.clientHeight;
    const targetOffsetX = canvasWidth / 2 - busX * targetScale;
    const targetOffsetY = canvasHeight / 2 - busY * targetScale;
    animateZoom(targetScale, targetOffsetX, targetOffsetY);
  }, [animateZoom]);

  // Context menu handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeContextMenu = (e: MouseEvent) => {
      if (!interactive) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const worldPos = {
        x: (x - transform.offsetX) / transform.scale,
        y: (y - transform.offsetY) / transform.scale,
      };

      // Use only visible elements so hidden (removed) elements cannot be right-clicked or modified
      const visibleElements = getFilteredElements();
      const clickedElement = findElementAtPosition(visibleElements, worldPos);

      const menuBuilder = new ContextMenuBuilder({
        elements: visibleElements,
        t,
        hasData: !!data, // Pass data availability explicitly
        onElementClick,
        onSelectionChange,
        onZoomIn: () => {
          const panZoomHandler = new PanZoomHandler(transformRef, canvasRef, animateZoom);
          panZoomHandler.zoomIn();
        },
        onZoomOut: () => {
          const panZoomHandler = new PanZoomHandler(transformRef, canvasRef, animateZoom);
          panZoomHandler.zoomOut();
        },
        onResetView: applyCentering,
        onOpenDiagram: onContextMenuOpenDiagram,
        onSaveDiagram: onContextMenuSaveDiagram,
        canSaveDiagram: elementsRef.current.size > 0,
        onExportPNG: () => {
          const canvas = canvasRef.current;
          if (canvas) {
            const link = document.createElement('a');
            link.download = 'network-diagram.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
          }
        },
        onPlotAllBuses: () => {
          setShowElements(true);
          setPlottedBusNumbers(null); // null means show all buses
        },
        onPlotSelectedBus: () => {
          setIsBusSelectorOpen(true);
        },
        onLocateBus: () => {
          setIsLocateBusModalOpen(true);
        },
        onPlotBus: (busNumber: number) => {
          setShowElements(true);
          // When plottedBusNumbers is null, it means all buses are currently shown.
          // We need to preserve all buses when plotting a new one, not start from empty.
          const prevSet = plottedBusNumbers ?? new Set((data?.buses || []).map(b => b.ibus));
          const newSet = new Set(prevSet);
          const addedOrder = addBusWithConnections(busNumber, prevSet, newSet);
          addedOrder.forEach((busNum, index) => {
            const referenceSet = new Set(prevSet);
            for (let i = 0; i < index; i++) referenceSet.add(addedOrder[i]);
            repositionBusToNearbyEmptySpace(busNum, referenceSet.size > 0 ? referenceSet : null);
          });
          setPlottedBusNumbers(newSet);
          // Always unhide this bus and its connections when plotting (even if bus was already in plotted set but hidden)
          const busesToUnhide = new Set(addedOrder);
          busesToUnhide.add(busNumber);
          setHiddenElementIds(prev => {
            const next = new Set(prev);
            busesToUnhide.forEach(busNum => {
              getElementIdsForBusAndConnections(busNum).forEach(id => next.delete(id));
            });
            return next;
          });
        },
        onGrowBusConnections: (busNumber: number) => {
          setGrowBusSourceBusNumber(busNumber);
          setIsGrowBusModalOpen(true);
        },
        onFindShortestPath: (busNumber: number | null) => {
          setShortestPathSourceBus(busNumber);
          setIsShortestPathModalOpen(true);
        },
        onFindNeighbourElements: (busNumber: number | null) => {
          setNeighbourElementsSourceBus(busNumber);
          setIsNeighbourElementsModalOpen(true);
        },
        onHideElement: (elementId: string) => {
          setHiddenElementIds(prev => {
            const newHiddenSet = new Set(prev);

            // Find the element to hide
            const element = elementsRef.current.get(elementId);
            if (!element) {
              newHiddenSet.add(elementId);
              return newHiddenSet;
            }

            // Always add the element itself
            newHiddenSet.add(elementId);

            // If it's a bus, also hide all connected elements
            if (element.type === 'bus') {
              const busNumber = (element.data as any).ibus;

              // Hide all elements connected to this bus
              elementsRef.current.forEach((otherElement, otherId) => {
                if (otherId === elementId) return; // Skip the bus itself (already added)

                switch (otherElement.type) {
                  case 'load':
                  case 'generator':
                  case 'fixed_shunt':
                  case 'switched_shunt': {
                    // Loads, generators, and shunts are connected if they share the same ibus
                    const otherData = otherElement.data as any;
                    if (otherData.ibus === busNumber) {
                      newHiddenSet.add(otherId);
                    }
                    break;
                  }
                  case 'acline': {
                    // AC lines (ibus/jbus) or twotermdc (ipi/ipr) are connected if from or to matches
                    const lineData = otherElement.data as any;
                    const from = lineData.ipi ?? lineData.ibus;
                    const to = lineData.ipr ?? lineData.jbus;
                    if (from === busNumber || to === busNumber) {
                      newHiddenSet.add(otherId);
                    }
                    break;
                  }
                  case 'transformer':
                  case 'transformer3w': {
                    // Transformers are connected if ibus, jbus, or kbus matches
                    const xfmData = otherElement.data as any;
                    if (xfmData.ibus === busNumber ||
                        xfmData.jbus === busNumber ||
                        (xfmData.kbus !== undefined && xfmData.kbus > 0 && xfmData.kbus === busNumber)) {
                      newHiddenSet.add(otherId);
                    }
                    break;
                  }
                }
              });
            }

            return newHiddenSet;
          });
        },
        onDeleteElement: showDeleteElementConfirmation,
        onModifyElement: (element: DiagramElement) => {
          setSelectedElementData(element.data);
          // Normalize diagram types to parameter/API keys
          const typeMap: Record<string, string> = { fixed_shunt: 'fixshunt', switched_shunt: 'swshunt' };
          const paramType = typeMap[element.type] || element.type;
          setSelectedElementType(paramType);
          setSelectedElementId(element.id);
          setIsAddMode(false);
          const categories = getParameterCategories(paramType, element.data);
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddGenerator: (busNumber: number) => {
          // Open parameter editor in "add" mode for a new generator
          setSelectedElementType('generator');
          setSelectedElementId('');
          setIsAddMode(true);
          // Pre-set the bus number (ibus field will be disabled)
          const initialData = { ibus: busNumber };
          setSelectedElementData(initialData);
          // Get categories with ibus pre-set and disabled
          const categories = getParameterCategories('generator', initialData, {
            mode: 'add',
            preSetValues: { ibus: busNumber }
          });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddLoad: (busNumber: number) => {
          // Open parameter editor in "add" mode for a new load
          setSelectedElementType('load');
          setSelectedElementId('');
          setIsAddMode(true);
          // Pre-set the bus number (ibus field will be disabled)
          const initialData = { ibus: busNumber };
          setSelectedElementData(initialData);
          // Get categories with ibus pre-set and disabled
          const categories = getParameterCategories('load', initialData, {
            mode: 'add',
            preSetValues: { ibus: busNumber }
          });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddAcline: (busNumber: number) => {
          // Open parameter editor in "add" mode for a new AC line
          setSelectedElementType('acline');
          setSelectedElementId('');
          setIsAddMode(true);
          // Pre-set the from bus number (ibus field will be disabled)
          const initialData = { ibus: busNumber, stat: 1 };
          setSelectedElementData(initialData);
          // Get categories with ibus pre-set and disabled
          const categories = getParameterCategories('acline', initialData, {
            mode: 'add',
            preSetValues: { ibus: busNumber }
          });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddFixedShunt: (busNumber: number) => {
          setSelectedElementType('fixshunt');
          setSelectedElementId('');
          setIsAddMode(true);
          const initialData = { ibus: busNumber, stat: 1 };
          setSelectedElementData(initialData);
          const categories = getParameterCategories('fixshunt', initialData, {
            mode: 'add',
            preSetValues: { ibus: busNumber }
          });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddSwitchedShunt: (busNumber: number) => {
          setSelectedElementType('swshunt');
          setSelectedElementId('');
          setIsAddMode(true);
          const initialData = { ibus: busNumber, stat: 1 };
          setSelectedElementData(initialData);
          const categories = getParameterCategories('swshunt', initialData, {
            mode: 'add',
            preSetValues: { ibus: busNumber }
          });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        onAddElement: (elementType: string) => {
          // Open parameter editor in "add" mode for the specified element type
          setSelectedElementType(elementType);
          setSelectedElementId('');
          setIsAddMode(true);
          // Set default values for elements with status field
          const elementsWithStatus = ['generator', 'load', 'acline', 'transformer', 'fixshunt', 'swshunt'];
          const defaultValues: Record<string, any> = elementsWithStatus.includes(elementType)
            ? { stat: 1 }
            : {};
          // Bus specific defaults
          if (elementType === 'bus') {
            defaultValues.ide = 1;
          }
          setSelectedElementData(defaultValues);
          // Get categories in add mode
          const categories = getParameterCategories(elementType, defaultValues, { mode: 'add' });
          setParamCategories(categories);
          setIsParamEditorOpen(true);
        },
        canvasRef,
      });

      const items = menuBuilder.buildMenu(clickedElement || null);

      if (items.length === 0) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        items,
      });
    };

    canvas.addEventListener('contextmenu', handleNativeContextMenu);

    return () => {
      canvas.removeEventListener('contextmenu', handleNativeContextMenu);
    };
  }, [interactive, t, onElementClick, onSelectionChange, transform, transformRef, canvasRef, animateZoom, applyCentering, plottedBusNumbers, repositionBusToNearbyEmptySpace, addBusWithConnections, getElementIdsForBusAndConnections, getFilteredElements, showDeleteElementConfirmation]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      position: null,
      items: [],
    });
  }, []);

  // Stable callbacks for canvas refs
  const handleCanvasRef = useCallback(() => {
    // No-op, but stable reference
  }, []);

  const handleRendererRef = useCallback((renderer: CanvasRenderer | null) => {
    rendererRef.current = renderer;
    if (renderer) {
      setRendererReady((n) => n + 1);
    }
  }, []);

  // Reset view - re-center the diagram the same way as initial load
  const resetView = useCallback(() => {
    applyCentering();
  }, [applyCentering]);

  // Export diagram
  const exportAsPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'network-diagram.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // Plot specific buses - callable from external components (e.g., NetworkDataTable)
  // Accumulates buses: adds new buses to existing plotted buses (persists across calls)
  // Only resets when session changes
  const plotBuses = useCallback((busNumbers: number[]) => {
    if (busNumbers.length === 0) return;

    // Enable element visibility
    setShowElements(true);

    // Accumulate buses: merge new buses with existing ones
    setPlottedBusNumbers((prevBuses) => {
      const mergedSet = prevBuses ? new Set(prevBuses) : new Set<number>();
      busNumbers.forEach(bus => mergedSet.add(bus));
      // Update ref immediately (for sync access in async handlers)
      plottedBusNumbersRef.current = mergedSet;
      return mergedSet;
    });

    // Clear any hidden elements so they become visible
    setHiddenElementIds(new Set());

    console.log('Plotting buses (accumulating):', busNumbers);
  }, []);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    updateData: (newData: NetworkDataset) => {
      // Data is handled through props
    },
    updatePowerFlowResults: (results: any) => {
      requestAnimationFrame(() => render());
    },
    highlightElements: (elementIds: string[]) => {
      // Handle highlighting
    },
    selectElements: (elementIds: string[]) => {
      selectMultiple(elementIds);
    },
    resetView,
    exportAsPNG,
    fitToView: () => {
      // TODO: Implement fit to view
    },
    setLayerVisibility: (layerId: string, visible: boolean) => {
      // TODO: Implement layer visibility
    },
    plotBuses,
    saveDiagram: async (options) => {
      // Save what the user CAN SEE, not the full in-memory map. The
      // ElementFactory creates every bus regardless of plottedBusNumbers (only
      // line/device creation respects the filter), so elementsRef.current
      // includes invisible buses — using it directly would save the whole
      // model even when the user has plotted a subset. getFilteredElements()
      // is what the renderer draws, which matches "what the user sees" — and
      // is what we want round-trip-loadable.
      const elementsArray = Array.from(getFilteredElements().values());
      // Capture the live viewport (pan + zoom) so the saved file restores the
      // user's current view when loaded. Caller-supplied view wins.
      const viewToSave = options?.view ?? (transformRef.current ? { ...transformRef.current } : undefined);
      const result = await serializeDiagramDoc(elementsArray, { ...options, view: viewToSave });
      if (result.warnings.length > 0) {
        console.warn('[NetworkDiagram] saveDiagram warnings:', result.warnings);
      }
      return result;
    },
    beginDiagramLoad: () => {
      // Gate paints from this instant so the view-switch / resize-observer
      // cascade that runs BEFORE loadDiagram resolves cannot land a
      // fit-to-content frame on screen. loadDiagram (or its safety timeout)
      // owns clearing this flag.
      suppressPaintsRef.current = true;
      if (beginLoadSafetyTimeoutRef.current) clearTimeout(beginLoadSafetyTimeoutRef.current);
      beginLoadSafetyTimeoutRef.current = setTimeout(() => {
        suppressPaintsRef.current = false;
        renderFunctionRef.current?.();
        beginLoadSafetyTimeoutRef.current = null;
      }, 5000);
    },
    loadDiagram: async (input) => {
      const result = await deserializeDiagramDoc(input);
      if (!result.ok) {
        // Release the beginDiagramLoad gate so the canvas paints whatever's
        // current — leaving it blank would strand the user on an empty view.
        if (beginLoadSafetyTimeoutRef.current) {
          clearTimeout(beginLoadSafetyTimeoutRef.current);
          beginLoadSafetyTimeoutRef.current = null;
        }
        suppressPaintsRef.current = false;
        renderFunctionRef.current?.();
        console.error('[NetworkDiagram] loadDiagram failed:', result.errors);
        return result;
      }
      // Hand the gate over to whichever load path takes ownership below — the
      // safety timeout is no longer needed.
      if (beginLoadSafetyTimeoutRef.current) {
        clearTimeout(beginLoadSafetyTimeoutRef.current);
        beginLoadSafetyTimeoutRef.current = null;
      }
      // Path A: no model loaded at all → render the saved diagram as a ghost
      // layer (every element flagged `unmodeled`). All elements paint pink.
      // We also stash the loaded elements in `pendingLoadRef` so that when a
      // model loads later, the drain effect below applies these saved
      // positions onto the freshly-created real elements (instead of letting
      // the factory's auto-layout win).
      if (!data) {
        // Ghost path WANTS to paint immediately (the ghost render is the
        // user's only visible feedback when no model is loaded). Release the
        // gate that beginDiagramLoad set up.
        suppressPaintsRef.current = false;
        if (beginLoadSafetyTimeoutRef.current) {
          clearTimeout(beginLoadSafetyTimeoutRef.current);
          beginLoadSafetyTimeoutRef.current = null;
        }
        pendingLoadRef.current = result.elements.map(e => ({ ...e }));
        pendingDiagramViewRef.current = result.doc?.view ? { ...result.doc.view } : null;
        pendingPlottedBusesRef.current = collectBusNumbersFromLoaded(result.elements);
        const ghost = new Map<string, DiagramElement>();
        for (const el of result.elements) {
          el.unmodeled = true;
          ghost.set(el.id, el);
        }
        elementsRef.current = ghost;

        // Seed busConnectionInfosRef so drag updates can rewire endpoints.
        // Without this, dragging a bus leaves incident lines/devices stranded
        // because the drag handler has no connection info to update.
        const busInfos = busConnectionInfosRef.current;
        busInfos.clear();
        ghost.forEach(el => {
          if (el.type === 'bus') {
            busInfos.set(el.id, createBusConnectionInfo(
              el.id,
              el.position,
              el.busHeight ?? 90,
              6,
            ));
          }
        });
        // Register each line/device as a connection on its bus(es).
        ghost.forEach(el => {
          const anyEl = el as any;
          if (el.type === 'acline' || el.type === 'transformer' || el.type === 'transformer3w' ||
              el.type === 'two_term_dc' || el.type === 'vsc_dc') {
            const fromBusNum = anyEl.fromBus ?? anyEl.data?.ibus ?? anyEl.data?.ipi ?? anyEl.data?.ibus1;
            const toBusNum   = anyEl.toBus   ?? anyEl.data?.jbus ?? anyEl.data?.ipr ?? anyEl.data?.ibus2;
            const fromBusInfo = busInfos.get(`bus_${fromBusNum}`);
            const toBusInfo   = busInfos.get(`bus_${toBusNum}`);
            const fromPt = anyEl.fromPoint ?? el.position;
            const toPt   = anyEl.toPoint   ?? anyEl.toPos;
            if (fromBusInfo && toPt) addConnectionToBus(fromBusInfo, el.id, toPt);
            if (toBusInfo   && fromPt) addConnectionToBus(toBusInfo,   el.id, fromPt);
          } else if (el.type === 'load' || el.type === 'generator' ||
                     el.type === 'fixed_shunt' || el.type === 'switched_shunt') {
            const busNum = anyEl.bus ?? anyEl.data?.ibus;
            const busInfo = busInfos.get(`bus_${busNum}`);
            if (busInfo && el.position) addConnectionToBus(busInfo, el.id, el.position);
          }
        });

        // Seed layout bounds from the loaded positions (used as a fallback if
        // the saved view is missing, and so a future Reset View has the right
        // fit-to-content target).
        const bounds = computeBoundsFromElements(ghost);
        if (bounds) layoutBoundsRef.current = bounds;

        // Restore the EXACT saved view transform (scale + offset) so the
        // diagram appears at the same position / zoom as when it was saved.
        // If the saved view is missing, fall back to fit-to-content centering.
        const savedView = result.doc?.view;
        const validSavedView = savedView
          && Number.isFinite(savedView.scale)
          && Number.isFinite(savedView.offsetX)
          && Number.isFinite(savedView.offsetY)
          ? savedView
          : null;
        const restoreView = () => {
          if (validSavedView) {
            setTransform(validSavedView);
            transformRef.current = validSavedView;
            renderFunctionRef.current?.();
          } else if (bounds) {
            applyCentering();
          }
        };

        setHasGhostDiagram(true);
        setShowElements(true);
        // Narrow the plot to the cyd's bus subset. Has no immediate effect in
        // ghost mode (ghost elements bypass the filter), but when the model
        // later arrives the factory will only create THIS subset — not the
        // whole model — so we don't see unsaved buses appear.
        setPlottedBusNumbers(pendingPlottedBusesRef.current && pendingPlottedBusesRef.current.size > 0
          ? pendingPlottedBusesRef.current
          : null);
        // Defer the render + centering until after the canvas has mounted.
        setTimeout(() => {
          if (rendererRef.current) {
            restoreView();
            render();
            // Capture the transform AFTER restoreView has set it.
            if (transformRef.current) {
              pinnedTransformRef.current = { ...transformRef.current };
            }
          }
        }, 0);

        // Brute-force pin the saved transform for 1.5s to defeat async
        // centerings (useCanvasResize's initial-resize observer fires
        // applyCentering when the canvas first becomes visible — that would
        // otherwise overwrite our restored view with a fit-to-content one).
        if (validSavedView) {
          if (transformPinIntervalRef.current) clearInterval(transformPinIntervalRef.current);
          if (transformPinTimeoutRef.current) clearTimeout(transformPinTimeoutRef.current);
          const pinView = () => {
            setTransform(validSavedView);
            transformRef.current = validSavedView;
            renderFunctionRef.current?.();
          };
          transformPinIntervalRef.current = setInterval(pinView, 50);
          transformPinTimeoutRef.current = setTimeout(() => {
            if (transformPinIntervalRef.current) {
              clearInterval(transformPinIntervalRef.current);
              transformPinIntervalRef.current = null;
            }
            transformPinTimeoutRef.current = null;
          }, 1500);
        }
        return result;
      }
      // Bus set referenced by the loaded cyd — used to narrow plottedBusNumbers
      // so the canvas shows ONLY what the file contained (not the whole model).
      const loadedBusSet = collectBusNumbersFromLoaded(result.elements);
      // Path B: model loaded but nothing plotted yet → auto-plot the cyd's
      // bus subset (NOT the whole model) and queue the layout apply.
      if (elementsRef.current.size === 0) {
        pendingLoadRef.current = result.elements;
        pendingDiagramViewRef.current = result.doc?.view ? { ...result.doc.view } : null;
        pendingPlottedBusesRef.current = loadedBusSet;
        setShowElements(true);
        setPlottedBusNumbers(loadedBusSet.size > 0 ? loadedBusSet : null);
        return result;
      }
      // Path C: model loaded and plotted → route through the same pending-load
      // + drain mechanism as Path B so the user sees ONE clean transition
      // instead of flashes. suppressPaintsRef gates render() so intermediate
      // frames during the recreate/centering cascade never paint; the drain
      // effect (which fires after useDataProcessing finishes recreating the
      // element subset) applies the saved positions + saved transform, clears
      // the gate, and triggers the single final paint.
      pendingLoadRef.current = result.elements;
      pendingDiagramViewRef.current = result.doc?.view ? { ...result.doc.view } : null;
      pendingPlottedBusesRef.current = loadedBusSet;
      suppressPaintsRef.current = true;
      if (loadedBusSet.size > 0) setPlottedBusNumbers(loadedBusSet);
      return result;
    },
  }));

  return (
    <div className={`network-diagram ${className}`} style={style} data-theme={theme}>
      {(!data && !hasGhostDiagram) ? (
        <div
          className="network-diagram-empty-state"
          onClick={() => triggerLoadFile?.()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerLoadFile?.();
            }
          }}
        >
          <div className="empty-state">
            <svg className="empty-icon" width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path d="M8 16C8 11.5817 11.5817 8 16 8H48C52.4183 8 56 11.5817 56 16V48C56 52.4183 52.4183 56 48 56H16C11.5817 56 8 52.4183 8 48V16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M20 28H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M20 36H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M20 44H32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="40" cy="42" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M44 46L48 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <small>{t('messages.loadCaseFile')}</small>
          </div>
        </div>
      ) : (
        <>
          {/* Canvas container */}
          <div className="network-diagram-canvas-container">
            <NetworkDiagramCanvas
              ref={canvasRef}
              className="network-diagram-canvas"
              interactive={interactive}
              isPanning={isPanning}
              onCanvasRef={handleCanvasRef}
              onRendererRef={handleRendererRef}
              renderStyle={renderStyle}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onWheelWithNonPassive={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {/* Large-network async compute: progress + error overlays */}
            {computeStatus === 'computing' && (
              <div className="network-diagram-compute-overlay" role="status" aria-live="polite">
                <div className="network-diagram-compute-card">
                  <div className="network-diagram-compute-title">
                    {t('messages.buildingDiagram')}
                  </div>
                  <div className="network-diagram-compute-progress">
                    <div
                      className="network-diagram-compute-bar"
                      style={{ width: `${Math.round(computeProgress * 100)}%` }}
                    />
                  </div>
                  <div className="network-diagram-compute-percent">
                    {Math.round(computeProgress * 100)}%
                  </div>
                  <button
                    type="button"
                    className="network-diagram-compute-cancel"
                    onClick={cancelCompute}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
            {computeStatus === 'error' && (
              <div className="network-diagram-compute-overlay">
                <div className="network-diagram-compute-card network-diagram-compute-card-error">
                  <div className="network-diagram-compute-title">
                    {t('messages.diagramBuildFailed')}
                  </div>
                  {computeError && (
                    <div className="network-diagram-compute-detail">{computeError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.position && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={closeContextMenu}
        />
      )}

      {/* Delete Element Confirmation (same as NetworkDataTable) */}
      <AlertModal
        isOpen={deleteElementConfirmation.isOpen}
        onClose={() => setDeleteElementConfirmation({
          isOpen: false,
          element: null,
          elementType: '',
          identifier: null,
          elementInfo: '',
        })}
        title={t('contextMenu.delete')}
        message={t('contextMenu.deleteConfirmation', {
          element: deleteElementConfirmation.elementType,
          info: deleteElementConfirmation.elementInfo,
        })}
        type="warning"
        width={450}
        confirmMode={true}
        confirmText={t('contextMenu.delete')}
        cancelText={t('contextMenu.cancel')}
        onConfirm={handleDeleteElement}
      />

      {/* Bus Selector Modal (Plot Selected Bus) */}
      {data && (
        <BusSelectorModal
          isOpen={isBusSelectorOpen}
          onClose={() => setIsBusSelectorOpen(false)}
          buses={data.buses || []}
          allowGrow={true}
          title={t('common:contextMenu.plotSelectedBus', 'Plot Selected Bus')}
          onSelect={(busNumber, growResult) => {
            // When plottedBusNumbers is null, it means all buses are currently shown.
            const prevSet = plottedBusNumbers ?? new Set<number>();
            let newSet = new Set(prevSet);
            const addedOrder = addBusWithConnections(busNumber, prevSet, newSet);

            // If user chose "grow" in the modal, resolve bus set and path (validate toBus first)
            let growBusSet: Set<number> | null = null;
            let orderedGrowBuses: number[] = [];
            if (growResult) {
              if (growResult.mode === 'nAway') {
                growBusSet = getBusesWithinNAway(busNumber, growResult.n, findConnectedBuses);
                orderedGrowBuses = Array.from(growBusSet).sort((a, b) => a - b);
              } else {
                const path = findPathBetweenBuses(busNumber, growResult.targetBusNumber, findConnectedBuses);
                if (path === null) {
                  showError(
                    t('common:networkDiagram.growBusConnections.noPathTitle', 'No path'),
                    t('common:networkDiagram.growBusConnections.noPathMessage', 'No available path between the selected buses.')
                  );
                  return;
                }
                growBusSet = new Set(path);
                orderedGrowBuses = [...path];
                data?.transformers?.forEach((xfm) => {
                  if (!xfm.kbus || xfm.kbus <= 0) return;
                  if (xfm.stat === 0) return;
                  const buses: number[] = [xfm.ibus!, xfm.jbus!, xfm.kbus];
                  const onPathCount = buses.filter((b) => growBusSet!.has(b)).length;
                  if (onPathCount >= 2) {
                    buses.forEach((b) => {
                      if (!growBusSet!.has(b)) {
                        growBusSet!.add(b);
                        orderedGrowBuses.push(b);
                      }
                    });
                  }
                });
              }
              growBusSet.forEach((b) => newSet.add(b));
            }

            const setBeforeGrow = new Set(prevSet);
            addedOrder.forEach((b) => setBeforeGrow.add(b));
            const addedFromGrow = growBusSet ? orderedGrowBuses.filter((b) => !setBeforeGrow.has(b)) : [];

            // Reposition: first added buses from plot, then from grow
            addedOrder.forEach((busNum, index) => {
              const referenceSet = new Set(prevSet);
              for (let i = 0; i < index; i++) referenceSet.add(addedOrder[i]);
              repositionBusToNearbyEmptySpace(busNum, referenceSet.size > 0 ? referenceSet : null);
            });
            let referenceSet = new Set(setBeforeGrow);
            addedFromGrow.forEach((busNum) => {
              repositionBusToNearbyEmptySpace(busNum, referenceSet.size > 0 ? referenceSet : null);
              referenceSet.add(busNum);
            });

            const busesToUnhide = new Set(addedOrder);
            busesToUnhide.add(busNumber);
            addedFromGrow.forEach((b) => busesToUnhide.add(b));

            React.startTransition(() => {
              setShowElements(true);
              setPlottedBusNumbers(newSet);
              setHiddenElementIds(prev => {
                const next = new Set(prev);
                busesToUnhide.forEach(busNum => {
                  getElementIdsForBusAndConnections(busNum).forEach(id => next.delete(id));
                });
                return next;
              });
            });
          }}
        />
      )}

      {/* Locate Bus Modal */}
      {data && showElements && (
        <LocateBusModal
          isOpen={isLocateBusModalOpen}
          onClose={() => setIsLocateBusModalOpen(false)}
          buses={(data.buses || []).filter(bus => {
            if (plottedBusNumbers !== null && !plottedBusNumbers.has(bus.ibus)) return false;
            if (hiddenElementIds.has(`bus_${bus.ibus}`)) return false;
            return true;
          })}
          onSelect={(busNumber: number) => {
            // Find the bus element in the elements map and zoom to it
            let busElement: DiagramElement | undefined;
            elementsRef.current.forEach((element) => {
              if (element.type === 'bus' && (element.data as any).ibus === busNumber) {
                busElement = element;
              }
            });
            if (busElement) {
              zoomToBusPosition(busElement.position.x, busElement.position.y);
            }
            setIsLocateBusModalOpen(false);
          }}
        />
      )}

      {/* Grow Bus Connections Modal */}
      {data && growBusSourceBusNumber !== null && (
        <GrowBusConnectionsModal
          isOpen={isGrowBusModalOpen}
          onClose={() => {
            setIsGrowBusModalOpen(false);
            setGrowBusSourceBusNumber(null);
          }}
          sourceBusNumber={growBusSourceBusNumber}
          buses={data.buses || []}
          onConfirm={(result) => {
            const sourceBus = growBusSourceBusNumber;
            let busSet: Set<number>;
            let orderedBuses: number[];

            if (result.mode === 'nAway') {
              busSet = getBusesWithinNAway(sourceBus, result.n, findConnectedBuses);
              orderedBuses = Array.from(busSet).sort((a, b) => a - b);
            } else {
              const path = findPathBetweenBuses(sourceBus, result.targetBusNumber, findConnectedBuses);
              if (path === null) {
                showError(
                  t('common:networkDiagram.growBusConnections.noPathTitle', 'No path'),
                  t('common:networkDiagram.growBusConnections.noPathMessage', 'No available path between the selected buses.')
                );
                return;
              }

              // Start with the buses along the shortest path
              busSet = new Set(path);
              orderedBuses = [...path];

              // If the path goes through a three-winding transformer, also include
              // all buses connected by that transformer (ibus, jbus, kbus).
              // Use raw data instead of created elements to handle unplotted buses.
              data?.transformers?.forEach((xfm) => {
                // Only consider 3-winding transformers (kbus > 0)
                if (!xfm.kbus || xfm.kbus <= 0) return;
                if (xfm.stat === 0) return; // Skip out of service

                const buses: number[] = [xfm.ibus, xfm.jbus, xfm.kbus];

                // If at least two of the transformer buses lie on the path,
                // treat this transformer as part of the path and include all
                // of its buses in the plotted set.
                const onPathCount = buses.filter((b) => busSet.has(b)).length;
                if (onPathCount >= 2) {
                  buses.forEach((b) => {
                    if (!busSet.has(b)) {
                      busSet.add(b);
                      orderedBuses.push(b);
                    }
                  });
                }
              });
            }

            setShowElements(true);
            // When plottedBusNumbers is null, it means all buses are currently shown.
            // We need to preserve all buses when growing connections, not start from empty.
            const oldSet = plottedBusNumbers ?? new Set((data?.buses || []).map(b => b.ibus));

            // Rule: never drop already-plotted buses. Always grow on top of the
            // existing plotted set rather than replacing it.
            const combinedSet = new Set<number>(oldSet);
            busSet.forEach((b) => combinedSet.add(b));
            setPlottedBusNumbers(combinedSet);
            setHiddenElementIds(prev => {
              const next = new Set(prev);
              busSet.forEach(busNum => {
                getElementIdsForBusAndConnections(busNum).forEach(id => next.delete(id));
              });
              return next;
            });

            const addedNew = orderedBuses.filter(b => !oldSet.has(b));
            let referenceSet = new Set(oldSet);
            addedNew.forEach((busNum) => {
              repositionBusToNearbyEmptySpace(busNum, referenceSet.size > 0 ? referenceSet : null);
              referenceSet.add(busNum);
            });
          }}
        />
      )}

      {/* Find Shortest Path Modal */}
      {/* Find Shortest Path Modal */}
      {data && isShortestPathModalOpen && (
        <ShortestPathModal
          isOpen={isShortestPathModalOpen}
          onClose={() => {
            setIsShortestPathModalOpen(false);
            setShortestPathSourceBus(null);
          }}
          sourceBusNumber={shortestPathSourceBus}
          buses={data.buses || []}
          data={data}
        />
      )}

      {/* Find Neighbour Elements Modal */}
      {data && isNeighbourElementsModalOpen && (
        <NeighbourElementsModal
          isOpen={isNeighbourElementsModalOpen}
          onClose={() => {
            setIsNeighbourElementsModalOpen(false);
            setNeighbourElementsSourceBus(null);
          }}
          sourceBusNumber={neighbourElementsSourceBus}
          data={data}
        />
      )}

      {/* Parameter Editor Modal */}
      <ParameterEditorModal
        isOpen={isParamEditorOpen}
        onClose={() => setIsParamEditorOpen(false)}
        title={isAddMode
          ? t('parameters:addModalTitle', { element: selectedElementType ? t(`parameters:elementTypes.${selectedElementType}`) : 'Element' })
          : t('parameters:modalTitle', { element: selectedElementType ? t(`parameters:elementTypes.${selectedElementType}`) : 'Element' })
        }
        categories={paramCategories}
        values={selectedElementData || {}}
        onApply={async (updatedValues) => {
          if (!selectedElementData || !selectedElementType) return;

          try {
            if (isAddMode) {
              // Add mode: Call addElement API
              // Build data with all fields (including pre-set values like ibus)
              const addData: Record<string, any> = { ...updatedValues };
              await PowerFlowApp.addElement(selectedElementType as keyof typeof ELEMENT_TYPES, addData);
              setIsParamEditorOpen(false);

              // After adding an element, plot connected buses if not already plotted
              // Use ref to get current plotted buses (avoids stale closure)
              // null means show ALL buses - don't change it
              const currentPlotted = plottedBusNumbersRef.current;

              // If currently showing all buses (null), keep showing all buses
              // No need to add specific buses since all are already visible
              if (currentPlotted === null) {
                // All buses are already shown, nothing to do
                // Just ensure elements are visible
                setShowElements(true);
                setHiddenElementIds(new Set());
              } else {
                // Only specific buses are shown - add new buses if not already plotted
                const busesToPlot: number[] = [];

                switch (selectedElementType) {
                  case 'bus':
                    if (addData.ibus && !currentPlotted.has(addData.ibus)) {
                      busesToPlot.push(addData.ibus);
                    }
                    break;
                  case 'generator':
                  case 'load':
                  case 'fixed_shunt':
                  case 'switched_shunt':
                  case 'fixshunt':
                  case 'swshunt':
                    if (addData.ibus && !currentPlotted.has(addData.ibus)) {
                      busesToPlot.push(addData.ibus);
                    }
                    break;
                  case 'acline':
                    if (addData.ibus && !currentPlotted.has(addData.ibus)) {
                      busesToPlot.push(addData.ibus);
                    }
                    if (addData.jbus && !currentPlotted.has(addData.jbus)) {
                      busesToPlot.push(addData.jbus);
                    }
                    break;
                  case 'transformer':
                    if (addData.ibus && !currentPlotted.has(addData.ibus)) {
                      busesToPlot.push(addData.ibus);
                    }
                    if (addData.jbus && !currentPlotted.has(addData.jbus)) {
                      busesToPlot.push(addData.jbus);
                    }
                    if (addData.kbus && addData.kbus > 0 && !currentPlotted.has(addData.kbus)) {
                      busesToPlot.push(addData.kbus);
                    }
                    break;
                }

                // Plot buses - update both ref (immediate) and state (triggers re-render)
                if (busesToPlot.length > 0) {
                  // Update ref immediately (for any sync operations)
                  const newSet = new Set(currentPlotted);
                  busesToPlot.forEach(bus => newSet.add(bus));
                  plottedBusNumbersRef.current = newSet;
                  // Update state (triggers re-render)
                  setPlottedBusNumbers(newSet);
                  // Enable element visibility
                  setShowElements(true);
                  // Clear hidden elements
                  setHiddenElementIds(new Set());
                }
              }
            } else {
              // Modify mode: Call modifyElement API
              // Build identifier for this element
              const identifierFields = ELEMENT_IDENTIFIERS[selectedElementType] || [];
              const identifier: Record<string, any> = {};
              identifierFields.forEach(field => {
                if (selectedElementData[field] !== undefined) {
                  identifier[field] = selectedElementData[field];
                }
              });

              // Build modify data with ONLY the changed fields
              const modifyData: Record<string, any> = {};
              let hasChanges = false;

              Object.keys(updatedValues).forEach(key => {
                if (updatedValues[key] !== selectedElementData[key]) {
                  modifyData[key] = updatedValues[key];
                  // Update local data
                  selectedElementData[key] = updatedValues[key];
                  hasChanges = true;
                }
              });

              if (hasChanges) {
                // Call modify API
                await PowerFlowApp.modifyElement(selectedElementType as keyof typeof ELEMENT_TYPES, identifier, modifyData);
              }
              setIsParamEditorOpen(false);
            }
          } catch (error: any) {
            // Error - show error message and KEEP MODAL OPEN
            console.error('Failed to save element:', error);

            // Extract error message from SDK response
            // Error structure from SDK:
            // ValidationError: HTTP 500: {"status":"error","error":"edit_failed","message":"Failed to add load: Load 1 on bus 101 already exists"}

            let errorMessage = t('networkDiagram:saveElementError');

            // Try to parse the error
            if (error?.message) {
              let messageStr = error.message;

              // Look for JSON within the message (e.g., "HTTP 500: {json}")
              // Find the first { and matching }
              const startBrace = messageStr.indexOf('{');
              if (startBrace !== -1) {
                // Find the end of the JSON by counting braces
                let braceCount = 0;
                let endBrace = startBrace;
                for (let i = startBrace; i < messageStr.length; i++) {
                  if (messageStr[i] === '{') braceCount++;
                  if (messageStr[i] === '}') braceCount--;
                  if (braceCount === 0) {
                    endBrace = i + 1;
                    break;
                  }
                }
                if (endBrace > startBrace) {
                  try {
                    const jsonStr = messageStr.substring(startBrace, endBrace);
                    const parsedJson = JSON.parse(jsonStr);
                    if (parsedJson.message) {
                      errorMessage = parsedJson.message;
                    }
                  } catch {
                    // JSON parse failed, use original message
                    errorMessage = messageStr;
                  }
                }
              } else {
                errorMessage = messageStr;
              }
            } else if (typeof error === 'string') {
              errorMessage = error;
            }

            // Extract only the message part (after the colon) if the error follows the pattern "Failed to ...: ..."
            // Examples:
            // "Failed to add load: Load 1 on bus 101 already exists" -> "Load 1 on bus 101 already exists"
            // "Failed to add generator: Generator 1 on bus 101 already exists" -> "Generator 1 on bus 101 already exists"
            // Do NOT strip for messages like "Missing required field: loadid" - show the full message
            if (errorMessage.startsWith('Failed to ') && errorMessage.includes(': ')) {
              const colonIndex = errorMessage.indexOf(': ');
              if (colonIndex !== -1 && colonIndex < errorMessage.length - 2) {
                errorMessage = errorMessage.substring(colonIndex + 2);
              }
            }

            showError(t('common:error'), errorMessage);
            // Don't close the modal - let user fix the error
            return;
          }
        }}
        width={700}
        height={600}
      />
    </div>
  );
});

NetworkDiagramContainer.displayName = 'NetworkDiagramContainer';
