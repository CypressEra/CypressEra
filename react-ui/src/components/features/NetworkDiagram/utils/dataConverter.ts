/**
 * Data Converter Utilities
 * Convert between SDK data formats and diagram formats
 */

import { NetworkData, PowerFlowData } from '@/sdk/types/index';
import { NetworkDataset, PowerFlowResults } from '../types/index';

/**
 * Convert SDK NetworkData to NetworkDataset
 *
 * The SDK returns data nested under network_data with field names like 'k' for transformers.
 * This flattens the structure and renames fields where needed to match PSSE conventions.
 */
export function convertSDKNetworkData(networkData: NetworkData): NetworkDataset {
  const nd = networkData.network_data || {};

  return {
    // Direct pass-through where structure matches - automatically includes all fields
    buses: nd.bus || [],
    aclines: nd.acline || [],
    twotermdc: nd.twotermdc || [],
    vscdc: (nd as any).vscdc || [],
    loads: nd.load || [],
    generators: nd.generator || [],

    // Transformers - pass through directly (SDK already uses kbus)
    transformers: nd.transformer || [],

    // Shunts (not yet in SDK types, use any cast)
    fixedShunts: (nd as any).fixshunt || [],
    switchedShunts: (nd as any).swshunt || [],

    // Optional fields (not yet in SDK types)
    areas: (nd as any).area || [],
    zones: (nd as any).zone || [],
    caseId: nd.caseid,
  };
}

/**
 * Convert SDK PowerFlowData to PowerFlowResults
 *
 * The SDK returns power flow results with field names matching the analysis output.
 * This converts them to the diagram's expected format.
 *
 * SDK format: { p_flow, q_flow, s_flow, p_loss, q_loss, s_loss }
 * Diagram format: { p_from, q_from, p_to, q_to, loading, losses_mw, losses_mvar }
 */
export function convertSDKPowerFlowData(powerFlowData: PowerFlowData): PowerFlowResults {
  return {
    // Direct pass-through for bus results - fields match
    busResults: powerFlowData.bus_results || [],

    // Convert generator results from SDK format to diagram format
    generatorResults: (powerFlowData.generator_results || []).map((result: any) => ({
      ibus: result.ibus,
      machid: result.machid,
      pg: result.pg,
      qg: result.qg,
    })),

    // Convert AC line results from SDK format to diagram format
    aclineResults: (powerFlowData.acline_results || []).map((result: any) => ({
      ibus: result.ibus,
      jbus: result.jbus,
      ckt: result.ckt,
      // SDK uses p_flow (net flow from ibus to jbus)
      // Map to p_from for the diagram renderer
      p_from: result.p_flow ?? 0,
      q_from: result.q_flow ?? 0,
      p_to: -(result.p_flow ?? 0), // Negative of p_from
      q_to: -(result.q_flow ?? 0), // Approximation
      loading: result.s_flow ? (result.s_flow / 100) * 100 : undefined, // Assume 100 MVA base for now
      losses_mw: result.p_loss,
      losses_mvar: result.q_loss,
    })),

    // Convert transformer results similarly
    transformerResults: (powerFlowData.transformer_results || []).map((result: any) => ({
      ibus: result.ibus,
      jbus: result.jbus,
      k: result.kbus ?? result.k,  // Handle both kbus (from SDK) and k (standard format)
      ckt: result.ckt,
      // For two-winding transformers (kbus/k is undefined or 0)
      ...(result.kbus === 0 || result.kbus === undefined ? {
        p_from: result.p_flow_1 ?? 0,
        q_from: result.q_flow_1 ?? 0,
        p_to: result.p_flow_2 ?? 0,
        q_to: result.q_flow_2 ?? 0,
      } : {}),
      // For three-winding transformers, include all three winding flows
      ...(result.kbus && result.kbus > 0 ? {
        p_flow_1: result.p_flow_1 ?? 0,
        q_flow_1: result.q_flow_1 ?? 0,
        p_flow_2: result.p_flow_2 ?? 0,
        q_flow_2: result.q_flow_2 ?? 0,
        p_flow_3: result.p_flow_3 ?? 0,
        q_flow_3: result.q_flow_3 ?? 0,
      } : {}),
      loading: result.s_flow_1 ? (result.s_flow_1 / 100) * 100 : undefined,
    })),

    // Pass through two-terminal DC results (ipi, ipr, p_flow, p_loss)
    twotermdcResults: ((powerFlowData as any).twotermdc_results || []).map((result: any) => ({
      ipi: result.ipi,
      ipr: result.ipr,
      p_flow: result.p_flow ?? 0,
      p_loss: result.p_loss,
    })),

    // Pass through VSC DC link results
    vscdcResults: ((powerFlowData as any).vscdc_results || []).map((result: any) => ({
      ibus1: result.ibus1,
      ibus2: result.ibus2,
      p_converter1: result.p_converter1 ?? 0,
      p_converter2: result.p_converter2 ?? 0,
      p_loss: result.p_loss,
      q_converter1: result.q_converter1,
      q_converter2: result.q_converter2,
    })),

    // Pass through fixed shunt results
    fixshuntResults: ((powerFlowData as any).fixshunt_results || []).map((result: any) => ({
      ibus: result.ibus,
      shntid: result.shntid,
      stat: result.stat,
      p: result.p,
      q: result.q,
    })),

    // Pass through switched shunt results
    swshuntResults: ((powerFlowData as any).swshunt_results || []).map((result: any) => ({
      ibus: result.ibus,
      shntid: result.shntid,
      stat: result.stat,
      q: result.q,
      active_blocks: result.active_blocks,
    })),

    converged: powerFlowData.converged,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Merge power flow results into network dataset
 */
export function mergePowerFlowResults(
  dataset: NetworkDataset,
  results: PowerFlowResults
): NetworkDataset {
  const merged = { ...dataset };

  // Merge bus results
  if (results.busResults) {
    merged.buses = merged.buses.map(bus => {
      const result = results.busResults?.find(r => r.ibus === bus.ibus);
      return result ? { ...bus, ...result } : bus;
    });
  }

  // Merge line results
  if (results.aclineResults) {
    merged.aclines = merged.aclines.map(line => {
      const result = results.aclineResults?.find(
        r => r.ibus === line.ibus && r.jbus === line.jbus && r.ckt === line.ckt
      );
      return result ? { ...line, ...result } : line;
    });
  }

  // Merge transformer results
  if (results.transformerResults) {
    merged.transformers = merged.transformers.map(xfm => {
      const result = results.transformerResults?.find(
        r => r.ibus === xfm.ibus && r.jbus === xfm.jbus && r.ckt === xfm.ckt
      );
      return result ? { ...xfm, ...result } : xfm;
    });
  }

  return merged;
}

/**
 * Validate network data
 */
export function validateNetworkData(dataset: NetworkDataset): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required data
  if (!dataset.buses || dataset.buses.length === 0) {
    errors.push('No buses defined in network data');
  }

  if (!dataset.aclines && !dataset.transformers) {
    warnings.push('No branches (lines or transformers) defined');
  }

  // Check for duplicate bus numbers
  const busNumbers = new Set<number>();
  dataset.buses?.forEach(bus => {
    if (busNumbers.has(bus.ibus)) {
      errors.push(`Duplicate bus number: ${bus.ibus}`);
    }
    busNumbers.add(bus.ibus);
  });

  // Check for references to non-existent buses
  const referencedBuses = new Set<number>();

  dataset.aclines?.forEach(line => {
    referencedBuses.add(line.ibus);
    referencedBuses.add(line.jbus);
  });

  dataset.twotermdc?.forEach(line => {
    referencedBuses.add(line.ipi);
    referencedBuses.add(line.ipr);
  });

  dataset.transformers?.forEach(xfm => {
    referencedBuses.add(xfm.ibus);
    referencedBuses.add(xfm.jbus);
    if (xfm.kbus) referencedBuses.add(xfm.kbus);
  });

  dataset.loads?.forEach(load => {
    referencedBuses.add(load.ibus);
  });

  dataset.generators?.forEach(gen => {
    referencedBuses.add(gen.ibus);
  });

  referencedBuses.forEach(busNum => {
    if (!busNumbers.has(busNum)) {
      warnings.push(`Reference to non-existent bus: ${busNum}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get network summary statistics
 */
export function getNetworkSummary(dataset: NetworkDataset): {
  totalBuses: number;
  totalBranches: number;
  totalLoads: number;
  totalGenerators: number;
  voltageLevels: number[];
  areas: number[];
  zones: number[];
} {
  const voltageLevels = new Set<number>();
  const areas = new Set<number>();
  const zones = new Set<number>();

  dataset.buses?.forEach(bus => {
    if (bus.baskv) voltageLevels.add(bus.baskv);
    if (bus.area) areas.add(bus.area);
    if (bus.zone) zones.add(bus.zone);
  });

  return {
    totalBuses: dataset.buses?.length || 0,
    totalBranches: (dataset.aclines?.length || 0) + (dataset.transformers?.length || 0),
    totalLoads: dataset.loads?.length || 0,
    totalGenerators: dataset.generators?.length || 0,
    voltageLevels: Array.from(voltageLevels).sort((a, b) => b - a),
    areas: Array.from(areas).sort((a, b) => a - b),
    zones: Array.from(zones).sort((a, b) => a - b),
  };
}
