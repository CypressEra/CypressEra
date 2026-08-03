/**
 * Network Diagram Component (formerly PowerGridDiagram)
 * Canvas-based visualization for power system networks with context menu support
 *
 * This component has been refactored to follow commercial best practices:
 * - Configuration is centralized in the config/ directory
 * - Complex logic is extracted to custom hooks in hooks/
 * - Interaction logic is in interaction/ handlers
 * - Rendering logic is in controllers/ and renderers/
 * - Component is split into smaller, focused components
 *
 * @version 2.0.0 Refactored Architecture
 */

import { forwardRef } from 'react';
import { NetworkDiagramProps } from './types';
import { NetworkDiagramContainer } from './components/NetworkDiagramContainer';
import type { NetworkDiagramRef } from './components/NetworkDiagramContainer';

/**
 * NetworkDiagram Component
 *
 * A commercial-grade canvas-based visualization component for power system networks.
 * Features include:
 * - Interactive pan and zoom with smooth animations
 * - Element selection and lasso selection
 * - Drag and drop element positioning with connection point tracking
 * - Context menu with element-specific actions
 * - Theme support (light, dark)
 * - Responsive design with automatic resize handling
 * - Export to PNG functionality
 *
 * @example
 * ```tsx
 * <NetworkDiagram
 *   data={networkData}
 *   theme="light"
 *   interactive={true}
 *   onElementClick={(element) => console.log('Clicked:', element)}
 *   onSelectionChange={(elements) => console.log('Selected:', elements)}
 * />
 * ```
 */
export const NetworkDiagram = forwardRef<NetworkDiagramRef, NetworkDiagramProps>((props, ref) => {
  return <NetworkDiagramContainer {...props} ref={ref} />;
});

NetworkDiagram.displayName = 'NetworkDiagram';

export default NetworkDiagram;

// Re-export types for convenience
export type {
  Point,
  Bounds,
  Transform,
  DiagramElement,
  NetworkDataset,
  PowerFlowResults,
  NetworkDiagramProps,
  RenderStyle,
  Bus,
  ACLine,
  Transformer,
  Load,
  Generator,
  FixedShunt,
  SwitchedShunt,
  Area,
  Zone,
} from './types';

// Re-export configuration
export { NETWORK_DIAGRAM_CONSTANTS } from './config/constants';
export { DEFAULT_RENDER_STYLE } from './config/defaults';
export { THEMES, getRenderStyle } from './config/themes';
export type { ThemeType } from './config/themes';

// Internal hooks - not part of public API
// These are implementation details of NetworkDiagram and may change without notice
// If you need advanced customization, please open an issue or discussion
