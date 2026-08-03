/**
 * Components Module
 * Exports all NetworkDiagram components
 */

export * from './NetworkDiagramCanvas';
export * from './NetworkDiagramContainer';
// DiagramIOToolbar is no longer mounted by default — diagram I/O routes
// through the menu bar (Open / Save → Diagram / Save As → Diagram / Upload →
// Diagram) and the file-selector modal. The component is still importable
// directly from `./DiagramIOToolbar` for embedded/standalone use cases.
