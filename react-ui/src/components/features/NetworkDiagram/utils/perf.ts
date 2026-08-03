/**
 * Lightweight performance instrumentation for the network diagram pipeline.
 *
 * Enabled when `localStorage.xflowPerf === '1'` (or `window.__XFLOW_PERF__`),
 * so it costs nothing in normal use and can be toggled at runtime from the
 * browser console:
 *
 *   localStorage.xflowPerf = '1'   // enable, then reload
 *   localStorage.removeItem('xflowPerf')  // disable
 *
 * Works on the main thread and inside Web Workers (both expose `performance`).
 */

function perfEnabled(): boolean {
  try {
    // Worker scope has no localStorage; fall back to a global flag.
    const g = globalThis as unknown as { __XFLOW_PERF__?: boolean; localStorage?: Storage };
    if (g.__XFLOW_PERF__) return true;
    return g.localStorage?.getItem('xflowPerf') === '1';
  } catch {
    return false;
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/**
 * Time a synchronous block. Returns the callback's result; logs elapsed ms with
 * optional context fields when instrumentation is enabled.
 */
export function perfMeasure<T>(label: string, fn: () => T, context?: Record<string, unknown>): T {
  if (!perfEnabled()) return fn();
  const start = now();
  try {
    return fn();
  } finally {
    const ms = now() - start;
    // eslint-disable-next-line no-console
    console.log(`[xflow-perf] ${label}: ${ms.toFixed(1)}ms`, context ?? '');
  }
}

/** Returns a `stop()` that logs elapsed ms when called (for async/multi-step spans). */
export function perfStart(label: string, context?: Record<string, unknown>): () => number {
  const start = now();
  return () => {
    const ms = now() - start;
    if (perfEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[xflow-perf] ${label}: ${ms.toFixed(1)}ms`, context ?? '');
    }
    return ms;
  };
}

/** True when perf logging is on — guard expensive metric collection with this. */
export const isPerfEnabled = perfEnabled;
