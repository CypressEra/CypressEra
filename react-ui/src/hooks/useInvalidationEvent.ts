/**
 * useInvalidationEvent
 *
 * Subscribes to a server-published "invalidation" WebSocket event and invokes
 * a refetch callback when it arrives. The event payload tells us WHAT changed
 * (kinds, file_types, …); the refetch function decides what to do with that.
 *
 * Self-skip: when the UI sent a mutating request with an `X-Request-Id`
 * header, the server echoes that id into the event payload as
 * `payload.request_id`. Callers can pass a `seenRequestIds` Set of ids they
 * themselves originated; those events will be skipped (the UI already
 * optimistically applied the change). Pass `undefined` to always refetch.
 *
 * The hook is a thin wrapper over `WebSocketContext.addEventListener` so the
 * lifecycle (mount/unmount) is handled cleanly.
 */

import { useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import type { WebSocketMessage } from './useWebSocket';

export interface InvalidationEventPayload {
  source?: 'ui' | 'agent' | 'system';
  request_id?: string;
  // The rest of the payload is event-type-specific (kinds, file_types, …).
  [key: string]: unknown;
}

export type InvalidationHandler = (
  payload: InvalidationEventPayload,
  event: WebSocketMessage,
) => void;

export interface UseInvalidationEventOptions {
  /**
   * If provided, events whose `payload.request_id` is present in this set
   * will be skipped — the UI already initiated and optimistically applied
   * the change. The hook does not mutate this set.
   */
  seenRequestIds?: Set<string>;
  /**
   * If `false`, the hook is registered but does nothing. Useful for guarding
   * by feature flag or auth state without conditional hook calls.
   */
  enabled?: boolean;
}

export function useInvalidationEvent(
  eventType: string,
  handler: InvalidationHandler,
  options: UseInvalidationEventOptions = {},
): void {
  const { addEventListener, removeEventListener } = useWebSocketContext();
  const { seenRequestIds, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const wrapped = (event: WebSocketMessage) => {
      const payload = (event.payload ?? {}) as InvalidationEventPayload;
      const reqId = payload.request_id;
      if (reqId && seenRequestIds?.has(reqId)) {
        // Self-originated; the UI already updated.
        return;
      }
      handler(payload, event);
    };

    addEventListener(eventType, wrapped);
    return () => {
      removeEventListener(eventType, wrapped);
    };
  }, [eventType, handler, enabled, seenRequestIds, addEventListener, removeEventListener]);
}
