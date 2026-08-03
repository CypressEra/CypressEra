/**
 * Layout + element-build Web Worker.
 *
 * Runs the (CPU-heavy) force-directed layout and element construction off the
 * main thread so the UI never freezes for large networks. Receives a
 * {@link LayoutWorkerRequest}, streams {@link LayoutWorkerProgress}, and ends
 * with a {@link LayoutWorkerResult} or {@link LayoutWorkerError}.
 *
 * Bundled by webpack 5 (react-scripts 5 / craco) via the
 * `new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })`
 * pattern in layoutClient.ts.
 */

/* eslint-disable no-restricted-globals -- `self` is the worker global scope here */
import { runLayoutAndBuild } from './layoutBuild';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './messages';

// The tsconfig `lib` includes "dom" but not "webworker", so `self` is typed as a
// Window. Narrow it to just the worker surface we use to avoid type friction.
const ctx = self as unknown as {
  postMessage: (message: LayoutWorkerResponse) => void;
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null;
};

ctx.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'compute') return;

  const { requestId, input } = msg;
  try {
    const result = runLayoutAndBuild(input, fraction => {
      ctx.postMessage({ type: 'progress', requestId, progress: fraction });
    });
    ctx.postMessage({ type: 'result', requestId, result });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
