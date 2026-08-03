/**
 * Shared power-flow result merging.
 *
 * Updates generator / fixed-shunt / switched-shunt element `data` in place with
 * solved values (pg/qg, q). Used by every code path that needs results on the
 * diagram — legacy in-place update, legacy after-build, and the worker-result
 * path — so the merge logic lives in exactly one place.
 */

import type { DiagramElement, PowerFlowResults } from '../types';

/**
 * Merge power-flow results into the given elements, mutating element `data`.
 * @returns true if any element was updated.
 */
export function mergePowerFlowIntoElements(
  elements: Map<string, DiagramElement>,
  powerFlowResults: PowerFlowResults | null | undefined,
): boolean {
  if (!powerFlowResults) return false;
  let hasUpdates = false;

  // Generators: keyed by `${ibus}_${machid||'0'}`
  if (powerFlowResults.generatorResults && powerFlowResults.generatorResults.length > 0) {
    const genResultsMap = new Map<string, { pg?: number; qg?: number }>();
    powerFlowResults.generatorResults.forEach(result => {
      genResultsMap.set(`${result.ibus}_${result.machid || '0'}`, { pg: result.pg, qg: result.qg });
    });

    elements.forEach(element => {
      if (element.type === 'generator') {
        const genData = element.data as any;
        const results = genResultsMap.get(`${genData.ibus}_${genData.machid || '0'}`);
        if (results) {
          genData.pg = results.pg ?? genData.pg;
          genData.qg = results.qg ?? genData.qg;
          hasUpdates = true;
        }
      }
    });
  }

  // Fixed shunts: keyed by `${ibus}_${shntid||''}`
  if (powerFlowResults.fixshuntResults && powerFlowResults.fixshuntResults.length > 0) {
    const fixshuntResultsMap = new Map<string, { q?: number }>();
    powerFlowResults.fixshuntResults.forEach(result => {
      fixshuntResultsMap.set(`${result.ibus}_${result.shntid || ''}`, { q: result.q });
    });

    elements.forEach(element => {
      if (element.type === 'fixed_shunt') {
        const shuntData = element.data as any;
        const results = fixshuntResultsMap.get(`${shuntData.ibus}_${shuntData.shntid || ''}`);
        if (results && results.q !== undefined) {
          shuntData.q = results.q;
          hasUpdates = true;
        }
      }
    });
  }

  // Switched shunts: results use shntid; element identifier may be swid or shntid
  if (powerFlowResults.swshuntResults && powerFlowResults.swshuntResults.length > 0) {
    const swshuntResultsMap = new Map<string, { q?: number }>();
    powerFlowResults.swshuntResults.forEach(result => {
      swshuntResultsMap.set(`${result.ibus}_${result.shntid || ''}`, { q: result.q });
    });

    elements.forEach(element => {
      if (element.type === 'switched_shunt') {
        const shuntData = element.data as any;
        const results = swshuntResultsMap.get(`${shuntData.ibus}_${shuntData.swid || shuntData.shntid || ''}`);
        if (results && results.q !== undefined) {
          shuntData.q = results.q;
          hasUpdates = true;
        }
      }
    });
  }

  return hasUpdates;
}
