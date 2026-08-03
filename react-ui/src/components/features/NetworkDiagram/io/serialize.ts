/**
 * Serialize an in-memory diagram to the cypressera.diagram wire format.
 *
 * Strips runtime UI state and derived geometry; converts absolute connection-
 * point coordinates to attach fractions; ensures every element has a stable
 * UUIDv7 wireId (mutating source elements to preserve round-trip identity).
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirements: Persist intent, recompute derived geometry / Attachment-fraction
 *  connections / Stable diagram element identity)
 */

import type {
  DiagramElement,
  BusElement,
  LineElement,
  DCLineElement,
  DeviceElement,
  AnnotationElement,
  GroupElement,
  Point,
  Transform,
  LayerConfig,
  RenderStyle,
} from '../types';

import {
  CURRENT_SCHEMA_VERSION,
  DOCUMENT_TYPE,
  CypressEraDiagram,
  DiagramElementWire,
  BusElementWire,
  LineElementWire,
  DCLineElementWire,
  DeviceElementWire,
  AnnotationElementWire,
  GroupElementWire,
  LineEndpoint,
  Attach,
  ModelRef,
} from './document';

import { mintElementId } from './ids';
import { assertValid } from './validator';
import { canonicalize } from './canonical';
import { computeContentHash } from './contentHash';

const DEFAULT_BUS_HEIGHT = 90;
const DEFAULT_LAYER_ID = 'default';
const CONTENT_HASH_AUTO_THRESHOLD = 1_000_000;   // bytes

export interface SerializeOptions {
  title?: string;
  description?: string;
  tags?: string[];
  modelRef?: ModelRef;
  view?: Transform;
  layers?: LayerConfig[];
  style?: Partial<RenderStyle>;
  app?: { name: string; version: string };
  /**
   * Controls whether `contentHash` is computed and embedded.
   *   true   — always compute
   *   false  — never compute
   *   'auto' — compute when canonical payload ≥ ~1 MB (default)
   */
  contentHash?: boolean | 'auto';
  /** Override the document UUID. Defaults to minting a fresh UUIDv7. */
  documentId?: string;
  /** ISO timestamps. Default `createdAt` to now-or-existing-via-options, `modifiedAt` to now. */
  createdAt?: string;
  modifiedAt?: string;
  extensions?: Record<string, unknown>;
}

export interface SerializeResult {
  doc: CypressEraDiagram;
  bytes: string;
  warnings: string[];
}

/**
 * Serialize a diagram to a canonical-JSON cypressera.diagram document.
 *
 * Side effect: mutates `wireId` on any passed-in element that doesn't already
 * have one, so subsequent saves of the same in-memory state preserve identity.
 */
export async function serialize(
  elements: DiagramElement[],
  options: SerializeOptions = {}
): Promise<SerializeResult> {
  const warnings: string[] = [];

  // Build a lookup from in-memory id → BusElement so we can resolve connections.
  const busesById = new Map<string, BusElement>();
  for (const el of elements) {
    if (el.type === 'bus') busesById.set(el.id, el as BusElement);
  }

  // Mint wireIds for every element up front so cross-references resolve.
  const wireIdByMemoryId = new Map<string, string>();
  for (const el of elements) {
    if (!el.wireId) el.wireId = mintElementId();
    wireIdByMemoryId.set(el.id, el.wireId);
  }

  // Convert each element to its wire form.
  const wireElements: DiagramElementWire[] = [];
  for (const el of elements) {
    const wire = toWireElement(el, wireIdByMemoryId, busesById, warnings);
    if (wire) wireElements.push(wire);
  }

  const nowIso = new Date().toISOString();
  const doc: CypressEraDiagram = {
    $schema: 'https://cypressera.ai/schemas/cypressera-diagram-1.0.json',
    type: DOCUMENT_TYPE,
    version: CURRENT_SCHEMA_VERSION,
    id: options.documentId ?? mintElementId(),
    createdAt: options.createdAt ?? nowIso,
    modifiedAt: options.modifiedAt ?? nowIso,
    app: options.app ?? { name: 'CypressEra', version: '0.1.0' },
    ...(options.title       !== undefined && { title:       options.title }),
    ...(options.description !== undefined && { description: options.description }),
    ...(options.tags        !== undefined && { tags:        options.tags }),
    ...(options.modelRef    !== undefined && { modelRef:    options.modelRef }),
    view:    options.view   ?? { scale: 1, offsetX: 0, offsetY: 0 },
    ...(options.style       !== undefined && { style:       options.style }),
    layers:  options.layers ?? [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, zIndex: 0 }],
    elements: wireElements,
    ...(options.extensions  !== undefined && { extensions:  options.extensions }),
  };

  // Validate the produced document before returning. A failure here is a
  // programmer bug (we shouldn't ship corrupted saves), not a user error.
  assertValid(doc);

  // Canonical bytes. Hashing decision is based on these bytes.
  let bytes = canonicalize(doc);
  const wantHash =
    options.contentHash === true ||
    (options.contentHash !== false && bytes.length >= CONTENT_HASH_AUTO_THRESHOLD);

  if (wantHash) {
    doc.contentHash = await computeContentHash(doc);
    bytes = canonicalize(doc);
  }

  return { doc, bytes, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Element conversion
// ─────────────────────────────────────────────────────────────────────────────

function toWireElement(
  el: DiagramElement,
  wireIdByMemoryId: Map<string, string>,
  busesById: Map<string, BusElement>,
  warnings: string[]
): DiagramElementWire | null {
  const wireId = el.wireId!;             // guaranteed by caller
  const layer = (el as any).layer ?? DEFAULT_LAYER_ID;

  switch (el.type) {
    case 'bus':       return busToWire       (el as BusElement,        wireId, layer);
    case 'acline':
    case 'transformer':
    case 'transformer3w':
                      return lineToWire      (el as LineElement,       wireId, layer, wireIdByMemoryId, busesById, warnings);
    case 'two_term_dc':
    case 'vsc_dc':    return dcLineToWire    (el as DCLineElement,     wireId, layer, wireIdByMemoryId, busesById, warnings);
    case 'load':
    case 'generator':
    case 'fixed_shunt':
    case 'switched_shunt':
                      return deviceToWire    (el as DeviceElement,     wireId, layer, wireIdByMemoryId, busesById, warnings);
    case 'annotation':return annotationToWire(el as AnnotationElement, wireId, layer, wireIdByMemoryId);
    case 'group':     return groupToWire     (el as GroupElement,      wireId, layer, wireIdByMemoryId, warnings);
    // Reserved tokens: not first-class in v1.0; drop with a warning so saves
    // don't silently smuggle non-renderable state.
    case 'breaker':
    case 'disconnect':
    case 'capacitor':
    case 'reactor':
      warnings.push(`element ${el.id} of reserved type "${el.type}" is not first-class in v1.0; skipping`);
      return null;
    default:
      warnings.push(`element ${el.id} has unknown type "${el.type}"; skipping`);
      return null;
  }
}

function busToWire(el: BusElement, wireId: string, layer: string): BusElementWire {
  return {
    id: wireId,
    type: 'bus',
    layer,
    ref: { ibus: el.data.ibus },
    position: { x: el.position.x, y: el.position.y },
    geometry: {
      length: el.busHeight ?? DEFAULT_BUS_HEIGHT,
      orientation: 'vertical', // The current renderer draws buses vertically.
    },
    ...(el.visible !== undefined && { visible: el.visible }),
  };
}

function lineToWire(
  el: LineElement,
  wireId: string,
  layer: string,
  wireIdByMemoryId: Map<string, string>,
  busesById: Map<string, BusElement>,
  warnings: string[]
): LineElementWire | null {
  // The ElementFactory doesn't set `fromBus`/`toBus` on the in-memory line —
  // those numbers live in element.data.ibus/jbus. Look there as the fallback.
  const data = el.data as any;
  const fromBusNum = el.fromBus ?? data?.ibus ?? data?.ipi;
  const toBusNum   = el.toBus   ?? data?.jbus ?? data?.ipr;
  const fromBus = findBusByNumber(fromBusNum, busesById);
  const toBus   = findBusByNumber(toBusNum,   busesById);
  if (!fromBus || !toBus) {
    warnings.push(`line ${el.id} references bus(es) not in elements (from=${fromBusNum} to=${toBusNum}); skipping`);
    return null;
  }
  const fromWire = wireIdByMemoryId.get(fromBus.id);
  const toWire   = wireIdByMemoryId.get(toBus.id);
  if (!fromWire || !toWire) {
    warnings.push(`line ${el.id} bus has no wireId; skipping`);
    return null;
  }

  const ref =
    el.type === 'transformer3w'
      ? { ibus: pickBranchBus(el, 'ibus'), jbus: pickBranchBus(el, 'jbus'), kbus: pickBranchBus(el, 'kbus'), ckt: branchCkt(el) }
      : { ibus: fromBusNum, jbus: toBusNum, ckt: branchCkt(el) };

  // Factory-created lines use element.position (FROM) + element.toPos (TO),
  // not fromPoint/toPoint. My own deserialized lines set both. Fall back so
  // either shape works.
  const elAny = el as any;
  const fromPoint = elAny.fromPoint ?? el.position;
  const toPoint   = elAny.toPoint   ?? elAny.toPos;
  if (!fromPoint || !toPoint) {
    warnings.push(`line ${el.id} missing endpoint geometry (fromPoint=${!!fromPoint} toPoint=${!!toPoint}); skipping`);
    return null;
  }

  return {
    id: wireId,
    type: el.type,
    layer,
    ref: ref as any,
    from: makeEndpoint(fromWire, fromPoint, fromBus),
    to:   makeEndpoint(toWire,   toPoint,   toBus),
    controlPoints: (el.controlPoints ?? []).map(copyPoint),
    ...(el.visible !== undefined && { visible: el.visible }),
  };
}

function dcLineToWire(
  el: DCLineElement,
  wireId: string,
  layer: string,
  wireIdByMemoryId: Map<string, string>,
  busesById: Map<string, BusElement>,
  warnings: string[]
): DCLineElementWire | null {
  const data = el.data as any;
  const fromBusNum = el.fromBus ?? data?.ipi  ?? data?.ibus1 ?? data?.ibus;
  const toBusNum   = el.toBus   ?? data?.ipr  ?? data?.ibus2 ?? data?.jbus;
  const fromBus = findBusByNumber(fromBusNum, busesById);
  const toBus   = findBusByNumber(toBusNum,   busesById);
  if (!fromBus || !toBus) {
    warnings.push(`dc line ${el.id} references bus(es) not in elements (from=${fromBusNum} to=${toBusNum}); skipping`);
    return null;
  }
  const fromWire = wireIdByMemoryId.get(fromBus.id)!;
  const toWire   = wireIdByMemoryId.get(toBus.id)!;

  const elAny = el as any;
  const fromPoint = elAny.fromPoint ?? el.position;
  const toPoint   = elAny.toPoint   ?? elAny.toPos;
  if (!fromPoint || !toPoint) {
    warnings.push(`dc line ${el.id} missing endpoint geometry; skipping`);
    return null;
  }

  // Match the factory's ID scheme by saving the exact fields it uses:
  //   twotermdc: `twotermdc_${ipi}_${ipr}_${ckt}`
  //   vscdc:     `vscdc_${ibus1}_${ibus2}_${name}`
  const ref = el.type === 'vsc_dc'
    ? {
        ibus1: data?.ibus1 ?? fromBusNum,
        ibus2: data?.ibus2 ?? toBusNum,
        name:  String(data?.name ?? el.id),
      }
    : {
        ipi:  data?.ipi ?? fromBusNum,
        ipr:  data?.ipr ?? toBusNum,
        ckt:  String(data?.ckt ?? '1'),
        ...(data?.name && { name: String(data.name) }),
      };

  return {
    id: wireId,
    type: el.type,
    layer,
    ref: ref as any,
    from: makeEndpoint(fromWire, fromPoint, fromBus),
    to:   makeEndpoint(toWire,   toPoint,   toBus),
    controlPoints: (el.controlPoints ?? []).map(copyPoint),
    ...(el.polarity && { polarity: el.polarity }),
    ...(el.visible !== undefined && { visible: el.visible }),
  };
}

function deviceToWire(
  el: DeviceElement,
  wireId: string,
  layer: string,
  wireIdByMemoryId: Map<string, string>,
  busesById: Map<string, BusElement>,
  warnings: string[]
): DeviceElementWire | null {
  // ElementFactory doesn't set `bus` on device elements either — it's in data.ibus.
  const data = el.data as any;
  const busNum = el.bus ?? data?.ibus;
  const bus = findBusByNumber(busNum, busesById);
  if (!bus) {
    warnings.push(`device ${el.id} (type=${el.type}) references bus ${busNum} not in elements; skipping`);
    return null;
  }
  const busWireId = wireIdByMemoryId.get(bus.id)!;
  // Each device type has its own sub-id field in PSS/E data; pick by type so we
  // match the field the ElementFactory uses to mint legacy IDs (otherwise the
  // round-trip can't match elements). Falls back to a generic `id` for elements
  // that may carry a normalised id field.
  const subIdByType: Record<string, string | undefined> = {
    load:           data?.loadid,
    generator:      data?.machid,
    fixed_shunt:    data?.shntid,
    switched_shunt: data?.swid,
  };
  const deviceLocalId = subIdByType[el.type] ?? data?.id;
  const ref =
    deviceLocalId !== undefined
      ? { ibus: busNum, id: String(deviceLocalId) }
      : { ibus: busNum };

  const connectionPoint = el.connectedBusPosition ?? el.position;
  if (!connectionPoint) {
    warnings.push(`device ${el.id} (type=${el.type}) has no position; skipping`);
    return null;
  }
  const position = pointToAttach(connectionPoint, bus);
  const devicePos = el.position ?? connectionPoint;
  const side: 'left' | 'right' = devicePos.x < bus.position.x ? 'left' : 'right';

  return {
    id: wireId,
    type: el.type as DeviceElementWire['type'],
    layer,
    ref: ref as any,
    attach: { elementId: busWireId, position, side },
    mirrored: !!el.mirrored,
    ...(el.visible !== undefined && { visible: el.visible }),
  };
}

function annotationToWire(
  el: AnnotationElement,
  wireId: string,
  layer: string,
  wireIdByMemoryId: Map<string, string>
): AnnotationElementWire {
  const out: AnnotationElementWire = {
    id: wireId,
    type: 'annotation',
    layer,
    position: copyPoint(el.position),
    text: el.text,
    ...(el.fontSize   !== undefined && { fontSize:   el.fontSize }),
    ...(el.fontWeight !== undefined && { fontWeight: el.fontWeight }),
    ...(el.textAlign  !== undefined && { textAlign:  el.textAlign }),
    ...(el.color      !== undefined && { color:      el.color }),
    ...(el.rotation   !== undefined && { rotation:   el.rotation }),
    ...(el.visible    !== undefined && { visible:    el.visible }),
  };
  if (el.leader) {
    out.leader = {};
    if (el.leader.to?.elementId) {
      const target = wireIdByMemoryId.get(el.leader.to.elementId);
      if (target) out.leader.to = { elementId: target };
    }
    if (el.leader.points) out.leader.points = el.leader.points.map(copyPoint);
  }
  return out;
}

function groupToWire(
  el: GroupElement,
  wireId: string,
  layer: string,
  wireIdByMemoryId: Map<string, string>,
  warnings: string[]
): GroupElementWire {
  const children: string[] = [];
  for (const childMemoryId of el.children) {
    const w = wireIdByMemoryId.get(childMemoryId);
    if (w) children.push(w);
    else warnings.push(`group ${el.id} references unknown child ${childMemoryId}; dropping`);
  }
  return {
    id: wireId,
    type: 'group',
    layer,
    position: copyPoint(el.position),
    size: { width: el.size.width, height: el.size.height },
    ...(el.label     !== undefined && { label:     el.label }),
    ...(el.style     !== undefined && { style:     el.style }),
    ...(el.collapsed !== undefined && { collapsed: el.collapsed }),
    children,
    ...(el.visible   !== undefined && { visible:   el.visible }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEndpoint(targetWireId: string, point: Point, bus: BusElement): LineEndpoint {
  return { elementId: targetWireId, attach: pointToAttach(point, bus) };
}

/** Convert an absolute pixel point on a (vertical) bus into a fractional attach. */
function pointToAttach(point: Point, bus: BusElement): number {
  const busHeight = bus.busHeight ?? DEFAULT_BUS_HEIGHT;
  const top = bus.position.y - busHeight / 2;
  const raw = (point.y - top) / busHeight;
  return clamp01(raw);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function findBusByNumber(ibus: number, busesById: Map<string, BusElement>): BusElement | undefined {
  const values = Array.from(busesById.values());
  for (let i = 0; i < values.length; i++) {
    if (values[i].data.ibus === ibus) return values[i];
  }
  return undefined;
}

function copyPoint(p: Point): Point { return { x: p.x, y: p.y }; }

function branchCkt(el: LineElement): string {
  const data = el.data as any;
  return String(data?.ckt ?? '1');
}

function pickBranchBus(el: LineElement, key: 'ibus' | 'jbus' | 'kbus'): number {
  const data = el.data as any;
  const v = data?.[key];
  if (typeof v === 'number') return v;
  if (key === 'ibus') return el.fromBus;
  if (key === 'jbus') return el.toBus;
  return 0;
}

// Used by Attach typing only — type re-export for callers.
export type { Attach };
