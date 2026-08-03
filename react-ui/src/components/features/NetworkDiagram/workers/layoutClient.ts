/**
 * Main-thread client for the layout/build Web Worker.
 *
 * Responsibilities:
 * - Lazily create the worker and dispatch compute requests.
 * - Supersede: starting a new compute terminates any in-flight worker so the
 *   stale computation is truly cancelled (workers are single-threaded, so we
 *   must terminate rather than just ignore the result).
 * - Graceful degradation: if the worker can't be created or errors at runtime
 *   (e.g. a bundling issue), fall back to computing synchronously on the main
 *   thread. The layout is bounded (see ImprovedLayoutEngine) so this degrades
 *   to a brief block rather than the old hard freeze.
 */

import { runLayoutAndBuild } from './layoutBuild';
import type { LayoutBuildInput, LayoutBuildResult } from './layoutBuild';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './messages';

export interface LayoutComputeHandlers {
  onProgress?: (fraction: number) => void;
  onResult: (result: LayoutBuildResult) => void;
  onError: (message: string) => void;
}

export class LayoutComputeClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private activeRequestId: number | null = null;
  private activeInput: LayoutBuildInput | null = null;
  private handlers: LayoutComputeHandlers | null = null;
  private workerUnavailable = false;

  private createWorker(): Worker | null {
    if (this.workerUnavailable) return null;
    try {
      const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<LayoutWorkerResponse>) => this.handleMessage(e.data);
      worker.onerror = () => this.handleWorkerError();
      return worker;
    } catch {
      this.workerUnavailable = true;
      return null;
    }
  }

  private handleMessage(msg: LayoutWorkerResponse): void {
    if (msg.requestId !== this.activeRequestId) return; // superseded
    const handlers = this.handlers;
    if (!handlers) return;
    if (msg.type === 'progress') {
      handlers.onProgress?.(msg.progress);
    } else if (msg.type === 'result') {
      this.activeRequestId = null;
      handlers.onResult(msg.result);
    } else if (msg.type === 'error') {
      this.activeRequestId = null;
      handlers.onError(msg.message);
    }
  }

  private handleWorkerError(): void {
    // Worker failed to load/run — degrade to a synchronous compute for the
    // currently-active request and stop using the worker thereafter.
    this.workerUnavailable = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const requestId = this.activeRequestId;
    const input = this.activeInput;
    const handlers = this.handlers;
    if (requestId !== null && input && handlers) {
      this.runSyncFallback(requestId, input, handlers);
    }
  }

  private runSyncFallback(
    requestId: number,
    input: LayoutBuildInput,
    handlers: LayoutComputeHandlers,
  ): void {
    // Defer a tick so the caller can paint a "computing" state first.
    setTimeout(() => {
      if (this.activeRequestId !== requestId) return; // superseded
      try {
        const result = runLayoutAndBuild(input, f => {
          if (this.activeRequestId === requestId) handlers.onProgress?.(f);
        });
        if (this.activeRequestId === requestId) {
          this.activeRequestId = null;
          handlers.onResult(result);
        }
      } catch (err) {
        if (this.activeRequestId === requestId) {
          this.activeRequestId = null;
          handlers.onError(err instanceof Error ? err.message : String(err));
        }
      }
    }, 0);
  }

  /** Start a computation, superseding (and terminating) any in-flight one. */
  compute(input: LayoutBuildInput, handlers: LayoutComputeHandlers): void {
    this.handlers = handlers;
    this.activeInput = input;
    const requestId = ++this.requestId;

    // Supersede: a busy worker is processing the previous request synchronously
    // and won't pick up a new message until it finishes — so terminate it.
    if (this.activeRequestId !== null && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.activeRequestId = requestId;

    if (!this.worker && !this.workerUnavailable) {
      this.worker = this.createWorker();
    }

    if (this.worker) {
      const request: LayoutWorkerRequest = { type: 'compute', requestId, input };
      this.worker.postMessage(request);
    } else {
      this.runSyncFallback(requestId, input, handlers);
    }
  }

  /** Cancel any in-flight computation; its result will be ignored. */
  cancel(): void {
    this.activeRequestId = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /** Terminate the worker and release all resources. */
  dispose(): void {
    this.cancel();
    this.handlers = null;
    this.activeInput = null;
  }
}
