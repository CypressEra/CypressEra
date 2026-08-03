/**
 * Data Aggregator Utility
 * 
 * Merges calculation results with network data
 */

/**
 * Aggregate bus calculation results into network data.
 * Supports flow-solver format (ibus, vm, va) and legacy (bus_number, voltage_mag, voltage_angle_deg).
 * @param {Array} busData - Network bus data
 * @param {Array} busResults - Calculation bus results (flow-solver: ibus, vm, va; legacy: bus_number, voltage_mag, voltage_angle_deg)
 * @returns {Array} Aggregated bus data
 */
export function aggregateBusData(busData, busResults) {
  if (!busData || !busResults) {
    console.warn('[XFlow:DataAggregator] ⚠️ Missing bus data or results for aggregation');
    return busData || [];
  }

  const resultsMap = new Map();
  busResults.forEach(result => {
    const key = result.ibus !== undefined && result.ibus !== null ? result.ibus : result.bus_number;
    if (key !== undefined && key !== null) resultsMap.set(key, result);
  });

  return busData.map(bus => {
    const result = resultsMap.get(bus.ibus);
    if (result) {
      const vm = result.vm !== undefined ? result.vm : result.voltage_mag;
      const va = result.va !== undefined ? result.va : result.voltage_angle_deg;
      return {
        ...bus,
        vm,
        va,
        net_p_injection: result.net_p_injection,
        net_q_injection: result.net_q_injection,
      };
    }
    return bus;
  });
}

/**
 * Aggregate generator_results into generator network data (flow-solver: ibus, machid, pg, qg).
 * Only in-service generators appear in generator_results; match by (ibus, machid) and update pg, qg.
 */
export function aggregateGeneratorData(generatorData, generatorResults) {
  if (!generatorData || !generatorResults) {
    return generatorData || [];
  }

  const resultsMap = new Map();
  generatorResults.forEach(result => {
    const ibus = result.ibus;
    const machid = result.machid ?? '';
    if (ibus !== undefined && ibus !== null) {
      resultsMap.set(`${ibus}_${machid}`, result);
    }
  });

  return generatorData.map(gen => {
    const machid = gen.machid ?? '';
    const key = `${gen.ibus}_${machid}`;
    const result = resultsMap.get(key);
    if (result) {
      return {
        ...gen,
        pg: result.pg,
        qg: result.qg,
      };
    }
    return gen;
  });
}

/**
 * Aggregate acline_results into AC line network data (flow-solver: ibus, jbus, ckt).
 */
export function aggregateAclineData(aclineData, aclineResults) {
  if (!aclineData || !aclineResults) {
    console.warn('[XFlow:DataAggregator] ⚠️ Missing acline data or results for aggregation');
    return aclineData || [];
  }

  const resultsMap = new Map();
  aclineResults.forEach(result => {
    const ibus = result.ibus;
    const jbus = result.jbus;
    const ckt = result.ckt ?? '1';
    if (ibus !== undefined && jbus !== undefined) {
      resultsMap.set(`${ibus}_${jbus}_${ckt}`, result);
    }
  });

  return aclineData.map(line => {
    const key = `${line.ibus}_${line.jbus}_${line.ckt || '1'}`;
    const result = resultsMap.get(key);
    if (result) {
      return {
        ...line,
        p_flow: result.p_flow,
        q_flow: result.q_flow,
        s_flow: result.s_flow,
        p_loss: result.p_loss,
        q_loss: result.q_loss,
        s_loss: result.s_loss,
      };
    }
    return line;
  });
}

/**
 * Canonical key for a transformer: sorted bus triple + ckt, so three-winding results
 * (ibus,jbus,kbus in any order) map to the same physical transformer.
 */
function transformerCanonicalKey(ibus, jbus, kbus, ckt) {
  const buses = [ibus, jbus, kbus ?? 0].filter(b => b !== undefined && b !== null).sort((a, b) => a - b);
  return buses.join('_') + '_' + (ckt ?? '1');
}

/**
 * Apply solved control state (tap_writeback) onto a transformer object so the
 * network view reflects the converged tap/angle, mirroring the warm-start
 * writeback the api-server folds into the session RAWX. Each entry updates the
 * winding's windv{N}/ang{N} (RAWX-native units), so multi-controlled 3-winding
 * transformers update every controlled winding.
 */
function applyTapWriteback(target, tapWriteback) {
  if (!Array.isArray(tapWriteback)) return;
  tapWriteback.forEach(w => {
    const n = w.winding;
    if (n === 1 || n === 2 || n === 3) {
      if (w.windv !== undefined && w.windv !== null) target[`windv${n}`] = w.windv;
      if (w.ang !== undefined && w.ang !== null) target[`ang${n}`] = w.ang;
    }
  });
}

/**
 * Aggregate transformer_results into transformer network data (flow-solver: ibus, jbus, kbus, ckt).
 * Each winding is decoupled (dummy bus added), so flows are per-winding, not between windings.
 * Two-winding: one result per transformer → p_flow_1, q_flow_1, s_flow_1, p_loss_1, q_loss_1, s_loss_1 (winding 1).
 * Three-winding: three results → p_flow_1/…/s_loss_1 (winding 1), p_flow_2/…/s_loss_2 (winding 2), p_flow_3/…/s_loss_3 (winding 3).
 */
export function aggregateTransformerData(transformerData, transformerResults) {
  if (!transformerData || !transformerResults) {
    return transformerData || [];
  }
  // Group results by canonical key (same three buses + ckt)
  const resultsByKey = new Map();
  transformerResults.forEach(result => {
    const ibus = result.ibus;
    const jbus = result.jbus;
    const kbus = result.kbus;
    const ckt = result.ckt ?? '1';
    if (ibus !== undefined && jbus !== undefined) {
      const key = transformerCanonicalKey(ibus, jbus, kbus, ckt);
      if (!resultsByKey.has(key)) resultsByKey.set(key, []);
      resultsByKey.get(key).push(result);
    }
  });

  return transformerData.map(tr => {
    const ti = tr.ibus;
    const tj = tr.jbus;
    const tk = tr.kbus;
    const ckt = tr.ckt || '1';
    const key = transformerCanonicalKey(ti, tj, tk, ckt);
    const results = resultsByKey.get(key);
    if (!results || results.length === 0) return tr;

    const isThreeWinding = tk !== undefined && tk !== null && Number(tk) !== 0;

    let merged;
    if (!isThreeWinding) {
      const r = results[0];
      merged = {
        ...tr,
        p_flow_1: r.p_flow_1,
        q_flow_1: r.q_flow_1,
        s_flow_1: r.s_flow_1,
        p_loss_1: r.p_loss_1,
        q_loss_1: r.q_loss_1,
        s_loss_1: r.s_loss_1,
      };
    } else {
      // Three-winding: one result per transformer with _1, _2, _3 per winding
      const r = results[0];
      merged = {
        ...tr,
        p_flow_1: r.p_flow_1,
        q_flow_1: r.q_flow_1,
        s_flow_1: r.s_flow_1,
        p_loss_1: r.p_loss_1,
        q_loss_1: r.q_loss_1,
        s_loss_1: r.s_loss_1,
        p_flow_2: r.p_flow_2,
        q_flow_2: r.q_flow_2,
        s_flow_2: r.s_flow_2,
        p_loss_2: r.p_loss_2,
        q_loss_2: r.q_loss_2,
        s_loss_2: r.s_loss_2,
        p_flow_3: r.p_flow_3,
        q_flow_3: r.q_flow_3,
        s_flow_3: r.s_flow_3,
        p_loss_3: r.p_loss_3,
        q_loss_3: r.q_loss_3,
        s_loss_3: r.s_loss_3,
      };
    }

    // Fold solved tap/angle (control state) into windv{N}/ang{N}, like vm/va on buses.
    results.forEach(r => applyTapWriteback(merged, r.tap_writeback));
    return merged;
  });
}

/**
 * Aggregate twotermdc_results into two-terminal DC line network data (flow-solver: ipi, ipr).
 */
export function aggregateTwotermdcData(twotermdcData, twotermdcResults) {
  if (!twotermdcData || !twotermdcResults) {
    return twotermdcData || [];
  }

  const resultsMap = new Map();
  twotermdcResults.forEach(result => {
    const ipi = result.ipi;
    const ipr = result.ipr;
    if (ipi !== undefined && ipr !== undefined) {
      resultsMap.set(`${ipi}_${ipr}`, result);
    }
  });

  return twotermdcData.map(line => {
    const key = `${line.ipi}_${line.ipr}`;
    const result = resultsMap.get(key);
    if (result) {
      const merged = {
        ...line,
        p_flow: result.p_flow,
        p_loss: result.p_loss,
      };
      // Fold solved DC tap control state into the tap fields (warm-start).
      if (result.tapr !== undefined && result.tapr !== null) merged.tapr = result.tapr;
      if (result.tapi !== undefined && result.tapi !== null) merged.tapi = result.tapi;
      return merged;
    }
    return line;
  });
}

/**
 * Aggregate vscdc_results into VSC DC network data.
 *
 * Assumptions (based on flow-solver output):
 * - Network VSC DC elements are identified by (ibus1, ibus2)
 * - Power flow results provide:
 *   - ibus1, ibus2
 *   - p_converter1, p_converter2
 *   - p_loss
 *   - q_converter1, q_converter2 (optional)
 */
export function aggregateVscdcData(vscdcData, vscdcResults) {
  if (!vscdcData || !vscdcResults) {
    return vscdcData || [];
  }

  const resultsMap = new Map();
  vscdcResults.forEach(result => {
    const { ibus1, ibus2 } = result;
    if (ibus1 !== undefined && ibus1 !== null && ibus2 !== undefined && ibus2 !== null) {
      resultsMap.set(`${ibus1}_${ibus2}`, result);
    }
  });

  return vscdcData.map(device => {
    const key = `${device.ibus1}_${device.ibus2}`;
    const result = resultsMap.get(key);
    if (!result) return device;

    return {
      ...device,
      p_converter1: result.p_converter1,
      p_converter2: result.p_converter2,
      p_loss: result.p_loss,
      q_converter1: result.q_converter1,
      q_converter2: result.q_converter2,
    };
  });
}

/**
 * Aggregate fixshunt_results into fixed shunt network data (flow-solver: ibus, shntid, stat, p, q).
 * Fixed shunts have both active power (p) from conductance (gl) and reactive power (q) from susceptance (bl).
 */
export function aggregateFixshuntData(fixshuntData, fixshuntResults) {
  if (!fixshuntData || !fixshuntResults) {
    return fixshuntData || [];
  }

  const resultsMap = new Map();
  fixshuntResults.forEach(result => {
    const ibus = result.ibus;
    const shntid = result.shntid ?? '';
    if (ibus !== undefined && ibus !== null) {
      resultsMap.set(`${ibus}_${shntid}`, result);
    }
  });

  return fixshuntData.map(shunt => {
    const shntid = shunt.shntid ?? '';
    const key = `${shunt.ibus}_${shntid}`;
    const result = resultsMap.get(key);
    if (result) {
      return {
        ...shunt,
        p: result.p,
        q: result.q,
      };
    }
    return shunt;
  });
}

/**
 * Aggregate swshunt_results into switched shunt network data (flow-solver: ibus, shntid, stat, q, active_blocks).
 * Switched shunts are purely reactive devices - only q field is displayed in network table (active_blocks excluded).
 */
export function aggregateSwshuntData(swshuntData, swshuntResults) {
  if (!swshuntData || !swshuntResults) {
    return swshuntData || [];
  }

  const resultsMap = new Map();
  swshuntResults.forEach(result => {
    const ibus = result.ibus;
    const shntid = result.shntid ?? '';
    if (ibus !== undefined && ibus !== null) {
      resultsMap.set(`${ibus}_${shntid}`, result);
    }
  });

  return swshuntData.map(shunt => {
    const shntid = shunt.shntid ?? '';
    const key = `${shunt.ibus}_${shntid}`;
    const result = resultsMap.get(key);
    if (result) {
      const merged = {
        ...shunt,
        q: result.q,
      };
      // Fold the converged total susceptance into binit (warm-start control state).
      if (result.binit_solved !== undefined && result.binit_solved !== null) {
        merged.binit = result.binit_solved;
      }
      return merged;
    }
    return shunt;
  });
}

/**
 * Aggregate all calculation results into network data
 * @param {Object} networkData - Network data object
 * @param {Object} calculationResult - Calculation result object
 * @returns {Object} Aggregated network data
 */
export function aggregateNetworkData(networkData, calculationResult) {
  if (!networkData || !calculationResult) {
    console.warn('[XFlow:DataAggregator] ⚠️ Missing network data or calculation result for aggregation');
    return networkData;
  }

  const results = calculationResult.results || calculationResult;
  const network = networkData.network_data || networkData;

  console.log('[XFlow:DataAggregator] ℹ️ Aggregating calculation results into network data...');

  const aggregatedNetwork = {
    ...networkData,
    network_data: {
      ...network,
      bus: aggregateBusData(network.bus, results.bus_results),
      acline: aggregateAclineData(network.acline, results.acline_results),
      load: network.load,
      generator: aggregateGeneratorData(network.generator, results.generator_results),
      transformer: aggregateTransformerData(network.transformer, results.transformer_results),
      twotermdc: aggregateTwotermdcData(network.twotermdc, results.twotermdc_results),
      vscdc: aggregateVscdcData(network.vscdc, results.vscdc_results),
      fixshunt: aggregateFixshuntData(network.fixshunt, results.fixshunt_results),
      swshunt: aggregateSwshuntData(network.swshunt, results.swshunt_results),
      caseid: network.caseid,
      general: network.general,
    },
  };

  console.log('[XFlow:DataAggregator] ✅ Network data aggregated successfully');
  return aggregatedNetwork;
}

/**
 * Extract aggregated bus data with results
 * @param {Object} networkData - Network data
 * @param {Object} calculationResult - Calculation results
 * @returns {Array} Bus data with voltage and injection results
 */
export function getAggregatedBuses(networkData, calculationResult) {
  const results = calculationResult?.results || calculationResult;
  const network = networkData?.network_data || networkData;
  
  return aggregateBusData(network?.bus, results?.bus_results);
}

/**
 * Extract aggregated AC line data with power flows
 * @param {Object} networkData - Network data
 * @param {Object} calculationResult - Calculation results
 * @returns {Array} AC line data with P, Q, S flows
 */
export function getAggregatedLines(networkData, calculationResult) {
  const results = calculationResult?.results || calculationResult;
  const network = networkData?.network_data || networkData;
  return aggregateAclineData(network?.acline, results?.acline_results);
}

