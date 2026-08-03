/**
 * useDataProcessing Hook
 * Handles data processing, layout, and element creation
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PowerFlowResults } from '../types';
import { DiagramElement, NetworkDataset, LayoutConfig } from '../types';
import { LayoutEngine } from '../layout/LayoutEngine';
import { ImprovedLayoutEngine } from '../layout/ImprovedLayoutEngine';
import { ElementFactory } from '../factories/ElementFactory';
import { BusConnectionInfo } from '../utils/busConnectionPoints';
import { isLargeNetwork } from '../config/scalability';
import { LayoutComputeClient } from '../workers/layoutClient';
import { mergePowerFlowIntoElements } from '../factories/powerFlowMerge';
import { perfStart } from '../utils/perf';

/** Status of the async (large-network) layout/build pipeline. */
export type ComputeStatus = 'idle' | 'computing' | 'ready' | 'error';

/** Compare two Sets for equality (returns true if both are undefined/null, or if they contain the same values) */
function setsEqual(set1: Set<number> | null | undefined, set2: Set<number> | null | undefined): boolean {
  if (set1 === set2) return true;
  if (!set1 || !set2) return false;
  if (set1.size !== set2.size) return false;
  const arr1 = Array.from(set1);
  for (let i = 0; i < arr1.length; i++) {
    if (!set2.has(arr1[i])) return false;
  }
  return true;
}

/**
 * Build a sub-network containing only the plotted buses and the branches/devices
 * whose endpoints are all plotted. Used so that plotting a subset of a large
 * network lays out and builds just that subgraph — not all (e.g. 29k) buses.
 * This is what keeps "plot one bus" from paying the full-network layout cost.
 */
function subsetNetwork(data: NetworkDataset, plotted: Set<number>): NetworkDataset {
  const has = (n: number | undefined | null) => n !== undefined && n !== null && plotted.has(n);
  return {
    ...data,
    buses: (data.buses || []).filter(b => plotted.has(b.ibus)),
    aclines: (data.aclines || []).filter(l => has(l.ibus) && has(l.jbus)),
    transformers: (data.transformers || []).filter(
      t => has(t.ibus) && has(t.jbus) && (!t.kbus || t.kbus <= 0 || has(t.kbus)),
    ),
    twotermdc: (data.twotermdc || []).filter(l => has(l.ipi) && has(l.ipr)),
    vscdc: (data.vscdc || []).filter(d => has(d.ibus1) && has(d.ibus2)),
    loads: (data.loads || []).filter(x => has(x.ibus)),
    generators: (data.generators || []).filter(x => has(x.ibus)),
    fixedShunts: (data.fixedShunts || []).filter(x => has(x.ibus)),
    switchedShunts: (data.switchedShunts || []).filter(x => has(x.ibus)),
  };
}

/** Build a stable key for topology (buses + aclines + transformers + twotermdc connectivity). Same key => no need to re-run layout. */
function getTopologyKey(buses: any[] | undefined, aclines: any[] | undefined, transformers: any[] | undefined, twotermdc: any[] | undefined): string {
  const b = (buses || []).map((x: any) => x.ibus).sort((a: number, b: number) => a - b).join(',');
  const a = (aclines || []).map((x: any) => `${x.ibus}-${x.jbus}`).sort().join('|');
  const t = (transformers || []).map((x: any) => `${x.ibus}-${x.jbus}-${x.kbus ?? 0}`).sort().join('|');
  const dc = (twotermdc || []).map((x: any) => `${x.ipi}-${x.ipr}`).sort().join('|');
  return `b:${b}|a:${a}|t:${t}|dc:${dc}`;
}

interface UseDataProcessingOptions {
  data: NetworkDataset | null | undefined;
  layoutConfig: Partial<LayoutConfig> | undefined;
  showElements?: boolean; // If false, skip element creation and layout processing
  sessionChanged?: boolean; // If true, re-center the diagram. If false (data refresh), preserve transform/elements
  plottedBusNumbers?: Set<number> | null; // Set of bus numbers that should be visible. null means show all buses.
  powerFlowResults?: PowerFlowResults | null; // Power flow results to merge into element data
}

interface UseDataProcessingReturn {
  elementsRef: React.MutableRefObject<Map<string, DiagramElement>>;
  edgeBundlesRef: React.MutableRefObject<Map<string, any>>;
  busConnectionInfosRef: React.MutableRefObject<Map<string, BusConnectionInfo>>;
  layoutEngineRef: React.MutableRefObject<LayoutEngine | ImprovedLayoutEngine | null>;
  elementFactoryRef: React.MutableRefObject<ElementFactory | null>;
  layoutBoundsRef: React.MutableRefObject<{
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    centerX: number;
    centerY: number;
  } | null>;
  /** Trigger that increments when layout bounds change, for re-centering */
  centeringTrigger: number;
  /** Trigger that increments when elements are recreated, for re-rendering */
  elementsUpdateTrigger: number;
  /**
   * Status of the async compute used for large networks. Always `'idle'` for
   * small networks (which use the synchronous path).
   */
  computeStatus: ComputeStatus;
  /** Progress (0..1) of the async compute; only meaningful while computing. */
  computeProgress: number;
  /** Error message if the async compute failed, else null. */
  computeError: string | null;
  /** Cancel any in-flight async compute. */
  cancelCompute: () => void;
}

export function useDataProcessing({
  data,
  layoutConfig,
  showElements = true,
  sessionChanged = false,
  plottedBusNumbers,
  powerFlowResults,
}: UseDataProcessingOptions): UseDataProcessingReturn {
  const elementsRef = useRef<Map<string, DiagramElement>>(new Map());
  const edgeBundlesRef = useRef<Map<string, any>>(new Map());
  const busConnectionInfosRef = useRef<Map<string, BusConnectionInfo>>(new Map());
  const layoutEngineRef = useRef<LayoutEngine | null>(null);
  const elementFactoryRef = useRef<ElementFactory | null>(null);
  const prevDataRef = useRef<NetworkDataset | null | undefined>(null);
  const prevLayoutDataRef = useRef<NetworkDataset | null | undefined>(null); // Only for layout effect; element-creation uses prevDataRef
  const prevTopologyKeyRef = useRef<string>(''); // When only loads/generators change, keep existing layout so bus positions don't shift
  const prevShowElementsRef = useRef<boolean | undefined>(undefined);
  const prevSessionChangedRef = useRef<boolean>(false);
  const prevPlottedBusNumbersRef = useRef<Set<number> | null | undefined>(undefined);
  const prevPowerFlowResultsRef = useRef<PowerFlowResults | null | undefined>(undefined);
  // Store layout result so we can create elements later when showElements becomes true
  const layoutResultRef = useRef<{ nodes: Map<number, any>; bounds: any } | null>(null);

  // Trigger to signal that layout bounds have changed
  const [centeringTrigger, setCenteringTrigger] = useState(0);
  // Trigger to signal that elements have been recreated (for re-rendering)
  const [elementsUpdateTrigger, setElementsUpdateTrigger] = useState(0);

  // Store layout bounds separately for centering
  const layoutBoundsRef = useRef<{
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    centerX: number;
    centerY: number;
  } | null>(null);

  // --- Async pipeline state (large networks) ---
  // Large networks run layout + element build in a Web Worker so the UI never
  // freezes. Small networks keep the synchronous path below and stay 'idle'.
  const [computeStatus, setComputeStatus] = useState<ComputeStatus>('idle');
  const [computeProgress, setComputeProgress] = useState(0);
  const [computeError, setComputeError] = useState<string | null>(null);
  const computeClientRef = useRef<LayoutComputeClient | null>(null);

  // Lazily create the worker client, and tear it down on unmount.
  if (computeClientRef.current === null) {
    computeClientRef.current = new LayoutComputeClient();
  }
  useEffect(() => {
    return () => {
      computeClientRef.current?.dispose();
      computeClientRef.current = null;
    };
  }, []);

  const cancelCompute = useCallback(() => {
    computeClientRef.current?.cancel();
    setComputeStatus(prev => (prev === 'computing' ? 'idle' : prev));
  }, []);

  // Initialize layout engine and element factory (only once)
  useEffect(() => {
    const layoutEngine = new LayoutEngine(layoutConfig);
    layoutEngineRef.current = layoutEngine;

    const elementFactory = new ElementFactory();
    elementFactoryRef.current = elementFactory;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only initialize once

  // Initialize improved layout engine for large networks
  useEffect(() => {
    if (!data || !layoutEngineRef.current) {
      return;
    }

    const busCount = data.buses?.length || 0;

    // Use ImprovedLayoutEngine for larger networks (50+ buses)
    // for better performance and cleaner layout
    if (busCount >= 50) {
      // Scale parameters based on network size for better spacing
      const scaleFactor = Math.sqrt(Math.max(1, busCount / 100));

      const improvedEngine = new ImprovedLayoutEngine({
        iterations: 1500 + Math.round(busCount * 0.5),
        repulsion: 10000 * scaleFactor,
        springLength: 250 * (1 + scaleFactor * 0.5),
        springK: 0.05,
        damping: 0.85,
        coolingFactor: 0.95,
        barnesHutTheta: 0.8,
        gravity: 0.005, // Reduce gravity to allow more spread
        edgeWeightInfluence: 1.0,
        clusterRepulsion: 2.0, // Increase cluster repulsion for better separation
      });
      layoutEngineRef.current = improvedEngine as any;
    } else {
      // Use standard LayoutEngine for smaller networks
      const standardEngine = new LayoutEngine(layoutConfig);
      layoutEngineRef.current = standardEngine;
    }
  }, [data, layoutConfig]);

  // Run layout only when topology (buses, aclines, transformers) changes — not when only loads/generators change
  useEffect(() => {
    if (!data || !layoutEngineRef.current) {
      return;
    }
    // Large networks run layout in the Web Worker (see the async effect below).
    if (isLargeNetwork(data)) {
      return;
    }

    const topologyKey = getTopologyKey(data.buses, data.aclines, data.transformers, data.twotermdc);

    // Same topology (e.g. only added a load/gen) => keep existing layout so bus positions don't shift
    if (topologyKey === prevTopologyKeyRef.current && layoutResultRef.current != null) {
      prevLayoutDataRef.current = data;
      return;
    }

    // Save existing bus positions before layout recalculation (to preserve positions when adding new elements)
    const existingBusPositions = new Map<number, { x: number; y: number }>();
    if (!sessionChanged && elementsRef.current.size > 0) {
      elementsRef.current.forEach((element, id) => {
        if (element.type === 'bus') {
          const busData = element.data as { ibus?: number };
          if (busData.ibus !== undefined) {
            existingBusPositions.set(busData.ibus, { x: element.position.x, y: element.position.y });
          }
        }
      });
    }

    prevLayoutDataRef.current = data;
    prevTopologyKeyRef.current = topologyKey;

    const layoutEngine = layoutEngineRef.current;

    layoutEngine.buildGraph(
      data.buses || [],
      data.aclines || [],
      data.transformers || [],
      data.twotermdc || []
    );

    const layoutResult = layoutEngine.run();

    // Restore existing bus positions (preserve positions when adding new elements like aclines)
    if (existingBusPositions.size > 0) {
      layoutResult.nodes.forEach((node, busNum) => {
        const existingPos = existingBusPositions.get(busNum);
        if (existingPos) {
          node.x = existingPos.x;
          node.y = existingPos.y;
        }
      });
    }

    layoutResultRef.current = layoutResult;
    edgeBundlesRef.current = layoutEngine.getEdgeBundles();

    const centerX = (layoutResult.bounds.minX + layoutResult.bounds.maxX) / 2;
    const centerY = (layoutResult.bounds.minY + layoutResult.bounds.maxY) / 2;

    layoutBoundsRef.current = {
      bounds: layoutResult.bounds,
      centerX,
      centerY,
    };

    if (sessionChanged && sessionChanged !== prevSessionChangedRef.current) {
      setCenteringTrigger(prev => prev + 1);
      prevSessionChangedRef.current = sessionChanged;
    }

    if (sessionChanged) {
      elementsRef.current.clear();
      busConnectionInfosRef.current.clear();
    }
  }, [data, sessionChanged]); // Depend on data and sessionChanged

  // Create elements only when showElements is true
  useEffect(() => {
    if (!data || !layoutEngineRef.current || !layoutResultRef.current) {
      return;
    }
    // Large networks build elements in the Web Worker (see the async effect below).
    if (isLargeNetwork(data)) {
      return;
    }

    // Only create elements when showElements is true
    if (showElements !== true) {
      // Clear elements if showElements becomes false
      if (prevShowElementsRef.current === true && showElements === false) {
        elementsRef.current.clear();
        busConnectionInfosRef.current.clear();
      }
      prevShowElementsRef.current = showElements;
      return;
    }

    // Check if we already created elements for this data and showElements state
    const dataChanged = data !== prevDataRef.current;
    const showElementsChanged = prevShowElementsRef.current !== true;
    const plottedBusNumbersChanged = prevPlottedBusNumbersRef.current !== plottedBusNumbers &&
                                    !setsEqual(prevPlottedBusNumbersRef.current, plottedBusNumbers);

    // Check if power flow results have changed (compare timestamp or generator results)
    const powerFlowResultsChanged = powerFlowResults !== prevPowerFlowResultsRef.current &&
      powerFlowResults?.timestamp !== prevPowerFlowResultsRef.current?.timestamp;

    console.log('[useDataProcessing] Element creation check:', {
      dataChanged,
      showElementsChanged,
      plottedBusNumbersChanged,
      powerFlowResultsChanged,
      elementsSize: elementsRef.current.size,
      aclinesCount: data.aclines?.length || 0,
      prevAclinesCount: (prevDataRef.current as any)?.aclines?.length || 0,
    });

    // If only power flow results changed, update generator and shunt elements in place
    if (!dataChanged && !showElementsChanged && !plottedBusNumbersChanged &&
        powerFlowResultsChanged && elementsRef.current.size > 0) {
      console.log('[useDataProcessing] Updating generator and shunt elements with new power flow results');

      let hasUpdates = false;

      // Update generator elements
      if (powerFlowResults?.generatorResults && powerFlowResults.generatorResults.length > 0) {
        const genResultsMap = new Map<string, { pg?: number; qg?: number }>();
        powerFlowResults.generatorResults.forEach(result => {
          const key = `${result.ibus}_${result.machid || '0'}`;
          genResultsMap.set(key, { pg: result.pg, qg: result.qg });
        });

        elementsRef.current.forEach((element, id) => {
          if (element.type === 'generator') {
            const genData = element.data as any;
            const key = `${genData.ibus}_${genData.machid || '0'}`;
            const results = genResultsMap.get(key);
            if (results) {
              genData.pg = results.pg ?? genData.pg;
              genData.qg = results.qg ?? genData.qg;
              hasUpdates = true;
            }
          }
        });
      }

      // Update fixed shunt elements
      if (powerFlowResults?.fixshuntResults && powerFlowResults.fixshuntResults.length > 0) {
        const fixshuntResultsMap = new Map<string, { q?: number }>();
        powerFlowResults.fixshuntResults.forEach(result => {
          const key = `${result.ibus}_${result.shntid || ''}`;
          fixshuntResultsMap.set(key, { q: result.q });
        });

        elementsRef.current.forEach((element, id) => {
          if (element.type === 'fixed_shunt') {
            const shuntData = element.data as any;
            const key = `${shuntData.ibus}_${shuntData.shntid || ''}`;
            const results = fixshuntResultsMap.get(key);
            if (results && results.q !== undefined) {
              shuntData.q = results.q;
              hasUpdates = true;
            }
          }
        });
      }

      // Update switched shunt elements
      if (powerFlowResults?.swshuntResults && powerFlowResults.swshuntResults.length > 0) {
        const swshuntResultsMap = new Map<string, { q?: number }>();
        powerFlowResults.swshuntResults.forEach(result => {
          const key = `${result.ibus}_${result.shntid || ''}`;
          swshuntResultsMap.set(key, { q: result.q });
        });

        elementsRef.current.forEach((element, id) => {
          if (element.type === 'switched_shunt') {
            const shuntData = element.data as any;
            // switched shunt uses swid as identifier, but results use shntid
            const key = `${shuntData.ibus}_${shuntData.swid || shuntData.shntid || ''}`;
            const results = swshuntResultsMap.get(key);
            if (results && results.q !== undefined) {
              shuntData.q = results.q;
              hasUpdates = true;
            }
          }
        });
      }

      // Trigger re-render if any updates were made
      if (hasUpdates) {
        setElementsUpdateTrigger(prev => prev + 1);
      }
      prevPowerFlowResultsRef.current = powerFlowResults;
      return;
    }

    if (!dataChanged && !showElementsChanged && !plottedBusNumbersChanged && elementsRef.current.size > 0) {
      console.log('[useDataProcessing] Skipping element creation - no changes detected');
      return;
    }

    console.log('[useDataProcessing] Creating elements, aclines:', data.aclines?.length || 0);

    prevShowElementsRef.current = showElements;
    const prevPlottedBuses = prevPlottedBusNumbersRef.current;
    prevPlottedBusNumbersRef.current = plottedBusNumbers;

    // Save existing element positions before recreation (to preserve positions when data changes)
    // Save positions for ALL element types including buses, lines, transformers, loads, generators, etc.
    const existingElementPositions = new Map<string, {
      x: number;
      y: number;
      mirrored?: boolean;
      connectedBusPosition?: { x: number; y: number };
      toPos?: { x: number; y: number }; // For lines and transformers
      busHeight?: number; // For buses
    }>();
    if (!sessionChanged && elementsRef.current.size > 0) {
      elementsRef.current.forEach((element, id) => {
        const posData: {
          x: number;
          y: number;
          mirrored?: boolean;
          connectedBusPosition?: { x: number; y: number };
          toPos?: { x: number; y: number };
          busHeight?: number;
        } = {
          x: element.position.x,
          y: element.position.y,
        };

        // Save type-specific properties
        if (element.type === 'load' || element.type === 'generator' ||
            element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
          posData.mirrored = (element as any).mirrored;
          posData.connectedBusPosition = (element as any).connectedBusPosition;
        } else if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
          posData.toPos = { ...(element as any).toPos };
        } else if (element.type === 'bus') {
          posData.busHeight = (element as any).busHeight;
        }

        existingElementPositions.set(id, posData);
      });

      // Sync layout nodes with current bus positions so createAllElements
      // uses up-to-date positions (e.g. after user dragged buses)
      if (layoutResultRef.current) {
        elementsRef.current.forEach((element) => {
          if (element.type === 'bus') {
            const busData = element.data as { ibus?: number };
            if (busData.ibus !== undefined) {
              const node = layoutResultRef.current!.nodes.get(busData.ibus);
              if (node) {
                node.x = element.position.x;
                node.y = element.position.y;
              }
            }
          }
        });
      }
    }

    // Create all elements using ElementFactory with the pre-calculated layout
    const elementFactory = elementFactoryRef.current;
    if (!elementFactory) {
      console.warn('[NetworkDiagram] ElementFactory not initialized');
      return;
    }

    const allElements = elementFactory.createAllElements(
      data.buses || [],
      data.aclines || [],
      data.transformers || [],
      data.loads,
      data.generators,
      layoutResultRef.current.nodes,
      plottedBusNumbers,
      data.twotermdc,
      data.vscdc,
      data.fixedShunts,
      data.switchedShunts
    );

    // Merge power flow results into generator elements (update pg, qg values)
    if (powerFlowResults?.generatorResults && powerFlowResults.generatorResults.length > 0) {
      const genResultsMap = new Map<string, { pg?: number; qg?: number }>();
      powerFlowResults.generatorResults.forEach(result => {
        const key = `${result.ibus}_${result.machid || '0'}`;
        genResultsMap.set(key, { pg: result.pg, qg: result.qg });
      });

      allElements.forEach((element, id) => {
        if (element.type === 'generator') {
          const genData = element.data as any;
          const key = `${genData.ibus}_${genData.machid || '0'}`;
          const results = genResultsMap.get(key);
          if (results) {
            // Merge power flow results into generator data
            genData.pg = results.pg ?? genData.pg;
            genData.qg = results.qg ?? genData.qg;
          }
        }
      });
    }

    // Merge power flow results into fixed shunt elements (update q values)
    if (powerFlowResults?.fixshuntResults && powerFlowResults.fixshuntResults.length > 0) {
      const fixshuntResultsMap = new Map<string, { q?: number }>();
      powerFlowResults.fixshuntResults.forEach(result => {
        const key = `${result.ibus}_${result.shntid || ''}`;
        fixshuntResultsMap.set(key, { q: result.q });
      });

      allElements.forEach((element, id) => {
        if (element.type === 'fixed_shunt') {
          const shuntData = element.data as any;
          const key = `${shuntData.ibus}_${shuntData.shntid || ''}`;
          const results = fixshuntResultsMap.get(key);
          if (results && results.q !== undefined) {
            shuntData.q = results.q;
          }
        }
      });
    }

    // Merge power flow results into switched shunt elements (update q values)
    if (powerFlowResults?.swshuntResults && powerFlowResults.swshuntResults.length > 0) {
      const swshuntResultsMap = new Map<string, { q?: number }>();
      powerFlowResults.swshuntResults.forEach(result => {
        const key = `${result.ibus}_${result.shntid || ''}`;
        swshuntResultsMap.set(key, { q: result.q });
      });

      allElements.forEach((element, id) => {
        if (element.type === 'switched_shunt') {
          const shuntData = element.data as any;
          // switched shunt uses swid as identifier, but results use shntid
          const key = `${shuntData.ibus}_${shuntData.swid || shuntData.shntid || ''}`;
          const results = swshuntResultsMap.get(key);
          if (results && results.q !== undefined) {
            shuntData.q = results.q;
          }
        }
      });
    }

    // Restore existing element positions (preserve positions when data changes like tripping a line)
    // Restores positions for ALL element types including buses, lines, transformers, loads, generators, etc.
    if (existingElementPositions.size > 0) {
      allElements.forEach((element, id) => {
        const existingPos = existingElementPositions.get(id);
        if (existingPos) {
          element.position.x = existingPos.x;
          element.position.y = existingPos.y;

          // Restore type-specific properties
          if (element.type === 'load' || element.type === 'generator' ||
              element.type === 'fixed_shunt' || element.type === 'switched_shunt') {
            if (existingPos.mirrored !== undefined) {
              (element as any).mirrored = existingPos.mirrored;
            }
            if (existingPos.connectedBusPosition) {
              (element as any).connectedBusPosition = existingPos.connectedBusPosition;
            }
          } else if (element.type === 'acline' || element.type === 'transformer' || element.type === 'transformer3w') {
            if (existingPos.toPos) {
              (element as any).toPos = existingPos.toPos;
            }
          } else if (element.type === 'bus') {
            if (existingPos.busHeight !== undefined) {
              (element as any).busHeight = existingPos.busHeight;
            }
          }
        }
      });
    }

    elementsRef.current = allElements;

    // Store bus connection infos
    busConnectionInfosRef.current = elementFactory.getBusConnectionInfos();

    // Trigger re-render in parent component since elements have changed
    setElementsUpdateTrigger(prev => prev + 1);

    // Mark this data as processed so we don't recreate on every render; keeps prevDataRef separate from layout effect so new elements (e.g. added load/gen) trigger recreation
    prevDataRef.current = data;
    prevPowerFlowResultsRef.current = powerFlowResults;

    // When plotted buses change from empty/undefined to non-empty, calculate bounds for only the plotted buses
    // This ensures the first time buses are plotted, the diagram centers on them
    const isFirstPlot = (!prevPlottedBuses || prevPlottedBuses.size === 0) && plottedBusNumbers && plottedBusNumbers.size > 0;
    if (isFirstPlot && layoutResultRef.current) {
      const nodes = layoutResultRef.current.nodes;
      const plottedBusPositions: { x: number; y: number }[] = [];

      // Collect positions of only the plotted buses
      plottedBusNumbers.forEach((busNum) => {
        const node = nodes.get(busNum);
        if (node) {
          plottedBusPositions.push({ x: node.x, y: node.y });
        }
      });

      // If we have plotted bus positions, recalculate bounds and center on them
      if (plottedBusPositions.length > 0) {
        const minX = Math.min(...plottedBusPositions.map(p => p.x));
        const maxX = Math.max(...plottedBusPositions.map(p => p.x));
        const minY = Math.min(...plottedBusPositions.map(p => p.y));
        const maxY = Math.max(...plottedBusPositions.map(p => p.y));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Update layoutBoundsRef to only the plotted buses
        layoutBoundsRef.current = {
          bounds: { minX, maxX, minY, maxY },
          centerX,
          centerY,
        };

        // Trigger centering
        setCenteringTrigger(prev => prev + 1);
      }
    }
  }, [data, showElements, plottedBusNumbers, powerFlowResults]); // Depend on data, showElements, plottedBusNumbers, and powerFlowResults

  // --- Async layout + element build for LARGE networks ---
  // Runs the heavy layout/build in a Web Worker so the main thread stays
  // responsive. Mirrors the synchronous path's incremental behavior for the
  // common "only power flow changed" case to avoid needless re-layout.
  useEffect(() => {
    if (!data || !isLargeNetwork(data)) {
      // Small networks are handled by the synchronous effects above. A previous
      // large-network compute may still be in flight — cancel it so its late
      // result can't overwrite the now-current (small) network's elements.
      computeClientRef.current?.cancel();
      setComputeStatus('idle');
      setComputeProgress(0);
      return;
    }

    // Respect showElements: clear the diagram when hidden.
    if (showElements !== true) {
      if (prevShowElementsRef.current === true) {
        elementsRef.current.clear();
        busConnectionInfosRef.current.clear();
        setElementsUpdateTrigger(prev => prev + 1);
      }
      prevShowElementsRef.current = showElements;
      return;
    }

    const dataChanged = data !== prevDataRef.current;
    const showElementsBecameTrue = prevShowElementsRef.current !== true;
    const plottedChanged = !setsEqual(prevPlottedBusNumbersRef.current, plottedBusNumbers);
    const powerFlowChanged =
      powerFlowResults !== prevPowerFlowResultsRef.current &&
      powerFlowResults?.timestamp !== prevPowerFlowResultsRef.current?.timestamp;

    // Fast path: only power-flow results changed → merge in place (no re-layout,
    // no worker round-trip), exactly like the synchronous path.
    if (!dataChanged && !showElementsBecameTrue && !plottedChanged &&
        powerFlowChanged && elementsRef.current.size > 0) {
      const hasUpdates = mergePowerFlowIntoElements(elementsRef.current, powerFlowResults);
      if (hasUpdates) setElementsUpdateTrigger(prev => prev + 1);
      prevPowerFlowResultsRef.current = powerFlowResults;
      return;
    }

    // Nothing relevant changed and elements already exist → skip.
    if (!dataChanged && !showElementsBecameTrue && !plottedChanged && elementsRef.current.size > 0) {
      return;
    }

    // Structural change / first load / plotted-set change → recompute off-thread.
    const client = computeClientRef.current;
    if (!client) return;

    const shouldCenter = sessionChanged || elementsRef.current.size === 0;
    const topologyKey = getTopologyKey(data.buses, data.aclines, data.transformers, data.twotermdc);

    // Only lay out / build the buses the user actually wants shown. For a large
    // network this turns "plot one bus" from a full 29k-bus layout into a tiny
    // subgraph layout. When nothing specific is plotted (null/empty) we fall back
    // to the full network (the "plot all" case).
    const hasPlottedSubset = plottedBusNumbers != null && plottedBusNumbers.size > 0;
    const computeNetwork = hasPlottedSubset ? subsetNetwork(data, plottedBusNumbers!) : data;
    const endPerf = perfStart('async-layout+build', { buses: computeNetwork.buses?.length });

    // Snapshot the values this computation corresponds to (closure capture), so a
    // result that arrives after props changed is applied against the right data.
    const computedData = data;
    const computedPowerFlow = powerFlowResults;
    const computedPlotted = plottedBusNumbers;

    setComputeError(null);
    setComputeProgress(0);
    setComputeStatus('computing');

    client.compute(
      {
        data: computeNetwork,
        plottedBusNumbers: plottedBusNumbers ? Array.from(plottedBusNumbers) : null,
      },
      {
        onProgress: fraction => setComputeProgress(fraction),
        onResult: res => {
          endPerf();
          // Apply results. (Position preservation across edits is deferred to a
          // later phase; for large networks the worker recomputes the layout.)
          elementsRef.current = res.elements;
          edgeBundlesRef.current = res.edgeBundles;
          busConnectionInfosRef.current = res.busConnectionInfos;
          layoutResultRef.current = { nodes: res.nodes, bounds: res.bounds };

          // Merge any power-flow results into the freshly built elements.
          mergePowerFlowIntoElements(res.elements, computedPowerFlow);

          const centerX = (res.bounds.minX + res.bounds.maxX) / 2;
          const centerY = (res.bounds.minY + res.bounds.maxY) / 2;
          layoutBoundsRef.current = { bounds: res.bounds, centerX, centerY };

          // Record what we computed so later effect runs diff correctly.
          prevDataRef.current = computedData;
          prevLayoutDataRef.current = computedData;
          prevTopologyKeyRef.current = topologyKey;
          prevShowElementsRef.current = true;
          prevPlottedBusNumbersRef.current = computedPlotted;
          prevPowerFlowResultsRef.current = computedPowerFlow;

          setComputeStatus('ready');
          setComputeProgress(1);
          if (shouldCenter) setCenteringTrigger(prev => prev + 1);
          setElementsUpdateTrigger(prev => prev + 1);
        },
        onError: message => {
          endPerf();
          setComputeStatus('error');
          setComputeError(message);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showElements, plottedBusNumbers, powerFlowResults, sessionChanged]);

  return {
    elementsRef,
    edgeBundlesRef,
    busConnectionInfosRef,
    layoutEngineRef,
    elementFactoryRef,
    layoutBoundsRef,
    centeringTrigger,
    elementsUpdateTrigger,
    computeStatus,
    computeProgress,
    computeError,
    cancelCompute,
  };
}
