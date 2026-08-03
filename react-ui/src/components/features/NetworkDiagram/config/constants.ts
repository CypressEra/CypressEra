/**
 * Network Diagram Constants
 * Centralized constants for the NetworkDiagram component
 */

export const NETWORK_DIAGRAM_CONSTANTS = {
  // Canvas dimensions
  DEFAULT_CANVAS_WIDTH: 800,
  DEFAULT_CANVAS_HEIGHT: 600,

  // Transform limits
  MIN_SCALE: 0.1,
  MAX_SCALE: 5,
  DEFAULT_SCALE: 1,

  // Animation
  ZOOM_ANIMATION_FACTOR: 0.15,
  ANIMATION_RELATIVE_TOLERANCE: 0.0001,
  RESIZE_DELAY: 100,

  // Dragging
  DRAG_THRESHOLD: 3, // pixels

  // Element sizes
  BUS_HEIGHT: 90,
  BUS_WIDTH: 6,
  ELEMENT_HIT_BOX_SIZE: 12,
  BUS_BOUNDS_PADDING: 5,

  // Layout
  LAYOUT_PADDING: 200,
  /** Spacing when placing a newly plotted bus in nearby empty space (world units) */
  PLOT_BUS_SPACING: 180,

  // Performance
  RESIZE_DEBOUNCE_DELAY: 100,
} as const;

export type NetworkDiagramConstants = typeof NETWORK_DIAGRAM_CONSTANTS;
