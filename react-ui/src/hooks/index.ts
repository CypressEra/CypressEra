/**
 * Custom React Hooks
 */

export { usePowerFlowSDK } from './usePowerFlowSDK';
export { useTranslation } from './useTranslation';
export { useNotification } from './useNotification';
export type { NotificationType } from './useNotification';
export { useFileSelector } from './useFileSelector';
export type { UseFileSelectorOptions } from './useFileSelector';
export { useUndoRedo } from './useUndoRedo';
export type { UseUndoRedoOptions, UseUndoRedoReturn } from './useUndoRedo';

// NetworkDiagram integration hook
export { useNetworkDiagram, useNetworkDiagramHandle } from './useNetworkDiagram';
export type { NetworkDiagramHandle, UseNetworkDiagramOptions } from './useNetworkDiagram';

// WebSocket hook
export { useWebSocket, WebSocketEventTypes } from './useWebSocket';
export type {
  WebSocketMessage,
  ConnectionStatus,
  UseWebSocketOptions,
  UseWebSocketReturn
} from './useWebSocket';

// Platform version + build channel (fetched from /api/version, refreshes on window focus)
export { useVersion } from './useVersion';
export type { PlatformInfo } from './useVersion';

// Invalidation events (server-published state-change notifications)
export { useInvalidationEvent } from './useInvalidationEvent';
export type {
  InvalidationEventPayload,
  InvalidationHandler,
  UseInvalidationEventOptions,
} from './useInvalidationEvent';
