/**
 * Shared layout + element-build compute core.
 *
 * Pure computation (no DOM): runs the force-directed layout and the element
 * factory and returns serializable results. Used BOTH inside the Web Worker
 * (layout.worker.ts) and as the main-thread synchronous fallback when a worker
 * can't be created — guaranteeing the two paths behave identically.
 */

import { ImprovedLayoutEngine } from '../layout/ImprovedLayoutEngine';
import { ElementFactory } from '../factories/ElementFactory';
import type { NetworkDataset, DiagramElement, Point } from '../types';
import type { BusConnectionInfo } from '../utils/busConnectionPoints';

export interface LayoutBuildInput {
  /** Raw network arrays (plain, structured-clone friendly). */
  data: NetworkDataset;
  /** Bus numbers to show; null/undefined => all. Passed as array for transfer. */
  plottedBusNumbers?: number[] | null;
}

export interface LayoutBuildResult {
  nodes: Map<number, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  // Edge bundles are opaque to the worker boundary; the renderer consumes them
  // via the hook's edgeBundlesRef (also `Map<string, any>`).
  edgeBundles: Map<string, any>;
  elements: Map<string, DiagramElement>;
  busConnectionInfos: Map<string, BusConnectionInfo>;
}

/**
 * Build the large-network layout engine with the same parameters the legacy
 * synchronous path uses (see useDataProcessing), so worker and legacy layouts
 * are visually equivalent.
 */
function makeLayoutEngine(busCount: number): ImprovedLayoutEngine {
  const scaleFactor = Math.sqrt(Math.max(1, busCount / 100));
  return new ImprovedLayoutEngine({
    iterations: 1500 + Math.round(busCount * 0.5),
    repulsion: 10000 * scaleFactor,
    springLength: 250 * (1 + scaleFactor * 0.5),
    springK: 0.05,
    damping: 0.85,
    coolingFactor: 0.95,
    barnesHutTheta: 0.8,
    gravity: 0.005,
    edgeWeightInfluence: 1.0,
    clusterRepulsion: 2.0,
  });
}

/**
 * Run layout then build all diagram elements. `onProgress` (0..1) advances
 * through layout (~5%→80%) and element build (~80%→100%).
 */
export function runLayoutAndBuild(
  input: LayoutBuildInput,
  onProgress?: (fraction: number) => void,
): LayoutBuildResult {
  const { data } = input;
  const buses = data.buses || [];
  const aclines = data.aclines || [];
  const transformers = data.transformers || [];
  const twotermdc = data.twotermdc || [];

  onProgress?.(0.02);
  const engine = makeLayoutEngine(buses.length);
  engine.buildGraph(buses, aclines, transformers, twotermdc);

  // Layout occupies 5%..80% of the progress bar.
  const layoutResult = engine.run(f => onProgress?.(0.05 + f * 0.75));
  const edgeBundles = engine.getEdgeBundles();

  onProgress?.(0.82);
  const factory = new ElementFactory();
  const plotted = input.plottedBusNumbers ? new Set(input.plottedBusNumbers) : null;
  const elements = factory.createAllElements(
    buses,
    aclines,
    transformers,
    data.loads,
    data.generators,
    layoutResult.nodes,
    plotted,
    data.twotermdc,
    data.vscdc,
    data.fixedShunts,
    data.switchedShunts,
  );
  const busConnectionInfos = factory.getBusConnectionInfos();
  onProgress?.(1);

  return {
    nodes: layoutResult.nodes,
    bounds: layoutResult.bounds,
    edgeBundles,
    elements,
    busConnectionInfos,
  };
}
