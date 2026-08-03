/**
 * Network Diagram Scalability Configuration
 *
 * Central knobs for the large-network rendering pipeline (off-thread layout,
 * viewport culling/LOD, aggregation). Tuned by measurement — see the
 * `scalable-network-diagram` OpenSpec change.
 */

import type { NetworkDataset } from '../types';

/**
 * Bus count at/above which a network is treated as "large" and routed through
 * the scaled pipeline (worker-based layout, aggregation, plot-all disabled).
 * Below this, the existing synchronous path is used unchanged.
 *
 * Rationale: the legacy synchronous layout/build/render path is fine for
 * hundreds-to-low-thousands of buses; it only becomes a hard freeze in the
 * tens of thousands. The exact value is provisional pending Phase-1 metrics.
 */
export const LARGE_NETWORK_BUS_THRESHOLD = 2000;

/** Coarse size summary used to pick rendering strategy and budgets. */
export interface NetworkSize {
  buses: number;
  branches: number; // aclines + transformers + DC links
  /** Total individually-renderable elements (buses + branches + devices). */
  total: number;
  /** True when at/above {@link LARGE_NETWORK_BUS_THRESHOLD}. */
  isLarge: boolean;
}

/** Length of an array-ish field, tolerant of undefined/non-array values. */
function len(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Compute a {@link NetworkSize} from a dataset. Accepts a {@link NetworkDataset}
 * or the raw API `network_data` shape (same section names), so it can be called
 * before or after conversion.
 */
export function getNetworkSize(
  data: NetworkDataset | Record<string, unknown> | null | undefined,
): NetworkSize {
  if (!data) {
    return { buses: 0, branches: 0, total: 0, isLarge: false };
  }
  const d = data as Record<string, unknown>;
  const buses = len(d.buses ?? d.bus);
  const aclines = len(d.aclines ?? d.acline);
  const transformers = len(d.transformers ?? d.transformer);
  const twotermdc = len(d.twotermdc);
  const vscdc = len(d.vscdc);
  const loads = len(d.loads ?? d.load);
  const generators = len(d.generators ?? d.generator);
  const fixedShunts = len(d.fixedShunts ?? d.fixshunt);
  const switchedShunts = len(d.switchedShunts ?? d.swshunt);

  const branches = aclines + transformers + twotermdc + vscdc;
  const total = buses + branches + loads + generators + fixedShunts + switchedShunts;

  return {
    buses,
    branches,
    total,
    isLarge: buses >= LARGE_NETWORK_BUS_THRESHOLD,
  };
}

/** Convenience predicate mirroring {@link NetworkSize.isLarge}. */
export function isLargeNetwork(
  data: NetworkDataset | Record<string, unknown> | null | undefined,
): boolean {
  return getNetworkSize(data).isLarge;
}
