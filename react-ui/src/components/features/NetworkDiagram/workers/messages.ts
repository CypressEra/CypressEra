/**
 * Message protocol between the main thread and the layout/build Web Worker.
 *
 * The request carries the raw network arrays; responses stream `progress` then
 * end with exactly one terminal message (`result` or `error`). Every message
 * carries the `requestId` so the client can ignore results from superseded
 * (cancelled) computations.
 */

import type { LayoutBuildInput, LayoutBuildResult } from './layoutBuild';

/** Main thread → worker: compute layout + elements for one network. */
export interface LayoutWorkerRequest {
  type: 'compute';
  requestId: number;
  input: LayoutBuildInput;
}

/** Worker → main thread: progress update (fraction in 0..1). */
export interface LayoutWorkerProgress {
  type: 'progress';
  requestId: number;
  progress: number;
}

/** Worker → main thread: successful terminal result. */
export interface LayoutWorkerResult {
  type: 'result';
  requestId: number;
  result: LayoutBuildResult;
}

/** Worker → main thread: terminal error. */
export interface LayoutWorkerError {
  type: 'error';
  requestId: number;
  message: string;
}

export type LayoutWorkerResponse =
  | LayoutWorkerProgress
  | LayoutWorkerResult
  | LayoutWorkerError;
