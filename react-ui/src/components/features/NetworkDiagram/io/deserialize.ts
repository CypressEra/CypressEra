/**
 * Deserialize an cypressera.diagram document into in-memory DiagramElements.
 *
 * Pipeline:
 *   bytes/string → (gzip detect) → JSON.parse → schema validate
 *                → migrate → contentHash verify (warning only)
 *                → reconstruct in-memory elements → recompute derived geometry
 *                → verify references
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 */

import { inflate } from 'pako';

import type {
  DiagramElement,
  BusElement,
  LineElement,
  DCLineElement,
  DeviceElement,
  AnnotationElement,
  GroupElement,
  Bus,
  ACLine,
  Transformer,
  Load,
  Generator,
  FixedShunt,
  SwitchedShunt,
  TwoTerminalDC,
  Vscdc,
  Point,
  Bounds,
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
  MigrationEntry,
  isBusWire,
  isLineWire,
  isDCLineWire,
  isDeviceWire,
  isAnnotationWire,
  isGroupWire,
  isReservedElementType,
} from './document';

import { validate, ValidationError } from './validator';
import { migrate } from './migrations';
import { verifyContentHash } from './contentHash';

const DEFAULT_BUS_HEIGHT  = 90;
const DEFAULT_BUS_WIDTH   = 6;
const DEVICE_OFFSET       = 40;   // pixels from bus when reconstructing device position
const GZIP_MAGIC          = [0x1f, 0x8b];

export interface DeserializeWarning {
  kind: 'clamped_attach' | 'content_hash_mismatch' | 'dangling_leader' | 'reserved_type_dropped' | 'migration_applied';
  message: string;
  elementId?: string;
}

export interface DeserializeOk {
  ok: true;
  doc: CypressEraDiagram;
  elements: DiagramElement[];
  warnings: DeserializeWarning[];
  appliedMigrations: MigrationEntry[];
}

export interface DeserializeErr {
  ok: false;
  errors: ValidationError[];
  rawDoc?: unknown;
}

export type DeserializeResult = DeserializeOk | DeserializeErr;

/** Deserialize a saved cypressera.diagram document. Input may be a JSON string,
 *  UTF-8 bytes, or gzip-compressed bytes. */
export async function deserialize(input: string | Uint8Array | ArrayBuffer): Promise<DeserializeResult> {
  const text = decodeInput(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ path: '/', message: `invalid JSON: ${e?.message ?? e}`, keyword: 'parse' }],
    };
  }

  // Pre-validation top-level checks so we produce friendlier errors than ajv would.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      errors: [{ path: '/', message: 'document must be a JSON object', keyword: 'type' }],
      rawDoc: parsed,
    };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== DOCUMENT_TYPE) {
    return {
      ok: false,
      errors: [{
        path: '/type',
        message: `unsupported document type "${String(obj.type)}"; expected "${DOCUMENT_TYPE}"`,
        keyword: 'const',
      }],
      rawDoc: parsed,
    };
  }
  if (typeof obj.version !== 'string') {
    return {
      ok: false,
      errors: [{ path: '/version', message: 'missing or non-string version field', keyword: 'required' }],
      rawDoc: parsed,
    };
  }

  // Migrate before schema validation — older docs validate against the post-
  // migration schema, not their original.
  const warnings: DeserializeWarning[] = [];
  const appliedMigrations: MigrationEntry[] = [];
  let migrated: any;
  try {
    const result = migrate(obj, CURRENT_SCHEMA_VERSION);
    migrated = result.doc;
    appliedMigrations.push(...result.applied);
    for (const m of result.applied) {
      warnings.push({
        kind: 'migration_applied',
        message: `applied migration ${m.from} → ${m.to}`,
      });
    }
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ path: '/version', message: e?.message ?? String(e), keyword: 'migration' }],
      rawDoc: parsed,
    };
  }

  // Now schema-validate.
  const validation = validate(migrated);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, rawDoc: migrated };
  }

  const doc = migrated as CypressEraDiagram;

  // Append migration entries to the document's history so it carries provenance.
  if (appliedMigrations.length > 0) {
    doc.migrations = [...(doc.migrations ?? []), ...appliedMigrations];
  }

  // Verify content hash (non-fatal).
  if (doc.contentHash) {
    const verify = await verifyContentHash(doc);
    if (!verify.match) {
      warnings.push({
        kind: 'content_hash_mismatch',
        message: `contentHash mismatch (expected ${verify.expected}, actual ${verify.actual})`,
      });
    }
  }

  // Reconstruct in-memory elements.
  const refResult = checkReferences(doc.elements);
  if (!refResult.ok) {
    return { ok: false, errors: refResult.errors, rawDoc: doc };
  }

  const buildResult = buildElements(doc.elements);
  warnings.push(...buildResult.warnings);

  return {
    ok: true,
    doc,
    elements: buildResult.elements,
    warnings,
    appliedMigrations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input decoding
// ─────────────────────────────────────────────────────────────────────────────

function decodeInput(input: string | Uint8Array | ArrayBuffer): string {
  if (typeof input === 'string') return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]) {
    return inflate(bytes, { to: 'string' });
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference integrity (must run BEFORE element reconstruction)
// ─────────────────────────────────────────────────────────────────────────────

function checkReferences(elements: DiagramElementWire[]):
  | { ok: true }
  | { ok: false; errors: ValidationError[] }
{
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  for (const el of elements) {
    if (ids.has(el.id)) {
      errors.push({
        path: `/elements/*/id`,
        message: `duplicate element id ${el.id}`,
        keyword: 'unique',
      });
    }
    ids.add(el.id);
  }

  elements.forEach((el, i) => {
    const at = (suffix: string) => `/elements/${i}${suffix}`;
    if (isLineWire(el) || isDCLineWire(el)) {
      if (!ids.has(el.from.elementId)) {
        errors.push({ path: at('/from/elementId'), message: `dangling reference ${el.from.elementId}`, keyword: 'reference' });
      }
      if (!ids.has(el.to.elementId)) {
        errors.push({ path: at('/to/elementId'),   message: `dangling reference ${el.to.elementId}`,   keyword: 'reference' });
      }
    } else if (isDeviceWire(el)) {
      if (!ids.has(el.attach.elementId)) {
        errors.push({ path: at('/attach/elementId'), message: `dangling reference ${el.attach.elementId}`, keyword: 'reference' });
      }
    } else if (isGroupWire(el)) {
      el.children.forEach((childId, j) => {
        if (!ids.has(childId)) {
          errors.push({ path: at(`/children/${j}`), message: `dangling child ${childId}`, keyword: 'reference' });
        }
      });
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Element reconstruction
// ─────────────────────────────────────────────────────────────────────────────

interface BuildResult {
  elements: DiagramElement[];
  warnings: DeserializeWarning[];
}

function buildElements(wire: DiagramElementWire[]): BuildResult {
  const warnings: DeserializeWarning[] = [];

  // First pass: build all buses so other elements can resolve their target
  // geometry, and groups can map wire-id children → memory-id children.
  const busesByWireId = new Map<string, BusElement>();
  const memoryIdByWireId = new Map<string, string>();
  const out: DiagramElement[] = [];
  for (const el of wire) {
    if (isBusWire(el)) {
      const bus = buildBus(el);
      busesByWireId.set(el.id, bus);
      memoryIdByWireId.set(el.id, bus.id);
      out.push(bus);
    }
  }

  // Second pass: build everything else, recording each (wireId → memoryId).
  // Groups (which reference children) are built last so all their children
  // are already in the map.
  const nonBusNonGroup = wire.filter(el => !isBusWire(el) && !isGroupWire(el));
  for (const el of nonBusNonGroup) {
    if (isReservedElementType(el.type)) {
      warnings.push({
        kind: 'reserved_type_dropped',
        message: `element of reserved type "${el.type}" dropped (not first-class in v1.0)`,
        elementId: el.id,
      });
      continue;
    }
    let built: DiagramElement | null = null;
    if (isLineWire(el))            built = buildLine      (el, busesByWireId, warnings);
    else if (isDCLineWire(el))     built = buildDCLine    (el, busesByWireId, warnings);
    else if (isDeviceWire(el))     built = buildDevice    (el, busesByWireId, warnings);
    else if (isAnnotationWire(el)) built = buildAnnotation(el, busesByWireId, warnings);
    if (built) {
      out.push(built);
      memoryIdByWireId.set(el.id, built.id);
    }
  }

  for (const el of wire) {
    if (!isGroupWire(el)) continue;
    out.push(buildGroup(el, memoryIdByWireId));
  }

  return { elements: out, warnings };
}

function buildBus(w: BusElementWire): BusElement {
  const length = w.geometry.length;
  const bounds = busBounds(w.position, length);
  return {
    id: legacyBusId(w.ref.ibus),
    wireId: w.id,
    type: 'bus',
    position: { x: w.position.x, y: w.position.y },
    bounds,
    busHeight: length,
    visible: w.visible,
    data: { ibus: w.ref.ibus } as Bus,
  };
}

function buildLine(
  w: LineElementWire,
  buses: Map<string, BusElement>,
  warnings: DeserializeWarning[]
): LineElement {
  const fromBus = buses.get(w.from.elementId)!;
  const toBus   = buses.get(w.to.elementId)!;
  const fromAttach = clampAttach(w.from.attach, w.id, 'from', warnings);
  const toAttach   = clampAttach(w.to.attach,   w.id, 'to',   warnings);
  const fromPoint = attachToPoint(fromAttach, fromBus);
  const toPoint   = attachToPoint(toAttach,   toBus);
  const refAny = w.ref as any;
  const data: Partial<ACLine | Transformer> = {
    ibus: fromBus.data.ibus,
    jbus: toBus.data.ibus,
    ckt:  refAny.ckt,
    ...(typeof refAny.kbus === 'number' && { kbus: refAny.kbus }),
  } as any;

  const inMem: any = {
    id: legacyBranchId(w.type, refAny),
    wireId: w.id,
    type: w.type,
    position: fromPoint,           // renderer reads element.position as the FROM endpoint
    toPos: toPoint,                // renderer reads (element as any).toPos as the TO endpoint
    bounds: lineBounds(fromPoint, toPoint, w.controlPoints),
    fromBus: fromBus.data.ibus,
    toBus:   toBus.data.ibus,
    fromPoint,                     // typed-interface fields (kept for callers that read them)
    toPoint,
    controlPoints: w.controlPoints.map(p => ({ x: p.x, y: p.y })),
    visible: w.visible,
    data: data as ACLine | Transformer,
  };
  return inMem as LineElement;
}

function buildDCLine(
  w: DCLineElementWire,
  buses: Map<string, BusElement>,
  warnings: DeserializeWarning[]
): DCLineElement {
  const fromBus = buses.get(w.from.elementId)!;
  const toBus   = buses.get(w.to.elementId)!;
  const fromAttach = clampAttach(w.from.attach, w.id, 'from', warnings);
  const toAttach   = clampAttach(w.to.attach,   w.id, 'to',   warnings);
  const fromPoint = attachToPoint(fromAttach, fromBus);
  const toPoint   = attachToPoint(toAttach,   toBus);
  const ref = w.ref as any;
  // Reconstruct the data shape the renderer + factory expect, depending on
  // whether this is a two-terminal HVDC or a VSC DC link.
  const data: any = w.type === 'vsc_dc'
    ? { ibus1: ref.ibus1, ibus2: ref.ibus2, name: ref.name }
    : { ipi: ref.ipi, ipr: ref.ipr, ckt: ref.ckt, ...(ref.name && { name: ref.name }) };
  const inMem: any = {
    id: legacyDCLineId(w.type, ref),
    wireId: w.id,
    type: w.type,
    position: fromPoint,
    toPos: toPoint,
    bounds: lineBounds(fromPoint, toPoint, w.controlPoints),
    fromBus: fromBus.data.ibus,
    toBus:   toBus.data.ibus,
    fromPoint,
    toPoint,
    controlPoints: w.controlPoints.map(p => ({ x: p.x, y: p.y })),
    polarity: w.polarity,
    visible: w.visible,
    data: data as TwoTerminalDC | Vscdc,
  };
  return inMem as DCLineElement;
}

function buildDevice(
  w: DeviceElementWire,
  buses: Map<string, BusElement>,
  warnings: DeserializeWarning[]
): DeviceElement {
  const bus = buses.get(w.attach.elementId)!;
  const position = clampAttach(w.attach.position, w.id, 'attach.position', warnings);
  const connectedBusPosition = attachToPoint(position, bus);
  const sideSign = w.attach.side === 'left' || w.attach.side === 'above' ? -1 : 1;
  const devicePosition: Point = {
    x: connectedBusPosition.x + sideSign * DEVICE_OFFSET,
    y: connectedBusPosition.y,
  };

  const refAny = w.ref as any;
  const data: any = { ibus: refAny.ibus, ...('id' in refAny && { id: refAny.id }) };

  return {
    id: legacyDeviceId(w.type, refAny),
    wireId: w.id,
    type: w.type as DeviceElement['type'],
    position: devicePosition,
    bounds: deviceBounds(devicePosition),
    bus: bus.data.ibus,
    connectedBusPosition,
    mirrored: w.mirrored,
    visible: w.visible,
    data: data as Load | Generator | FixedShunt | SwitchedShunt,
  };
}

function buildAnnotation(
  w: AnnotationElementWire,
  buses: Map<string, BusElement>,
  warnings: DeserializeWarning[]
): AnnotationElement {
  // Dangling leader is non-fatal — warn and keep the element.
  if (w.leader?.to?.elementId && !buses.has(w.leader.to.elementId)) {
    warnings.push({
      kind: 'dangling_leader',
      message: `annotation leader points at non-existent element ${w.leader.to.elementId}`,
      elementId: w.id,
    });
  }
  return {
    id: w.id,    // annotations have no model ref; use wireId as runtime id
    wireId: w.id,
    type: 'annotation',
    position: { x: w.position.x, y: w.position.y },
    bounds: annotationBounds(w),
    text: w.text,
    fontSize: w.fontSize,
    fontWeight: w.fontWeight,
    textAlign: w.textAlign,
    color: w.color,
    rotation: w.rotation,
    visible: w.visible,
    leader: w.leader && {
      to: w.leader.to && { elementId: w.leader.to.elementId },
      points: w.leader.points && w.leader.points.map(p => ({ x: p.x, y: p.y })),
    },
  };
}

function buildGroup(w: GroupElementWire, memoryIdByWireId: Map<string, string>): GroupElement {
  return {
    id: w.id,
    wireId: w.id,
    type: 'group',
    position: { x: w.position.x, y: w.position.y },
    bounds: { x: w.position.x, y: w.position.y, width: w.size.width, height: w.size.height },
    size: { width: w.size.width, height: w.size.height },
    label: w.label,
    style: w.style,
    collapsed: w.collapsed,
    // Map wire-format child ids back to in-memory ids so the runtime can
    // resolve children. Any missing id is a bug — checkReferences would have
    // caught it before we got here.
    children: w.children.map(wid => memoryIdByWireId.get(wid) ?? wid),
    visible: w.visible,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry / id helpers
// ─────────────────────────────────────────────────────────────────────────────

function attachToPoint(attach: number, bus: BusElement): Point {
  const length = bus.busHeight ?? DEFAULT_BUS_HEIGHT;
  const top = bus.position.y - length / 2;
  return { x: bus.position.x, y: top + attach * length };
}

function clampAttach(value: number, elementId: string, field: string, warnings: DeserializeWarning[]): number {
  if (value >= 0 && value <= 1) return value;
  warnings.push({
    kind: 'clamped_attach',
    message: `clamped ${field}=${value} to [0, 1] on element ${elementId}`,
    elementId,
  });
  if (value < 0) return 0;
  if (value > 1) return 1;
  return 0; // NaN
}

function busBounds(center: Point, length: number): Bounds {
  return {
    x: center.x - DEFAULT_BUS_WIDTH / 2,
    y: center.y - length / 2,
    width: DEFAULT_BUS_WIDTH,
    height: length,
  };
}

function lineBounds(from: Point, to: Point, controls?: Point[]): Bounds {
  const xs = [from.x, to.x, ...(controls ?? []).map(p => p.x)];
  const ys = [from.y, to.y, ...(controls ?? []).map(p => p.y)];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function deviceBounds(pos: Point): Bounds {
  return { x: pos.x - 16, y: pos.y - 16, width: 32, height: 32 };
}

function annotationBounds(w: AnnotationElementWire): Bounds {
  const fs = w.fontSize ?? 12;
  // Rough box. Real bounds get recomputed on render once the text metric is known.
  return { x: w.position.x, y: w.position.y - fs, width: w.text.length * fs * 0.6, height: fs * 1.2 };
}

/* Legacy in-memory IDs must match exactly what the ElementFactory mints, or
 * loaded cyd elements can't be matched to live ones on load. See:
 *   - factories/ElementFactory.ts (line/transformer creation)
 *   - renderers/elements/{bus,load,generator,fixed_shunt,switched_shunt,transformer}.ts
 */

function legacyBusId(ibus: number): string { return `bus_${ibus}`; }

// Both 2-winding and 3-winding transformers use the same prefix in the factory.
function legacyBranchId(type: string, ref: any): string {
  if (type === 'transformer' || type === 'transformer3w') {
    return `xfm_${ref.ibus}_${ref.jbus}_${ref.ckt}`;
  }
  return `acline_${ref.ibus}_${ref.jbus}_${ref.ckt}`;
}

// Match factory IDs exactly:
//   twotermdc: `twotermdc_${ipi}_${ipr}_${ckt}`
//   vscdc:     `vscdc_${ibus1}_${ibus2}_${name}`
function legacyDCLineId(type: string, ref: any): string {
  if (type === 'vsc_dc') return `vscdc_${ref.ibus1}_${ref.ibus2}_${ref.name}`;
  return `twotermdc_${ref.ipi}_${ref.ipr}_${ref.ckt}`;
}

function legacyDeviceId(type: string, ref: any): string {
  // Factory format: `${prefix}_${ibus}_${subId || '0'}` where prefix maps as:
  //   generator → 'gen'   load → 'load'
  //   fixed_shunt → 'fixed_shunt'   switched_shunt → 'switched_shunt'
  const prefix = type === 'generator' ? 'gen' : type;
  const subId = ref.id !== undefined && ref.id !== null && ref.id !== ''
    ? String(ref.id)
    : '0';
  return `${prefix}_${ref.ibus}_${subId}`;
}
