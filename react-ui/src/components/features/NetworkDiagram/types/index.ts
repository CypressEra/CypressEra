/**
 * Power Grid SLD Types
 * Based on industry-standard power system data formats
 */

// ==================== Basic Types ====================

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// ==================== Network Data Types ====================

/**
 * Bus data
 */
export interface Bus {
  ibus: number;           // Bus number
  name?: string;          // Bus name
  baskv?: number;         // Base kV
  ide?: number;           // Bus type (1=load, 2=gen, 3=slack, 4=isolated)
  area?: number;          // Area number
  zone?: number;          // Zone number
  owner?: number;         // Owner number
  vm?: number;            // Voltage magnitude (pu)
  va?: number;            // Voltage angle (degrees)
  nvhi?: number;          // High voltage limit
  nvlo?: number;          // Low voltage limit
  evhi?: number;          // Emergency high voltage limit
  evlo?: number;          // Emergency low voltage limit
}

/**
 * AC Line data
 */
export interface ACLine {
  ibus: number;           // From bus number
  jbus: number;           // To bus number
  ckt?: string;           // Circuit ID
  r?: number;             // Resistance (pu)
  x?: number;             // Reactance (pu)
  b?: number;             // Susceptance (pu)
  rate1?: number;         // Rating 1 (MVA)
  rate2?: number;         // Rating 2 (MVA)
  rate3?: number;         // Rating 3 (MVA)
  stat?: number;          // Status (1=in service, 0=out of service)
  met?: number;           // Metered end
  len?: number;           // Length (miles)
  rpu?: number;           // R in per unit
  xpu?: number;           // X in per unit
  bpu?: number;           // B in per unit
  gi?: number;            // Ground conductance at from end
  gj?: number;            // Ground conductance at to end
  bi?: number;            // Ground susceptance at from end
  bj?: number;            // Ground susceptance at to end
  name?: string;          // Name
}

/**
 * Two-terminal DC line data (ipi = rectifier bus, ipr = inverter bus; direction ipi → ipr)
 */
export interface TwoTerminalDC {
  ipi: number;            // Rectifier (input) bus number
  ipr: number;            // Inverter (output) bus number
  ckt?: string;           // Circuit ID
  stat?: number;          // Status (1=in service, 0=out of service)
  name?: string;          // Name
  [key: string]: unknown;  // Allow additional fields (mdc, rdc, etc.)
}

/**
 * VSC DC element (two-terminal VSC link) data.
 * Identified by ibus1 and ibus2 in SDK/network data.
 */
export interface Vscdc {
  ibus1: number;          // Converter 1 AC bus
  ibus2: number;          // Converter 2 AC bus
  stat?: number;          // Status (1=in service, 0=out of service)
  name?: string;          // Name
  [key: string]: unknown; // Allow additional fields (p_converter1, p_converter2, etc.)
}

/**
 * Transformer data
 */
export interface Transformer {
  ibus: number;           // From bus number
  jbus: number;           // To bus number
  kbus?: number;          // Winding 3 bus (0 for 2-winding)
  ckt?: string;           // Circuit ID
  cw?: number;            // Winding 1 code
  cz?: number;            // Winding 2 code
  cm?: number;            // Winding 3 code
  mag1?: number;          // Magnetizing conductance
  mag2?: number;          // Magnetizing susceptance
  nmetr?: number;         // Metered end
  stat?: number;          // Status
  name?: string;          // Name
  r1_2?: number;          // Resistance winding 1-2
  x1_2?: number;          // Reactance winding 1-2
  sbase1_2?: number;      // Base MVA winding 1-2
  r2_3?: number;          // Resistance winding 2-3
  x2_3?: number;          // Reactance winding 2-3
  sbase2_3?: number;      // Base MVA winding 2-3
  r3_1?: number;          // Resistance winding 3-1
  x3_1?: number;          // Reactance winding 3-1
  sbase3_1?: number;      // Base MVA winding 3-1
  vmstar?: number;        // Star bus voltage
  anstar?: number;        // Star bus angle
  wdim1?: number;         // Winding 1 dimension code
  wdim2?: number;         // Winding 2 dimension code
  wdim3?: number;         // Winding 3 dimension code
  cr1?: number;           // Winding 1 phase shift
  cx1?: number;           // Winding 1 phase shift
  cnx1?: number;          // Winding 1 phase shift
}

/**
 * Load data
 */
export interface Load {
  ibus: number;           // Bus number
  loadid?: string;        // Load ID
  status?: number;        // Status
  area?: number;          // Area number
  zone?: number;          // Zone number
  pl?: number;            // P (MW)
  ql?: number;            // Q (Mvar)
  ip?: number;            // I (amps)
  iq?: number;            // I (amps)
  yp?: number;            // Y (conductance)
  yq?: number;            // Y (susceptance)
}

/**
 * Generator data
 */
export interface Generator {
  ibus: number;           // Bus number
  machid?: string;        // Machine ID
  stat?: number;          // Status
  pg?: number;            // P generation (MW)
  qg?: number;            // Q generation (Mvar)
  qt?: number;            // Q max (Mvar)
  qb?: number;            // Q min (Mvar)
  vs?: number;            // Voltage setpoint (pu)
  ireg?: number;          // Remote regulated bus
  mbase?: number;         // MVA base
  zr?: number;            // R (pu)
  zx?: number;            // X (pu)
  gtap?: number;          // Tap
  rmpct?: number;         // Remote % participation
  pt?: number;            // P max (MW)
  pb?: number;            // P min (MW)
  o1?: number;            // Owner 1
  f1?: number;            // Fraction 1
  o2?: number;            // Owner 2
  f2?: number;            // Fraction 2
  o3?: number;            // Owner 3
  f3?: number;            // Fraction 3
  o4?: number;            // Owner 4
  f4?: number;            // Fraction 4
  wmod?: number;          // Wind model
  wpf?: number;           // Wind farm mode
}

/**
 * Fixed shunt data
 */
export interface FixedShunt {
  ibus: number;           // Bus number
  shntid?: string;        // Shunt ID
  stat?: number;          // Status
  gl?: number;            // G (MW at 1 pu)
  bl?: number;            // B (Mvar at 1 pu)
  q?: number;             // Reactive power output from power flow results (MVAr)
}

/**
 * Switched shunt data
 */
export interface SwitchedShunt {
  ibus: number;           // Bus number
  swid?: string;          // Switched shunt ID
  shntid?: string;        // Shunt ID (from results)
  stat?: number;          // Status
  modsw?: number;         // Mode
  adjm?: number;          // Mode
  stat1?: number;         // Status
  stat2?: number;         // Status
  stat3?: number;         // Status
  stat4?: number;         // Status
  stat5?: number;         // Status
  stat6?: number;         // Status
  stat7?: number;         // Status
  stat8?: number;         // Status
  q?: number;             // Reactive power output from power flow results (MVAr)
}

/**
 * Area data
 */
export interface Area {
  iarea: number;          // Area number
  arname?: string;        // Area name
  isw?: number;           // Interchange slack bus
  pdes?: number;          // Desired net interchange
  ptol?: number;          // Interchange tolerance
  arnam?: string;         // Area name (alternate)
}

/**
 * Zone data
 */
export interface Zone {
  izone: number;          // Zone number
  zoname?: string;        // Zone name
}

// ==================== Power Flow Result Types ====================

/**
 * Bus power flow results
 */
export interface BusFlowResult {
  ibus: number;
  name?: string;
  vm?: number;
  va?: number;
  pl?: number;            // P load (MW)
  ql?: number;            // Q load (Mvar)
  pg?: number;            // P generation (MW)
  qg?: number;            // Q generation (Mvar)
  area?: number;
  zone?: number;
}

/**
 * AC Line flow results
 */
export interface ACLineFlowResult {
  ibus: number;
  jbus: number;
  ckt?: string;
  p_from?: number;        // P from (MW)
  q_from?: number;        // Q from (Mvar)
  p_to?: number;          // P to (MW)
  q_to?: number;          // Q to (Mvar)
  loading?: number;       // Loading percentage
  rate_a?: number;        // Rating used
  losses_mw?: number;     // Losses (MW)
  losses_mvar?: number;   // Losses (Mvar)
}

/**
 * Transformer flow results
 */
export interface TransformerFlowResult {
  ibus: number;
  jbus: number;
  k?: number;
  ckt?: string;
  p_from?: number;
  q_from?: number;
  p_to?: number;
  q_to?: number;
  loading?: number;
  tap?: number;           // Current tap position
  // Three-winding transformer flows (for winding i/j/k)
  p_flow_1?: number;       // P flow at winding 1 (ibus)
  q_flow_1?: number;       // Q flow at winding 1 (ibus)
  p_flow_2?: number;       // P flow at winding 2 (jbus)
  q_flow_2?: number;       // Q flow at winding 2 (jbus)
  p_flow_3?: number;       // P flow at winding 3 (kbus)
  q_flow_3?: number;       // Q flow at winding 3 (kbus)
}

// ==================== Diagram Element Types ====================

export type ElementType =
  | 'bus'
  | 'acline'
  | 'transformer'
  | 'transformer3w'
  | 'two_term_dc'
  | 'vsc_dc'
  | 'load'
  | 'generator'
  | 'fixed_shunt'
  | 'switched_shunt'
  | 'annotation'
  | 'group'
  // Reserved tokens (v1.0): accepted by the save format but have no
  // concrete renderer or shape yet. Promoted to first-class in v1.1.
  | 'breaker'
  | 'disconnect'
  | 'capacitor'
  | 'reactor';

export interface DiagramElement {
  id: string;
  /**
   * Stable UUIDv7 identifier for cross-file persistence. Distinct from `id` so
   * the runtime can keep using legacy string IDs (e.g. `bus_1`) while the save
   * format gets the strict identity it needs. Populated on first serialize and
   * preserved across save → load round-trips.
   */
  wireId?: string;
  type: ElementType;
  position: Point;
  bounds: Bounds;
  selected?: boolean;
  highlighted?: boolean;
  visible?: boolean;
  data?: any;
  /** Per-element bus height (bus only); when set, overrides default for drawing and hit-test. */
  busHeight?: number;
  /**
   * True when this element comes from a saved diagram whose model isn't loaded
   * (or doesn't contain this element). Rendered with a "ghost" visual cue so
   * the user can see the saved layout against the currently-missing model.
   */
  unmodeled?: boolean;
}

export interface BusElement extends DiagramElement {
  type: 'bus';
  data: Bus & {
    voltageLevel?: number;  // For color coding
  };
}

export interface LineElement extends DiagramElement {
  type: 'acline' | 'transformer' | 'transformer3w';
  fromBus: number;
  toBus: number;
  fromPoint: Point;
  toPoint: Point;
  controlPoints?: Point[];  // For routing
  data: ACLine | Transformer;
}

export interface DeviceElement extends DiagramElement {
  type: 'load' | 'generator' | 'fixed_shunt' | 'switched_shunt' | 'breaker';
  bus: number;
  connectedBusPosition?: Point;  // Position of the connected bus for drawing connection line
  mirrored?: boolean;  // If true, element is mirrored horizontally (for right-side bus connections)
  data: Load | Generator | FixedShunt | SwitchedShunt;
}

export interface DCLineElement extends DiagramElement {
  type: 'two_term_dc' | 'vsc_dc';
  fromBus: number;
  toBus: number;
  fromPoint: Point;
  toPoint: Point;
  controlPoints?: Point[];
  polarity?: 'rectifier-inverter';
  data: TwoTerminalDC | Vscdc;
}

export interface AnnotationElement extends DiagramElement {
  type: 'annotation';
  text: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  rotation?: number;
  leader?: {
    to?: { elementId: string };
    points?: Point[];
  };
}

export interface GroupElement extends DiagramElement {
  type: 'group';
  size: Size;
  label?: string;
  style?: {
    fill?: string;
    stroke?: string;
    strokeDash?: number[];
  };
  collapsed?: boolean;
  children: string[];
}

// ==================== Layout Types ====================

export interface LayoutConfig {
  algorithm: 'force' | 'hierarchical' | 'circular' | 'manual';
  forceDirected?: {
    iterations: number;
    repulsion: number;
    springLength: number;
    damping: number;
  };
  hierarchical?: {
    direction: 'horizontal' | 'vertical';
    layerSpacing: number;
    nodeSpacing: number;
  };
  circular?: {
    radius: number;
    startAngle: number;
  };
}

export interface LayoutNode {
  id: string;
  bus: number;
  position: Point;
  size: Size;
  level?: number;         // For hierarchical layout
  group?: number;         // For grouping
  connections: string[];  // Connected node IDs
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  type: 'acline' | 'transformer' | 'transformer3w';
  weight?: number;
}

// ==================== Render Types ====================

/**
 * Voltage level color definitions
 */
export interface VoltageLevelColors {
  ehv: string;  // Extra High Voltage (>= 345 kV)
  hv: string;   // High Voltage (138 - 344 kV)
  mv: string;   // Medium Voltage (34.5 - 137 kV)
  lv: string;   // Low Voltage (< 34.5 kV)
}

export interface RenderStyle {
  // Colors
  backgroundColor: string;
  gridColor: string;
  busColor: string;
  busSlackColor: string;
  busGenColor: string;
  busLoadColor: string;
  lineColor: string;
  lineSelectedColor: string;
  lineHighlightedColor: string;
  transformerColor: string;
  loadColor: string;
  generatorColor: string;
  shuntColor: string;
  breakerOpenColor: string;
  breakerClosedColor: string;
  textColor: string;
  labelColor: string;
  selectedColor: string;
  highlightedColor: string;
  voltageColors?: VoltageLevelColors; // Optional voltage level colors

  // Sizes
  busRadius: number;
  lineWidth: number;
  transformerSize: number;
  loadSize: number;
  generatorSize: number;
  shuntSize: number;
  breakerSize: number;

  // Fonts
  fontFamily: string;
  fontSize: number;
  fontSizeSmall: number;
  fontSizeLarge: number;

  // Effects
  showGlow: boolean;
  glowBlur: number;
  showShadows: boolean;
  shadowBlur: number;
  shadowColor: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  zIndex: number;
}

// ==================== Interaction Types ====================

export interface InteractionState {
  transform: Transform;
  selectedElements: Set<string>;
  hoveredElement: string | null;
  isDragging: boolean;
  isPanning: boolean;
  dragStart: Point | null;
  selectionBounds: Bounds | null;
}

export interface InteractionEvent {
  type: 'click' | 'dblclick' | 'hover' | 'drag' | 'select' | 'pan' | 'zoom';
  element?: DiagramElement;
  position: Point;
  modifiers?: {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
  };
}

// ==================== Network Data ====================

export interface NetworkDataset {
  buses: Bus[];
  aclines: ACLine[];
  twotermdc?: TwoTerminalDC[];
  vscdc?: Vscdc[];
  transformers: Transformer[];
  loads?: Load[];
  generators?: Generator[];
  fixedShunts?: FixedShunt[];
  switchedShunts?: SwitchedShunt[];
  areas?: Area[];
  zones?: Zone[];
  caseId?: {
    title1?: string;
    title2?: string;
    sbase?: number;
    basfrq?: number;
  };
}

/** Two-terminal DC line power flow result (from flow solver) */
export interface TwoTerminalDCFlowResult {
  ipi: number;
  ipr: number;
  p_flow: number;
  p_loss?: number;
}

/** VSC DC link power flow result (from flow solver) */
export interface VscdcFlowResult {
  ibus1: number;
  ibus2: number;
  p_converter1: number;
  p_converter2: number;
  p_loss?: number;
  q_converter1?: number;
  q_converter2?: number;
}

/**
 * Generator power flow result
 */
export interface GeneratorFlowResult {
  ibus: number;
  machid?: string;
  pg?: number;            // P generation (MW)
  qg?: number;            // Q generation (Mvar)
}

export interface FixshuntFlowResult {
  ibus: number;
  shntid?: string;
  stat?: number;
  p?: number;
  q?: number;
}

export interface SwshuntFlowResult {
  ibus: number;
  shntid?: string;
  stat?: number;
  q?: number;
  active_blocks?: Array<{ n: number; b: number }>;
}

export interface PowerFlowResults {
  busResults?: BusFlowResult[];
  aclineResults?: ACLineFlowResult[];
  transformerResults?: TransformerFlowResult[];
  generatorResults?: GeneratorFlowResult[];
  twotermdcResults?: TwoTerminalDCFlowResult[];
  vscdcResults?: VscdcFlowResult[];
  fixshuntResults?: FixshuntFlowResult[];
  swshuntResults?: SwshuntFlowResult[];
  converged?: boolean;
  timestamp?: string;
}

// ==================== Component Props ====================

/**
 * # Bus Plotting Configuration Guide
 *
 * The NetworkDiagram component supports two ways to control which buses are plotted:
 *
 * ## 1. Initial Bus Configuration (`initialBusConfig` prop)
 * - **Purpose**: Set which buses to plot when the diagram initially loads or session changes
 * - **Usage**: Backend-driven lists, pre-configured views, saved configurations
 * - **Type**: `number[] | InitialBusConfig`
 * - **Behavior**: Only applied on mount/session change, does NOT re-apply on prop changes
 * - **User Control**: Users can still modify via UI after initialization
 *
 * ## 2. Runtime Bus Selection (internal `plottedBusNumbers` state)
 * - **Purpose**: Control which buses are visible during runtime
 * - **Usage**: User interactions via context menu (Plot All, Plot Selected, Grow Bus, etc.)
 * - **Type**: `Set<number> | null` (null = show all buses)
 * - **Behavior**: Persists during data refresh, resets on session change
 * - **User Control**: Fully controlled by user interactions
 *
 * ## Key Differences
 *
 * | Aspect | initialBusConfig | plottedBusNumbers |
 * |--------|-----------------|-------------------|
 * | When applied | Mount/session change only | Runtime, anytime |
 * | Source | Backend/config prop | User interaction |
 * | Persistence | Not tracked after init | Tracked during session |
 * | Can user modify? | Yes, after init | N/A (user-controlled) |
 * | Includes connections? | Optional (via config) | No (explicit only) |
 *
 * ## Examples
 *
 * ```tsx
 * // Simple bus list
 * <NetworkDiagram
 *   data={dataset}
 *   initialBusConfig={[1, 2, 3, 4, 5]}
 * />
 *
 * // With connected buses (1 hop)
 * <NetworkDiagram
 *   data={dataset}
 *   initialBusConfig={{
 *     busNumbers: [1, 2, 3],
 *     includeConnectedBuses: true,
 *     maxConnectionDepth: 1
 *   }}
 * />
 *
 * // Backend integration
 * <NetworkDiagram
 *   data={dataset}
 *   initialBusConfig={backendResponse.preferredBuses}
 * />
 * ```
 */

/**
 * Configuration for initial bus plotting
 * This is used on mount/session change to set the initial plotted buses.
 * Unlike plottedBusNumbers (runtime state), this cannot be changed by user interaction.
 */
export interface InitialBusConfig {
  /** List of bus numbers to initially plot. When provided, only these buses will be plotted initially */
  busNumbers?: number[];
  /** When true, automatically include buses that are connected to the specified buses */
  includeConnectedBuses?: boolean;
  /** Maximum number of hops to include when includeConnectedBuses is true */
  maxConnectionDepth?: number;
}

export interface NetworkDiagramProps {
  data?: NetworkDataset;
  powerFlowResults?: PowerFlowResults;
  /**
   * Initial bus configuration for plotting.
   *
   * Use this to pre-select which buses to plot when the diagram loads.
   * This is particularly useful for:
   * - Backend-driven bus lists (e.g., from API responses)
   * - Pre-configured views (e.g., regional subsets)
   * - Initial state from saved user configurations
   *
   * @example
   * // Simple array of bus numbers
   * initialBusConfig={[1, 2, 3, 4, 5]}
   *
   * @example
   * // With automatic connection inclusion
   * initialBusConfig={{
   *   busNumbers: [1, 2, 3],
   *   includeConnectedBuses: true,
   *   maxConnectionDepth: 1
   * }}
   *
   * @note This only affects the initial plot state when a session loads.
   * Users can still modify the plotted buses through the UI (context menu).
   */
  initialBusConfig?: number[] | InitialBusConfig;
  onElementClick?: (element: DiagramElement) => void;
  onElementDoubleClick?: (element: DiagramElement) => void;
  onSelectionChange?: (elements: DiagramElement[]) => void;
  onCanvasClick?: (position: Point) => void;
  /** Fired whenever the live element count changes (elementsRef updates).
   *  Drives the menu bar's Save → Diagram disabled state. */
  onElementsChanged?: (count: number) => void;
  /** Right-click menu → Open Diagram. App opens the file-selector rooted at
   *  the diagram library and routes the chosen file through `handleOpenDiagram`. */
  onContextMenuOpenDiagram?: () => void;
  /** Right-click menu → Save Diagram. App calls `handleSaveDiagram` (which
   *  falls back to Save As when no current filename is set). */
  onContextMenuSaveDiagram?: () => void;
  className?: string;
  style?: React.CSSProperties;
  theme?: 'light' | 'dark';
  showLabels?: boolean;
  showFlowValues?: boolean;
  interactive?: boolean;
  initialTransform?: Partial<Transform>;
  layoutConfig?: Partial<LayoutConfig>;
  triggerLoadFile?: () => void; // Callback to trigger file load dialog
  sessionKey?: string; // Unique identifier for the current session (e.g., session_id or file_path) to preserve plot state during data refresh
}

// ==================== MCP Integration ====================

export interface MCPDiagramUpdate {
  type: 'update' | 'refresh' | 'highlight' | 'select';
  elements?: DiagramElement[];
  elementIds?: string[];
  powerFlowData?: PowerFlowResults;
  timestamp?: string;
}

// ==================== Type Aliases for Backward Compatibility ====================
// @deprecated Use ACLineFlowResult instead
export type AclineFlowResult = ACLineFlowResult;
