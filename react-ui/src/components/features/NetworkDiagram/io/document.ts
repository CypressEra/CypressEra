/**
 * cypressera.diagram wire format — v1.0
 *
 * Persistence shape for the network diagram plot. Distinct from the in-memory
 * types in `../types`: wire types are normalized, strip runtime UI state, omit
 * derived geometry, and use attach-fraction semantics for connections.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * Schema: react-ui/public/schemas/cypressera-diagram-1.0.json
 */

import type { Point, Size, Transform, RenderStyle, LayerConfig } from '../types';

export const DOCUMENT_TYPE = 'cypressera.diagram' as const;
export const CURRENT_SCHEMA_VERSION = '1.0' as const;

export type DocumentType = typeof DOCUMENT_TYPE;

// ==================== Envelope ====================

export interface CypressEraDiagram {
  $schema?: string;
  type: DocumentType;
  version: string;

  id: string;
  createdAt: string;
  modifiedAt: string;
  app: { name: string; version: string };

  title?: string;
  description?: string;
  tags?: string[];

  modelRef?: ModelRef;
  view: Transform;
  style?: Partial<RenderStyle>;
  layers: LayerConfig[];

  elements: DiagramElementWire[];

  contentHash?: string;
  migrations?: MigrationEntry[];
  extensions?: Record<string, unknown>;
}

export interface ModelRef {
  name: string;
  kind?: string;
  hash?: string;
}

export interface MigrationEntry {
  from: string;
  to: string;
  at: string;
}

// ==================== Element Refs (PSS/E natural keys) ====================

export interface BusRef          { ibus: number; }
export interface BranchRef       { ibus: number; jbus: number; ckt: string; }
export interface Branch3WRef     { ibus: number; jbus: number; kbus: number; ckt: string; }
/** Two-terminal DC line: rectifier (ipi) and inverter (ipr) bus numbers + circuit id. */
export interface TwoTermDCRef    { ipi: number; ipr: number; ckt: string; name?: string; }
/** VSC DC link: two converter bus numbers + a disambiguating name. */
export interface VscDCRef        { ibus1: number; ibus2: number; name: string; }
export type DCLineRef            = TwoTermDCRef | VscDCRef;
export interface DeviceWithIdRef { ibus: number; id: string; }
export interface DeviceNoIdRef   { ibus: number; }

// ==================== Connection primitives ====================

/** Endpoint of a line: attached to another element by fractional position along its drawn length. */
export interface LineEndpoint {
  elementId: string;
  attach: number;          // [0, 1]
}

/** Device attachment to a bus: fractional position along the bus + which side it draws on. */
export interface Attach {
  elementId: string;
  position: number;        // [0, 1]
  side: 'above' | 'below' | 'left' | 'right';
}

// ==================== Element types (discriminated union) ====================

export type DiagramElementWire =
  | BusElementWire
  | LineElementWire
  | DCLineElementWire
  | DeviceElementWire
  | AnnotationElementWire
  | GroupElementWire;

export type WireElementType =
  | 'bus'
  | 'acline' | 'transformer' | 'transformer3w'
  | 'two_term_dc' | 'vsc_dc'
  | 'generator' | 'load' | 'fixed_shunt' | 'switched_shunt'
  | 'annotation'
  | 'group'
  // Reserved tokens (no concrete shape in v1.0; opaque pass-through).
  | 'breaker' | 'disconnect' | 'capacitor' | 'reactor';

interface ElementBase {
  id: string;
  layer: string;
  visible?: boolean;
}

export interface BusElementWire extends ElementBase {
  type: 'bus';
  ref: BusRef;
  position: Point;
  geometry: { length: number; orientation: 'horizontal' | 'vertical' };
}

export interface LineElementWire extends ElementBase {
  type: 'acline' | 'transformer' | 'transformer3w';
  ref: BranchRef | Branch3WRef;
  from: LineEndpoint;
  to: LineEndpoint;
  controlPoints: Point[];
}

export interface DCLineElementWire extends ElementBase {
  type: 'two_term_dc' | 'vsc_dc';
  ref: DCLineRef;
  from: LineEndpoint;
  to: LineEndpoint;
  controlPoints: Point[];
  polarity?: 'rectifier-inverter';
}

export interface DeviceElementWire extends ElementBase {
  type: 'generator' | 'load' | 'fixed_shunt' | 'switched_shunt';
  ref: DeviceWithIdRef | DeviceNoIdRef;
  attach: Attach;
  mirrored: boolean;
}

export interface AnnotationElementWire extends ElementBase {
  type: 'annotation';
  position: Point;
  text: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  rotation?: number;
  leader?: AnnotationLeader;
}

export interface AnnotationLeader {
  to?: { elementId: string };
  points?: Point[];
}

export interface GroupElementWire extends ElementBase {
  type: 'group';
  position: Point;
  size: Size;
  label?: string;
  style?: GroupStyle;
  collapsed?: boolean;
  children: string[];
}

export interface GroupStyle {
  fill?: string;
  stroke?: string;
  strokeDash?: number[];
}

// ==================== Type-guards ====================

const RESERVED_TOKENS = new Set(['breaker', 'disconnect', 'capacitor', 'reactor']);

export function isReservedElementType(type: string): boolean {
  return RESERVED_TOKENS.has(type);
}

export function isBusWire         (e: DiagramElementWire): e is BusElementWire        { return e.type === 'bus'; }
export function isLineWire        (e: DiagramElementWire): e is LineElementWire       { return e.type === 'acline' || e.type === 'transformer' || e.type === 'transformer3w'; }
export function isDCLineWire      (e: DiagramElementWire): e is DCLineElementWire     { return e.type === 'two_term_dc' || e.type === 'vsc_dc'; }
export function isDeviceWire      (e: DiagramElementWire): e is DeviceElementWire     { return e.type === 'generator' || e.type === 'load' || e.type === 'fixed_shunt' || e.type === 'switched_shunt'; }
export function isAnnotationWire  (e: DiagramElementWire): e is AnnotationElementWire { return e.type === 'annotation'; }
export function isGroupWire       (e: DiagramElementWire): e is GroupElementWire      { return e.type === 'group'; }
