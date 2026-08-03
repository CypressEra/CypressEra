/**
 * WebSocket Context Provider
 * 
 * Provides WebSocket connection to the entire app with:
 * - Automatic connection management
 * - Topic-based event subscription
 * - Real-time event handling
 */

import React, { createContext, useContext, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useWebSocket, UseWebSocketReturn, WebSocketMessage, WebSocketEventTypes } from '../hooks/useWebSocket';

// Event handler type
type EventHandler = (event: WebSocketMessage) => void;

// Context value type
interface WebSocketContextValue extends UseWebSocketReturn {
  // Add event listener for a specific event type
  addEventListener: (eventType: string, handler: EventHandler) => void;
  // Remove event listener
  removeEventListener: (eventType: string, handler: EventHandler) => void;
  // Subscribe to a session's events
  subscribeToSession: (sessionId: string) => void;
  // Unsubscribe from a session's events
  unsubscribeFromSession: (sessionId: string) => void;
  // Subscribe to a user's library-scoped events (uploads, deletes)
  subscribeToUser: (userId: string) => void;
  // Unsubscribe from a user's library-scoped events
  unsubscribeFromUser: (userId: string) => void;
  // Active session subscriptions
  sessionSubscriptions: string[];
  // Active user subscriptions
  userSubscriptions: string[];
  // Register a callback to run when the WebSocket reconnects after a drop.
  // Used by consumers to refetch state that may have changed during the
  // disconnected window — no event-replay log needed.
  registerStaleOnConnect: (cb: () => void) => () => void;
}

// Create context
const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// Stale-on-connect callback signature.
type StaleOnConnectCallback = () => void;

// Topic format helpers
const formatSessionNetworkTopic = (sessionId: string) => `session:${sessionId}:network`;
const formatSessionPowerFlowTopic = (sessionId: string) => `session:${sessionId}:powerflow`;
const formatSessionStatusTopic = (sessionId: string) => `session:${sessionId}:status`;
const formatSessionStudyFilesTopic = (sessionId: string) => `session:${sessionId}:study_files`;
const formatSessionAnalysisTopic = (sessionId: string) => `session:${sessionId}:analysis`;
const formatUserFilesTopic = (userId: string) => `user:${userId}:files`;

// Provider props
interface WebSocketProviderProps {
  children: React.ReactNode;
  /** Enable/disable WebSocket (default: true) */
  enabled?: boolean;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

/**
 * WebSocket Provider Component
 */
export function WebSocketProvider({ 
  children, 
  enabled = true,
  heartbeatInterval = 5000 
}: WebSocketProviderProps) {
  const { user, accessToken } = useAuth();
  const [eventListeners, setEventListeners] = useState<Map<string, Set<EventHandler>>>(new Map());
  const [sessionSubscriptions, setSessionSubscriptions] = useState<string[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<string[]>([]);

  // Mirror the subscription-list state into refs so subscribe/unsubscribe
  // callbacks can read the latest set WITHOUT depending on the state.
  // Without this, every subscribe() updates state → useCallback identity
  // changes → the consumer's useEffect re-runs → cleanup unsubscribes →
  // setState fires again → infinite re-render loop.
  const sessionSubscriptionsRef = useRef<string[]>([]);
  const userSubscriptionsRef = useRef<string[]>([]);
  useEffect(() => {
    sessionSubscriptionsRef.current = sessionSubscriptions;
  }, [sessionSubscriptions]);
  useEffect(() => {
    userSubscriptionsRef.current = userSubscriptions;
  }, [userSubscriptions]);
  // Stale-on-connect registry: consumers register a refetch callback; on
  // a `disconnected → connected` transition (after the initial connect) we
  // fire all of them so the client catches up on missed events.
  const staleOnConnectListenersRef = useRef<Set<StaleOnConnectCallback>>(new Set());
  const hadConnectedRef = useRef(false);

  // Mirror eventListeners into a ref so handleEvent has a stable identity.
  // Listing eventListeners in handleEvent's deps made every addEventListener
  // call recreate handleEvent → flow into useWebSocket's onEvent → into
  // connect's deps → tear down and rebuild the WebSocket. The result was a
  // gratuitous reconnect each time App.tsx (or anyone) registered a listener.
  const eventListenersRef = useRef(eventListeners);
  useEffect(() => {
    eventListenersRef.current = eventListeners;
  }, [eventListeners]);

  // Handle incoming events (stable identity — reads via ref).
  const handleEvent = useCallback((event: WebSocketMessage) => {
    const listeners = eventListenersRef.current;
    const handlers = listeners.get(event.event || '');
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
    const allHandlers = listeners.get('*');
    if (allHandlers) {
      allHandlers.forEach(handler => handler(event));
    }
  }, []);

  // Handle status changes. On a `→ connected` transition AFTER we've been
  // connected at least once in this lifetime, fire all registered stale-on-
  // connect callbacks so consumers can refetch state that may have changed
  // during the disconnected window.
  const handleStatusChange = useCallback((status: string) => {
    console.log('[WebSocket] Status:', status);
    if (status === 'connected') {
      if (hadConnectedRef.current) {
        // Reconnect: fire stale-on-connect callbacks.
        staleOnConnectListenersRef.current.forEach((cb) => {
          try {
            cb();
          } catch (err) {
            console.error('[WebSocket] stale-on-connect callback threw:', err);
          }
        });
      }
      hadConnectedRef.current = true;
    }
  }, []);

  // Register a stale-on-connect callback. Returns an unregister function.
  const registerStaleOnConnect = useCallback((cb: StaleOnConnectCallback) => {
    staleOnConnectListenersRef.current.add(cb);
    return () => {
      staleOnConnectListenersRef.current.delete(cb);
    };
  }, []);

  // Handle errors
  const handleError = useCallback((error: Event) => {
    console.error('[WebSocket] Error:', error);
  }, []);

  // WebSocket hook
  const ws = useWebSocket({
    token: user ? accessToken : null,
    enabled: enabled && !!user,
    heartbeatInterval,
    onEvent: handleEvent,
    onStatusChange: handleStatusChange,
    onError: handleError,
  });

  // Add event listener
  const addEventListener = useCallback((eventType: string, handler: EventHandler) => {
    setEventListeners(prev => {
      const next = new Map(prev);
      const handlers = next.get(eventType) || new Set();
      handlers.add(handler);
      next.set(eventType, handlers);
      return next;
    });
  }, []);

  // Remove event listener
  const removeEventListener = useCallback((eventType: string, handler: EventHandler) => {
    setEventListeners(prev => {
      const next = new Map(prev);
      const handlers = next.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          next.delete(eventType);
        }
      }
      return next;
    });
  }, []);

  // Subscribe to session events
  const subscribeToSession = useCallback((sessionId: string) => {
    if (sessionSubscriptionsRef.current.includes(sessionId)) return;

    setSessionSubscriptions(prev =>
      prev.includes(sessionId) ? prev : [...prev, sessionId],
    );

    // Subscribe to all session topics
    ws.subscribe(formatSessionNetworkTopic(sessionId));
    ws.subscribe(formatSessionPowerFlowTopic(sessionId));
    ws.subscribe(formatSessionStatusTopic(sessionId));
    ws.subscribe(formatSessionStudyFilesTopic(sessionId));
    ws.subscribe(formatSessionAnalysisTopic(sessionId));
  }, [ws]);

  // Unsubscribe from session events
  const unsubscribeFromSession = useCallback((sessionId: string) => {
    setSessionSubscriptions(prev => prev.filter(id => id !== sessionId));

    // Unsubscribe from all session topics
    ws.unsubscribe(formatSessionNetworkTopic(sessionId));
    ws.unsubscribe(formatSessionPowerFlowTopic(sessionId));
    ws.unsubscribe(formatSessionStatusTopic(sessionId));
    ws.unsubscribe(formatSessionStudyFilesTopic(sessionId));
    ws.unsubscribe(formatSessionAnalysisTopic(sessionId));
  }, [ws]);

  // Subscribe to user-library events (uploads/deletes affect ALL sessions for
  // a user, so the topic lives outside the session class).
  const subscribeToUser = useCallback((userId: string) => {
    if (userSubscriptionsRef.current.includes(userId)) return;
    setUserSubscriptions(prev =>
      prev.includes(userId) ? prev : [...prev, userId],
    );
    ws.subscribe(formatUserFilesTopic(userId));
  }, [ws]);

  const unsubscribeFromUser = useCallback((userId: string) => {
    setUserSubscriptions(prev => prev.filter(id => id !== userId));
    ws.unsubscribe(formatUserFilesTopic(userId));
  }, [ws]);

  // Auto-subscribe to the logged-in user's library topic.
  //
  // We deliberately don't list subscribeToUser/unsubscribeFromUser in the
  // deps. Their identities change on every render (they depend on `ws`,
  // which `useWebSocket` returns as a fresh object each render). Listing
  // them would re-run this effect on every render → cleanup → setState in
  // unsubscribeFromUser → re-render → infinite loop. The functions are
  // idempotent (subscribeToUser has a ref guard), so reading the latest
  // via refs is safe.
  const subscribeToUserRef = useRef(subscribeToUser);
  const unsubscribeFromUserRef = useRef(unsubscribeFromUser);
  useEffect(() => {
    subscribeToUserRef.current = subscribeToUser;
    unsubscribeFromUserRef.current = unsubscribeFromUser;
  }, [subscribeToUser, unsubscribeFromUser]);

  useEffect(() => {
    if (!user?.id || !ws.isConnected) return;
    subscribeToUserRef.current(user.id);
    return () => {
      unsubscribeFromUserRef.current(user.id);
    };
  }, [user?.id, ws.isConnected]);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      setEventListeners(new Map());
    };
  }, []);

  // Context value
  const value = useMemo<WebSocketContextValue>(() => ({
    ...ws,
    addEventListener,
    removeEventListener,
    subscribeToSession,
    unsubscribeFromSession,
    subscribeToUser,
    unsubscribeFromUser,
    sessionSubscriptions,
    userSubscriptions,
    registerStaleOnConnect,
  }), [ws, addEventListener, removeEventListener, subscribeToSession, unsubscribeFromSession, subscribeToUser, unsubscribeFromUser, sessionSubscriptions, userSubscriptions, registerStaleOnConnect]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context
 */
export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

/**
 * Hook to subscribe to a specific event type
 */
export function useWebSocketEvent(eventType: string, handler: EventHandler) {
  const { addEventListener, removeEventListener } = useWebSocketContext();

  useEffect(() => {
    addEventListener(eventType, handler);
    return () => {
      removeEventListener(eventType, handler);
    };
  }, [eventType, handler, addEventListener, removeEventListener]);
}

/**
 * Hook to run a refetch callback when the WebSocket reconnects after a drop.
 * The callback runs once per reconnect (not on the initial connect). It's
 * the canonical way for a consumer to "catch up" on state that may have
 * changed during the disconnected window without needing event replay.
 */
export function useStaleOnConnect(callback: () => void) {
  const { registerStaleOnConnect } = useWebSocketContext();
  useEffect(() => {
    const unregister = registerStaleOnConnect(callback);
    return unregister;
  }, [callback, registerStaleOnConnect]);
}

/**
 * Hook to manage session subscriptions.
 *
 * subscribeToSession / unsubscribeFromSession come from a context value
 * that's re-created every render (useWebSocket returns a fresh object
 * each time, which forces the context useMemo to recompute). Listing them
 * in deps causes an infinite re-render loop. We read them via refs and
 * only re-run when the inputs that actually matter — sessionId and the
 * connection state — change.
 */
export function useSessionSubscription(sessionId: string | null) {
  const { subscribeToSession, unsubscribeFromSession, isConnected } = useWebSocketContext();

  const subscribeRef = useRef(subscribeToSession);
  const unsubscribeRef = useRef(unsubscribeFromSession);
  useEffect(() => {
    subscribeRef.current = subscribeToSession;
    unsubscribeRef.current = unsubscribeFromSession;
  }, [subscribeToSession, unsubscribeFromSession]);

  useEffect(() => {
    if (sessionId && isConnected) {
      subscribeRef.current(sessionId);
      return () => {
        unsubscribeRef.current(sessionId);
      };
    }
  }, [sessionId, isConnected]);
}

// Export event types
export { WebSocketEventTypes };

export default WebSocketContext;
