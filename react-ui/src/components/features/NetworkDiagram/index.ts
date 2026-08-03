/**
 * Network Diagram Component Exports (formerly PowerGridDiagram)
 * Professional canvas-based power system visualization
 */

// Main Network Diagram component
export { default as NetworkDiagram } from './NetworkDiagram';
export type { NetworkDiagramHandle } from '@/hooks/useNetworkDiagram';

// Export ref type from container (includes plotBuses method)
export type { NetworkDiagramRef } from './components/NetworkDiagramContainer';

// Types from the comprehensive types system
export type {
  // Basic types
  Point,
  Size,
  Bounds,
  Transform,
  // Network data types
  Bus,
  ACLine,
  Transformer,
  Load,
  Generator,
  FixedShunt,
  SwitchedShunt,
  Area,
  Zone,
  // Power flow results
  BusFlowResult,
  ACLineFlowResult,
  TransformerFlowResult,
  // Diagram types
  DiagramElement,
  BusElement,
  LineElement,
  DeviceElement,
  // Layout types
  LayoutConfig,
  LayoutNode,
  LayoutEdge,
  // Render types
  RenderStyle,
  LayerConfig,
  // Interaction types
  InteractionState,
  InteractionEvent,
  // Network data
  NetworkDataset,
  PowerFlowResults,
  // Component props
  NetworkDiagramProps,
  // MCP integration
  MCPDiagramUpdate,
} from './types/index';

// Hooks
export { useNetworkDiagram, useNetworkDiagramHandle } from '@/hooks/useNetworkDiagram';

// Utils
export {
  convertSDKNetworkData,
  convertSDKPowerFlowData,
  mergePowerFlowResults,
  validateNetworkData,
  getNetworkSummary,
} from './utils/dataConverter';

export { NetworkDataProcessor } from './utils/NetworkDataProcessor';

// Element utils
export {
  findElementAtPosition,
  findElementsInBounds,
  findElementsConnectedToBus,
  pointInBounds,
  updateElementPosition,
  distance,
  boundsCenter,
  calculateBoundingBox,
  normalizeBounds,
  boundsIntersect,
  getElementBuses,
  isBusElement,
  isLineElement,
  isDeviceElement,
} from './utils/elementUtils';

// Renderer
export { CanvasRenderer } from './renderers/CanvasRenderer';

// Element renderers
export {
  drawBus,
  drawACLine,
  drawTransformer,
  drawLoad,
  drawGenerator,
  createBusElement,
  createLineElement,
  createTransformerElement,
  createLoadElement,
  createGeneratorElement,
} from './renderers/elements';

// Factory
export { ElementFactory } from './factories/ElementFactory';

// Layout
export { LayoutEngine } from './layout/LayoutEngine';
