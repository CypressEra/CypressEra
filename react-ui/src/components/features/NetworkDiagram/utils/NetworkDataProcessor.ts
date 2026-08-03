/**
 * Network Data Processor
 * Optimized processing of PSSE network data for visualization
 */

import {
  NetworkDataset,
  Bus,
  ACLine,
  Transformer,
  Load,
  Generator,
  ACLineFlowResult,
  TransformerFlowResult,
  BusFlowResult,
  PowerFlowResults,
} from '../types/index';

export interface ProcessedNetworkData {
  buses: Map<number, ProcessedBus>;
  lines: ProcessedLine[];
  transformers: ProcessedTransformer[];
  loads: Map<number, ProcessedLoad[]>;
  generators: Map<number, ProcessedGenerator[]>;
  topology: NetworkTopology;
}

export interface ProcessedBus {
  ibus: number;
  name?: string;
  baskv?: number;
  ide?: number;
  area?: number;
  zone?: number;
  baseKV: number;
  voltageLevel: 'ehv' | 'hv' | 'mv' | 'lv';
  busType: 'slack' | 'pv' | 'load' | 'isolated';
  hasGenerator: boolean;
  hasLoad: boolean;
  connectedBuses: number[];
  lineCount: number;
  transformerCount: number;
}

export interface ProcessedLine {
  id: string;
  ibus: number;
  jbus: number;
  ckt?: string;
  lengthKm: number;
  rating: number;
  isInService: boolean;
  voltageLevel: string;
  powerFlow?: {
    pFrom: number;
    pTo: number;
    qFrom: number;
    qTo: number;
    loading: number;
    losses: number;
  };
}

export interface ProcessedTransformer {
  id: string;
  ibus: number;
  jbus: number;
  kbus?: number;
  ckt?: string;
  isThreeWinding: boolean;
  isInService: boolean;
  rating: number;
  powerFlow?: {
    pFrom: number;
    pTo: number;
    loading: number;
    tap: number;
  };
}

export interface ProcessedLoad {
  ibus: number;
  loadid?: string;
  pl?: number;
  ql?: number;
  isInService: boolean;
}

export interface ProcessedGenerator {
  ibus: number;
  machid?: string;
  pg?: number;
  qg?: number;
  qt?: number;
  qb?: number;
  vs?: number;
  isInService: boolean;
  isRegulating: boolean;
}

export interface NetworkTopology {
  adjacencyList: Map<number, Set<number>>;
  components: number[][];
  bridges: [number, number][];
  articulationPoints: number[];
  voltageLevels: Set<number>;
}

/**
 * Process network dataset for visualization
 */
export class NetworkDataProcessor {
  private dataset: NetworkDataset | null = null;
  private processed: ProcessedNetworkData | null = null;

  constructor(dataset?: NetworkDataset) {
    if (dataset) {
      this.setDataset(dataset);
    }
  }

  /**
   * Set new dataset
   */
  setDataset(dataset: NetworkDataset): void {
    this.dataset = dataset;
    this.processed = null; // Invalidate cache
  }

  /**
   * Get processed data
   */
  getProcessed(): ProcessedNetworkData | null {
    if (this.processed) {
      return this.processed;
    }

    if (!this.dataset) {
      return null;
    }

    this.processed = this.processDataset(this.dataset);
    return this.processed;
  }

  /**
   * Process dataset
   */
  private processDataset(dataset: NetworkDataset): ProcessedNetworkData {
    const buses = this.processBuses(dataset.buses || []);
    const lines = this.processLines(dataset.aclines || [], buses);
    const transformers = this.processTransformers(dataset.transformers || [], buses);
    const loads = this.processLoads(dataset.loads || []);
    const generators = this.processGenerators(dataset.generators || []);

    // Update topology
    const topology = this.buildTopology(buses, lines, transformers);

    return {
      buses,
      lines,
      transformers,
      loads,
      generators,
      topology,
    };
  }

  /**
   * Process buses
   */
  private processBuses(buses: Bus[]): Map<number, ProcessedBus> {
    const voltageLevels = new Set<number>();

    const processed = new Map<number, ProcessedBus>();

    buses.forEach(bus => {
      const baseKV = bus.baskv || 138;
      voltageLevels.add(baseKV);

      processed.set(bus.ibus, {
        ibus: bus.ibus,
        name: bus.name,
        baskv: baseKV,
        ide: bus.ide,
        area: bus.area,
        zone: bus.zone,
        baseKV,
        voltageLevel: this.getVoltageLevelCategory(baseKV),
        busType: this.getBusType(bus.ide),
        hasGenerator: false,
        hasLoad: false,
        connectedBuses: [],
        lineCount: 0,
        transformerCount: 0,
      });
    });

    return processed;
  }

  /**
   * Process AC lines
   */
  private processLines(
    lines: ACLine[],
    buses: Map<number, ProcessedBus>
  ): ProcessedLine[] {
    return lines.map((line, index) => {
      const fromBus = buses.get(line.ibus);
      const toBus = buses.get(line.jbus);
      const voltageLevel = Math.max(
        fromBus?.baseKV || 138,
        toBus?.baseKV || 138
      );

      // Calculate length from rpu if available, else use len
      const lengthKm = line.len || 0;

      // Use rate1 as primary rating
      const rating = line.rate1 || 0;

      return {
        id: `line_${line.ibus}_${line.jbus}_${line.ckt || index}`,
        ibus: line.ibus,
        jbus: line.jbus,
        ckt: line.ckt,
        lengthKm,
        rating,
        isInService: line.stat !== 0,
        voltageLevel: voltageLevel.toString(),
      };
    });
  }

  /**
   * Process transformers
   */
  private processTransformers(
    transformers: Transformer[],
    buses: Map<number, ProcessedBus>
  ): ProcessedTransformer[] {
    return transformers.map((xfm, index) => {
      const isThreeWinding = xfm.kbus !== 0 && xfm.kbus !== undefined;

      // Use rate1 if available
      const rating = 0; // Transformers don't always have rate1

      return {
        id: `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || index}`,
        ibus: xfm.ibus,
        jbus: xfm.jbus,
        k: xfm.kbus,
        ckt: xfm.ckt,
        isThreeWinding,
        isInService: xfm.stat !== 0,
        rating,
      };
    });
  }

  /**
   * Process loads
   */
  private processLoads(loads: Load[]): Map<number, ProcessedLoad[]> {
    const byBus = new Map<number, ProcessedLoad[]>();

    loads.forEach(load => {
      const processed: ProcessedLoad = {
        ibus: load.ibus,
        loadid: load.loadid,
        pl: load.pl,
        ql: load.ql,
        isInService: load.status !== 0,
      };

      if (!byBus.has(load.ibus)) {
        byBus.set(load.ibus, []);
      }

      byBus.get(load.ibus)!.push(processed);
    });

    return byBus;
  }

  /**
   * Process generators
   */
  private processGenerators(generators: Generator[]): Map<number, ProcessedGenerator[]> {
    const byBus = new Map<number, ProcessedGenerator[]>();

    generators.forEach(gen => {
      const processed: ProcessedGenerator = {
        ibus: gen.ibus,
        machid: gen.machid,
        pg: gen.pg,
        qg: gen.qg,
        qt: gen.qt,
        qb: gen.qb,
        vs: gen.vs,
        isInService: gen.stat !== 0,
        isRegulating: gen.ireg !== undefined && gen.ireg !== 0 && gen.ireg !== gen.ibus,
      };

      if (!byBus.has(gen.ibus)) {
        byBus.set(gen.ibus, []);
      }

      byBus.get(gen.ibus)!.push(processed);
    });

    return byBus;
  }

  /**
   * Build network topology
   */
  private buildTopology(
    buses: Map<number, ProcessedBus>,
    lines: ProcessedLine[],
    transformers: ProcessedTransformer[]
  ): NetworkTopology {
    const adjacencyList = new Map<number, Set<number>>();

    // Initialize adjacency list
    buses.forEach((_, busNum) => {
      adjacencyList.set(busNum, new Set());
    });

    // Add lines to adjacency
    lines.forEach(line => {
      if (line.isInService) {
        adjacencyList.get(line.ibus)?.add(line.jbus);
        adjacencyList.get(line.jbus)?.add(line.ibus);

        // Update bus connection info
        const fromBus = buses.get(line.ibus);
        const toBus = buses.get(line.jbus);
        if (fromBus) {
          fromBus.connectedBuses.push(line.jbus);
          fromBus.lineCount++;
        }
        if (toBus) {
          toBus.connectedBuses.push(line.ibus);
          toBus.lineCount++;
        }
      }
    });

    // Add transformers to adjacency
    transformers.forEach(xfm => {
      if (xfm.isInService) {
        adjacencyList.get(xfm.ibus)?.add(xfm.jbus);
        adjacencyList.get(xfm.jbus)?.add(xfm.ibus);

        const fromBus = buses.get(xfm.ibus);
        const toBus = buses.get(xfm.jbus);
        if (fromBus) {
          fromBus.connectedBuses.push(xfm.jbus);
          fromBus.transformerCount++;
        }
        if (toBus) {
          toBus.connectedBuses.push(xfm.ibus);
          toBus.transformerCount++;
        }

        if (xfm.kbus && xfm.kbus !== 0) {
          adjacencyList.get(xfm.ibus)?.add(xfm.kbus);
          adjacencyList.get(xfm.kbus)?.add(xfm.ibus);
        }
      }
    });

    // Find connected components
    const components = this.findConnectedComponents(adjacencyList);

    // Get voltage levels
    const voltageLevels = new Set<number>();
    buses.forEach((bus) => {
      voltageLevels.add(bus.baseKV);
    });

    return {
      adjacencyList,
      components,
      bridges: [], // TODO: implement bridge finding
      articulationPoints: [], // TODO: implement articulation point finding
      voltageLevels,
    };
  }

  /**
   * Find connected components using BFS
   */
  private findConnectedComponents(
    adjacencyList: Map<number, Set<number>>
  ): number[][] {
    const visited = new Set<number>();
    const components: number[][] = [];

    adjacencyList.forEach((_, node) => {
      if (!visited.has(node)) {
        const component: number[] = [];
        const queue: number[] = [node];

        while (queue.length > 0) {
          const current = queue.shift()!;

          if (visited.has(current)) continue;
          visited.add(current);
          component.push(current);

          const neighbors = adjacencyList.get(current);
          if (neighbors) {
            neighbors.forEach(neighbor => {
              if (!visited.has(neighbor)) {
                queue.push(neighbor);
              }
            });
          }
        }

        if (component.length > 0) {
          components.push(component);
        }
      }
    });

    return components;
  }

  /**
   * Get voltage level category
   */
  private getVoltageLevelCategory(kv: number): 'ehv' | 'hv' | 'mv' | 'lv' {
    if (kv >= 345) return 'ehv';
    if (kv >= 138) return 'hv';
    if (kv >= 34.5) return 'mv';
    return 'lv';
  }

  /**
   * Get bus type from IDE code
   */
  private getBusType(ide?: number): 'slack' | 'pv' | 'load' | 'isolated' {
    switch (ide) {
      case 3:
        return 'slack';
      case 2:
        return 'pv';
      case 1:
        return 'load';
      case 4:
        return 'isolated';
      default:
        return 'load';
    }
  }

  /**
   * Update with power flow results
   */
  updateWithPowerFlowResults(
    powerFlowResults: PowerFlowResults
  ): void {
    if (!this.processed) return;

    // Update bus results
    if (powerFlowResults.busResults) {
      powerFlowResults.busResults.forEach(result => {
        const bus = this.processed!.buses.get(result.ibus);
        if (bus) {
          // Update bus with power flow data
        }
      });
    }

    // Update line results
    if (powerFlowResults.aclineResults) {
      powerFlowResults.aclineResults.forEach(result => {
        const line = this.processed!.lines.find(
          l => l.ibus === result.ibus && l.jbus === result.jbus
        );
        if (line) {
          line.powerFlow = {
            pFrom: result.p_from || 0,
            pTo: result.p_to || 0,
            qFrom: result.q_from || 0,
            qTo: result.q_to || 0,
            loading: result.loading || 0,
            losses: result.losses_mw || 0,
          };
        }
      });
    }

    // Update transformer results
    if (powerFlowResults.transformerResults) {
      powerFlowResults.transformerResults.forEach(result => {
        const xfm = this.processed!.transformers.find(
          t => t.ibus === result.ibus && t.jbus === result.jbus
        );
        if (xfm) {
          xfm.powerFlow = {
            pFrom: result.p_from || 0,
            pTo: result.p_to || 0,
            loading: result.loading || 0,
            tap: result.tap || 1,
          };
        }
      });
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalBuses: number;
    totalLines: number;
    totalTransformers: number;
    totalLoads: number;
    totalGenerators: number;
    voltageLevels: number[];
    largestComponent: number;
  } | null {
    if (!this.processed) return null;

    const { buses, lines, transformers, loads, generators, topology } = this.processed;

    return {
      totalBuses: buses.size,
      totalLines: lines.length,
      totalTransformers: transformers.length,
      totalLoads: loads.size,
      totalGenerators: generators.size,
      voltageLevels: Array.from(topology.voltageLevels).sort((a, b) => b - a),
      largestComponent: Math.max(...topology.components.map(c => c.length)),
    };
  }
}

/**
 * Convert SDK NetworkData to NetworkDataset
 */
export function networkDataToDataset(networkData: any): NetworkDataset {
  const nd = networkData.network_data || {};

  return {
    buses: nd.bus || [],
    aclines: nd.acline || [],
    transformers: nd.transformer || [],
    loads: nd.load || [],
    generators: nd.generator || [],
    fixedShunts: nd.fixshunt || [],
    switchedShunts: nd.swshunt || [],
    areas: nd.area || [],
    zones: nd.zone || [],
    caseId: nd.caseid,
  };
}
