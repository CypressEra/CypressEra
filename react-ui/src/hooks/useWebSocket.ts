/**
 * WebSocket Connection Manager Hook
 * 
 * Provides WebSocket connection management with:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat mechanism (configurable interval)
 * - Topic-based subscription
 * - Connection status tracking
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WS_BASE_URL } from '../config/api';
import { getAccessToken, getRefreshToken, willExpireSoon } from '../auth/tokenStore';
import { refreshTokens } from '../auth/refresh';

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  topic?: string;
  event?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

// WebSocket event types (matching server)
export const WebSocketEventTypes = {
  NETWORK_UPDATED: 'network:updated',
  NETWORK_ADDED: 'network:added',
  NETWORK_DELETED: 'network:deleted',
  POWERFLOW_STARTED: 'powerflow:started',
  POWERFLOW_COMPLETED: 'powerflow:completed',
  POWERFLOW_FAILED: 'powerflow:failed',
  SESSION_CREATED: 'session:created',
  SESSION_DELETED: 'session:deleted',
  SESSION_STATUS: 'session:status',
  // Invalidation events — the server tells us "this slice changed, refetch
  // if you care." Payload identifies what changed; the new state comes from
  // the existing REST endpoints.
  STUDY_FILES_UPDATED: 'study_files:updated',
  USER_FILES_UPDATED: 'user_files:updated',
  ANALYSIS_STARTED: 'analysis:started',
  ANALYSIS_COMPLETED: 'analysis:completed',
  ANALYSIS_FAILED: 'analysis:failed',
  ANALYSIS_CANCELLED: 'analysis:cancelled',
} as const;

// Connection status
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Configuration options
export interface UseWebSocketOptions {
  /** JWT token for authentication */
  token: string | null;
  /** Heartbeat interval in milliseconds (default: 5000) */
  heartbeatInterval?: number;
  /** Maximum reconnection attempts (default: 10, 0 = unlimited) */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in milliseconds (default: 1000) */
  initialReconnectDelay?: number;
  /** Maximum reconnection delay in milliseconds (default: 30000) */
  maxReconnectDelay?: number;
  /** Enable/disable WebSocket (default: true) */
  enabled?: boolean;
  /** Callback when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Callback when an event is received */
  onEvent?: (event: WebSocketMessage) => void;
  /** Callback when an error occurs */
  onError?: (error: Event) => void;
}

// Return type
export interface UseWebSocketReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Subscribe to a topic */
  subscribe: (topic: string) => void;
  /** Unsubscribe from a topic */
  unsubscribe: (topic: string) => void;
  /** Send a message */
  send: (message: WebSocketMessage) => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect */
  disconnect: () => void;
  /** Active subscriptions */
  subscriptions: string[];
}

/**
 * WebSocket connection manager hook
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    token,
    heartbeatInterval = 5000,
    maxReconnectAttempts = 10,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000,
    enabled = true,
    onStatusChange,
    onEvent,
    onError,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [subscriptions, setSubscriptions] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Mirror of `subscriptions` state in a ref so `connect` can read the latest
  // list on (re)connect without `subscriptions` being a dependency of the
  // useCallback. If it were a dep, every subscribe() would recreate connect,
  // re-run the mount effect, tear down and reopen the WebSocket — causing a
  // brutal connect/disconnect loop on startup when N consumers subscribe.
  const subscriptionsRef = useRef<string[]>([]);
  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Update status and notify
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    if (!mountedRef.current) return;
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  // Send heartbeat
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
      heartbeatTimeoutRef.current = setTimeout(sendHeartbeat, heartbeatInterval);
    }
  }, [heartbeatInterval]);

  // Connect to WebSocket. If the cached access token will expire within 60s
  // and a refresh token exists, refresh first so we don't connect with a token
  // that's about to fail mid-stream. Reconnect-after-disconnect uses the same
  // path and benefits identically.
  const connect = useCallback(async () => {
    if (!enabled || !token || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    clearTimers();
    updateStatus('connecting');

    let connectToken: string = token;
    if (getRefreshToken() && willExpireSoon(60_000)) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        connectToken = refreshed.access;
      } else {
        // Refresh failed; fall back to the central store. If it's also gone,
        // AuthProvider has already opened the LoginModal via the broadcast.
        connectToken = getAccessToken() || token;
      }
      if (!mountedRef.current) return;
    }

    try {
      const wsUrl = `${WS_BASE_URL}/ws?token=${encodeURIComponent(connectToken)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;

        updateStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Resubscribe to topics. Read from the ref so the latest list is used
        // (the state may have grown via subscribe() since connect ran).
        subscriptionsRef.current.forEach(topic => {
          ws.send(JSON.stringify({ type: 'subscribe', topic, timestamp: new Date().toISOString() }));
        });

        // Start heartbeat
        heartbeatTimeoutRef.current = setTimeout(sendHeartbeat, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          // Handle different message types
          switch (message.type) {
            case 'pong':
              // Heartbeat response
              break;
            case 'subscribed':
              // Subscription confirmation
              break;
            case 'unsubscribed':
              // Unsubscription confirmation
              break;
            case 'event':
              // Event from server
              onEvent?.(message);
              break;
            case 'error':
              console.error('WebSocket error:', message);
              break;
            default:
              // Unknown message type, still pass to callback
              onEvent?.(message);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        
        updateStatus('error');
        onError?.(error);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        clearTimers();
        updateStatus('disconnected');

        // Attempt reconnection
        if (enabled && (maxReconnectAttempts === 0 || reconnectAttemptsRef.current < maxReconnectAttempts)) {
          const delay = Math.min(
            initialReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
            maxReconnectDelay
          );
          
          reconnectAttemptsRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      updateStatus('error');
      console.error('Failed to create WebSocket connection:', error);
    }
    // `subscriptions` is intentionally NOT in the deps — it's read via
    // `subscriptionsRef` so the socket isn't torn down every time a consumer
    // subscribes to a new topic.
  }, [enabled, token, clearTimers, updateStatus, sendHeartbeat, heartbeatInterval, maxReconnectAttempts, initialReconnectDelay, maxReconnectDelay, onEvent, onError]);

  // Disconnect
  const disconnect = useCallback(() => {
    clearTimers();
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnection
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    updateStatus('disconnected');
  }, [clearTimers, maxReconnectAttempts, updateStatus]);

  // Reconnect
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // Subscribe to a topic
  const subscribe = useCallback((topic: string) => {
    if (!mountedRef.current) return;

    setSubscriptions(prev => {
      if (prev.includes(topic)) return prev;
      return [...prev, topic];
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', topic, timestamp: new Date().toISOString() }));
    }
  }, []);

  // Unsubscribe from a topic
  const unsubscribe = useCallback((topic: string) => {
    if (!mountedRef.current) return;

    setSubscriptions(prev => prev.filter(t => t !== topic));

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', topic, timestamp: new Date().toISOString() }));
    }
  }, []);

  // Send a message
  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect on mount and when token changes
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && token) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, token, connect, clearTimers]);

  // Memoize the return so consumers see a stable identity when nothing has
  // changed. Without this, the WebSocketContext's useMemo (which depends on
  // `ws`) recomputed every render — invalidating every downstream callback
  // and effect, which cascaded into infinite re-render loops in
  // useSessionSubscription / auto-subscribe-to-user / etc.
  return useMemo(
    () => ({
      status,
      isConnected: status === 'connected',
      subscribe,
      unsubscribe,
      send,
      reconnect,
      disconnect,
      subscriptions,
    }),
    [status, subscribe, unsubscribe, send, reconnect, disconnect, subscriptions],
  );
}

export default useWebSocket;
