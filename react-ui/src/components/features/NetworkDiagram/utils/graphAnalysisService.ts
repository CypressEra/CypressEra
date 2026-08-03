/**
 * Graph Analysis Service
 * Client-side graph traversal for shortest-path and neighbour-element queries.
 * Operates on the NetworkDataset already in memory — no API round-trip needed.
 */

import {
  NetworkDataset,
  Bus,
  ACLine,
  Transformer,
  Generator,
  Load,
  FixedShunt,
  SwitchedShunt,
  TwoTerminalDC,
  Vscdc,
} from '../types';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface BusWithHop {
  busNumber: number;
  busName: string;
  baseKv: number;
  busType: number;
  hop: number;
}

export type ShortestPathResult =
  | { found: true; path: BusWithHop[] }
  | { found: false };

export type ElementTypeFilter =
  | 'All'
  | 'Bus'
  | 'AcLine'
  | 'Transformer'
  | 'Generator'
  | 'Load'
  | 'FixShunt'
  | 'SwShunt'
  | 'TwoTermDc'
  | 'VscDc';

export type NeighbourElementKind =
  | 'Bus'
  | 'AcLine'
  | 'Transformer'
  | 'Generator'
  | 'Load'
  | 'FixShunt'
  | 'SwShunt'
  | 'TwoTermDc'
  | 'VscDc';

interface NeighbourBase {
  hopLevel: number;
  closestTerminalBus: number;
}

export type NeighbourElement =
  | ({ kind: 'Bus'; data: Bus } & NeighbourBase)
  | ({ kind: 'AcLine'; data: ACLine } & NeighbourBase)
  | ({ kind: 'Transformer'; data: Transformer } & NeighbourBase)
  | ({ kind: 'Generator'; data: Generator } & NeighbourBase)
  | ({ kind: 'Load'; data: Load } & NeighbourBase)
  | ({ kind: 'FixShunt'; data: FixedShunt } & NeighbourBase)
  | ({ kind: 'SwShunt'; data: SwitchedShunt } & NeighbourBase)
  | ({ kind: 'TwoTermDc'; data: TwoTerminalDC } & NeighbourBase)
  | ({ kind: 'VscDc'; data: Vscdc } & NeighbourBase);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GraphAnalysisService {
  /**
   * Build adjacency list over in-service AC lines and transformers.
   * Returns a Map<busNumber, Set<connectedBusNumber>>.
   */
  private buildAdjacency(network: NetworkDataset): Map<number, Set<number>> {
    const adj = new Map<number, Set<number>>();

    const connect = (a: number, b: number) => {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };

    for (const line of network.aclines ?? []) {
      if (line.stat === 0) continue; // out of service
      connect(line.ibus, line.jbus);
    }

    for (const xfm of network.transformers ?? []) {
      if (xfm.stat === 0) continue;
      connect(xfm.ibus, xfm.jbus);
      if (xfm.kbus && xfm.kbus > 0) {
        connect(xfm.ibus, xfm.kbus);
        connect(xfm.jbus, xfm.kbus);
      }
    }

    // Ensure every bus has an entry even if isolated
    for (const bus of network.buses ?? []) {
      if (!adj.has(bus.ibus)) adj.set(bus.ibus, new Set());
    }

    return adj;
  }

  /**
   * BFS from sourceBus. Returns a Map<busNumber, hopLevel>.
   * Stops expansion once maxHops is reached (use Infinity to get full reachable set).
   */
  private bfsLevels(
    sourceBus: number,
    adj: Map<number, Set<number>>,
    maxHops: number,
  ): Map<number, number> {
    const levels = new Map<number, number>();
    levels.set(sourceBus, 0);
    const queue: number[] = [sourceBus];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current)!;
      if (currentLevel >= maxHops) continue;

      (adj.get(current) ?? new Set<number>()).forEach((neighbour) => {
        if (!levels.has(neighbour)) {
          levels.set(neighbour, currentLevel + 1);
          queue.push(neighbour);
        }
      });
    }

    return levels;
  }

  /**
   * Find the shortest path (minimum hop sequence) between two buses.
   */
  findShortestPath(
    network: NetworkDataset,
    fromBus: number,
    toBus: number,
  ): ShortestPathResult {
    if (fromBus === toBus) {
      const bus = network.buses?.find((b) => b.ibus === fromBus);
      if (!bus) return { found: false };
      return {
        found: true,
        path: [{ busNumber: bus.ibus, busName: bus.name ?? '', baseKv: bus.baskv ?? 0, busType: bus.ide ?? 1, hop: 0 }],
      };
    }

    const adj = this.buildAdjacency(network);
    const busMap = new Map<number, Bus>();
    for (const bus of network.buses ?? []) busMap.set(bus.ibus, bus);

    // BFS with parent tracking for path reconstruction
    const visited = new Map<number, number | null>(); // bus → parent bus (null = root)
    visited.set(fromBus, null);
    const queue: number[] = [fromBus];

    let foundPath: number[] | null = null;
    outer: while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbours = adj.get(current) ?? new Set<number>();
      const neighbourArray = Array.from(neighbours);
      for (let i = 0; i < neighbourArray.length; i++) {
        const neighbour = neighbourArray[i];
        if (visited.has(neighbour)) continue;
        visited.set(neighbour, current);
        if (neighbour === toBus) {
          // Reconstruct path by following parent pointers
          const path: number[] = [];
          let cursor: number | null = toBus;
          while (cursor !== null) {
            path.unshift(cursor);
            cursor = visited.get(cursor) ?? null;
          }
          foundPath = path;
          break outer;
        }
        queue.push(neighbour);
      }
    }

    if (!foundPath) return { found: false };

    const path: BusWithHop[] = foundPath.map((busNum, hop) => {
      const bus = busMap.get(busNum);
      return {
        busNumber: busNum,
        busName: bus?.name ?? '',
        baseKv: bus?.baskv ?? 0,
        busType: bus?.ide ?? 1,
        hop,
      };
    });
    return { found: true, path };
  }

  /**
   * Find all in-service network elements within N buses of sourceBus.
   * Returns elements annotated with hop level of their closest terminal bus.
   * Pass filter=[] or filter=['All'] to return all element types.
   */
  findNeighbourElements(
    network: NetworkDataset,
    sourceBus: number,
    n: number,
    filter: ElementTypeFilter[],
  ): NeighbourElement[] {
    const adj = this.buildAdjacency(network);
    const levels = this.bfsLevels(sourceBus, adj, n);

    const wantAll = filter.length === 0 || filter.includes('All');
    const wants = (kind: ElementTypeFilter) => wantAll || filter.includes(kind);

    const results: NeighbourElement[] = [];

    // Closest terminal: minimum hop level among a list of bus numbers
    const closestTerminal = (buses: number[]): { bus: number; level: number } | null => {
      let best: { bus: number; level: number } | null = null;
      for (const b of buses) {
        const lv = levels.get(b);
        if (lv === undefined) continue;
        if (best === null || lv < best.level || (lv === best.level && b < best.bus)) {
          best = { bus: b, level: lv };
        }
      }
      return best;
    };

    if (wants('Bus')) {
      for (const bus of network.buses ?? []) {
        const lv = levels.get(bus.ibus);
        if (lv === undefined) continue;
        results.push({ kind: 'Bus', data: bus, hopLevel: lv, closestTerminalBus: bus.ibus });
      }
    }

    if (wants('AcLine')) {
      for (const line of network.aclines ?? []) {
        if (line.stat === 0) continue;
        const ct = closestTerminal([line.ibus, line.jbus]);
        if (!ct) continue;
        results.push({ kind: 'AcLine', data: line, hopLevel: ct.level, closestTerminalBus: ct.bus });
      }
    }

    if (wants('Transformer')) {
      for (const xfm of network.transformers ?? []) {
        if (xfm.stat === 0) continue;
        const termBuses = [xfm.ibus, xfm.jbus];
        if (xfm.kbus && xfm.kbus > 0) termBuses.push(xfm.kbus);
        const ct = closestTerminal(termBuses);
        if (!ct) continue;
        results.push({ kind: 'Transformer', data: xfm, hopLevel: ct.level, closestTerminalBus: ct.bus });
      }
    }

    if (wants('Generator')) {
      for (const gen of network.generators ?? []) {
        if (gen.stat === 0) continue;
        const lv = levels.get(gen.ibus);
        if (lv === undefined) continue;
        results.push({ kind: 'Generator', data: gen, hopLevel: lv, closestTerminalBus: gen.ibus });
      }
    }

    if (wants('Load')) {
      for (const load of network.loads ?? []) {
        if (load.status === 0) continue;
        const lv = levels.get(load.ibus);
        if (lv === undefined) continue;
        results.push({ kind: 'Load', data: load, hopLevel: lv, closestTerminalBus: load.ibus });
      }
    }

    if (wants('FixShunt')) {
      for (const fs of network.fixedShunts ?? []) {
        if (fs.stat === 0) continue;
        const lv = levels.get(fs.ibus);
        if (lv === undefined) continue;
        results.push({ kind: 'FixShunt', data: fs, hopLevel: lv, closestTerminalBus: fs.ibus });
      }
    }

    if (wants('SwShunt')) {
      for (const ss of network.switchedShunts ?? []) {
        if (ss.stat === 0) continue;
        const lv = levels.get(ss.ibus);
        if (lv === undefined) continue;
        results.push({ kind: 'SwShunt', data: ss, hopLevel: lv, closestTerminalBus: ss.ibus });
      }
    }

    if (wants('TwoTermDc')) {
      for (const dc of network.twotermdc ?? []) {
        if (dc.stat === 0) continue;
        const ct = closestTerminal([dc.ipi, dc.ipr]);
        if (!ct) continue;
        results.push({ kind: 'TwoTermDc', data: dc, hopLevel: ct.level, closestTerminalBus: ct.bus });
      }
    }

    if (wants('VscDc')) {
      for (const vsc of network.vscdc ?? []) {
        if (vsc.stat === 0) continue;
        const ct = closestTerminal([vsc.ibus1, vsc.ibus2]);
        if (!ct) continue;
        results.push({ kind: 'VscDc', data: vsc, hopLevel: ct.level, closestTerminalBus: ct.bus });
      }
    }

    return results;
  }
}
