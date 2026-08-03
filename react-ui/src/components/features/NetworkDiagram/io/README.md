# Diagram Save Format — `cypressera.diagram` v1.0

This directory implements **canonical persistence for the network diagram plot** — the positions, connections, layers, and visual style that make up an SLD. It does **not** carry electrical model parameters (`r`, `x`, `baskv`, `pmax`…) or operating-point state (`vm`, `va`, `pg`, `tap`…); those live in PSS/E RAW / your model store / a future case-state file.

- **JSON Schema**: [`schema.json`](./schema.json) — bundled into the build via `import`; the `$schema` URL in saved files is informational.
- **Wire-format TypeScript types**: [`document.ts`](./document.ts)
- **Spec** (requirements): [`openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md`](../../../../../../openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md)
- **Design** (rationale): [`openspec/changes/add-diagram-save-format/design.md`](../../../../../../openspec/changes/add-diagram-save-format/design.md)

## Public API

```ts
import {
  serialize, deserialize,           // round-trip
  validate, assertValid,             // JSON Schema validation
  canonicalize, computeContentHash,  // RFC 8785 + sha256
  mintElementId,                     // UUIDv7
  CURRENT_SCHEMA_VERSION,            // "1.0"
  DOCUMENT_TYPE,                     // "cypressera.diagram"
} from '@/components/features/NetworkDiagram/io';
```

### Save

```ts
const result = await serialize(elements, {
  title:       'IEEE 14-bus',
  modelRef:    { name: 'ieee14', kind: 'psse.raw' },
  contentHash: 'auto',   // hash when canonical bytes ≥ 1 MB
});
// → { doc, bytes, warnings }
```

`serialize` mutates `element.wireId` on any passed-in element that lacks one, so the next save preserves the same identity.

### Load

```ts
const result = await deserialize(bytesOrString);
if (result.ok) {
  // result.elements   → DiagramElement[]
  // result.warnings   → DeserializeWarning[] (clamped attach, hash mismatch, …)
  // result.doc        → the validated wire document
} else {
  // result.errors     → ValidationError[] with JSON Pointer paths
}
```

`deserialize` accepts plain JSON strings, UTF-8 bytes, or gzip-compressed bytes (auto-detected via magic header).

### UI

Diagram I/O is driven from the menu bar in the standard app shell — the file lives in the user's server-side `diagram` library:

- **Open → Diagram** (or any diagram in the file-selector modal) — calls `loadDiagram` on the active `NetworkDiagram` ref after downloading the file.
- **Save → Diagram** (`⌥⌘S`) — serializes the current canvas and uploads it under the currently-loaded diagram filename. Falls back to Save As if no filename is set.
- **Save As → Diagram** — opens the save-mode file picker rooted at `/Diagram`; user types a name and confirms.
- **Upload → Diagram** — uploads a local `.cyd` / `.cyd.gz` file into the server library without applying it.

Both menu items are disabled when no diagram is plotted (tooltip: "Plot the diagram first.").

Direct ref access still works if you need to drive I/O programmatically:
```ts
await diagramRef.current!.saveDiagram(options);
await diagramRef.current!.loadDiagram(input);
```

The legacy floating `<DiagramIOToolbar>` (in `../components/DiagramIOToolbar.tsx`) is no longer mounted by `NetworkView` but remains importable directly for embedded use cases.

## Document shape

```jsonc
{
  "$schema":   "https://cypressera.ai/schemas/cypressera-diagram-1.0.json",
  "type":      "cypressera.diagram",
  "version":   "1.0",
  "id":        "0190d8e0-7000-7000-8000-000000000000",   // UUIDv7
  "createdAt": "2026-05-22T10:00:00.000Z",
  "modifiedAt":"2026-05-22T14:32:11.000Z",
  "app":       { "name": "CypressEra", "version": "0.7.3" },

  "title":       "IEEE 14-bus benchmark",
  "modelRef":    { "name": "ieee14", "kind": "psse.raw" },
  "view":        { "scale": 1, "offsetX": 0, "offsetY": 0 },
  "layers":      [{ "id": "default", "name": "Default", "visible": true, "zIndex": 0 }],

  "elements": [
    { "id": "<uuid>", "type": "bus", "ref": { "ibus": 1 },
      "layer": "default", "position": { "x": 100, "y": 200 },
      "geometry": { "length": 60, "orientation": "vertical" } },

    { "id": "<uuid>", "type": "acline", "ref": { "ibus": 1, "jbus": 2, "ckt": "1" },
      "layer": "default",
      "from": { "elementId": "<bus-uuid>", "attach": 1.0 },
      "to":   { "elementId": "<bus-uuid>", "attach": 0.0 },
      "controlPoints": [] },

    { "id": "<uuid>", "type": "generator", "ref": { "ibus": 1, "id": "1" },
      "layer": "default",
      "attach": { "elementId": "<bus-uuid>", "position": 0.2, "side": "left" },
      "mirrored": false },

    { "id": "<uuid>", "type": "annotation", "layer": "default",
      "position": { "x": 150, "y": 80 }, "text": "138 kV bus" },

    { "id": "<uuid>", "type": "group", "layer": "default",
      "position": { "x": 60, "y": 140 }, "size": { "width": 300, "height": 140 },
      "label": "North substation",
      "children": ["<bus-uuid>", "<bus-uuid>", "<acline-uuid>"] }
  ],

  "contentHash": "sha256:…",
  "extensions":  { "ai.cypressera.studyRef": "study_2026_05_summer_peak" }
}
```

## Element types

**First-class in v1.0** (have concrete shapes the loader will fully reconstruct):

`bus`, `acline`, `transformer`, `transformer3w`, `two_term_dc`, `vsc_dc`, `generator`, `load`, `fixed_shunt`, `switched_shunt`, `annotation`, `group`.

**Reserved tokens in v1.0** (schema accepts them as opaque pass-through; promoted in v1.1 when renderers land):

`breaker`, `disconnect`, `capacitor`, `reactor`.

## Reference model: identity, attach, intent

- **`id`** — UUIDv7. Every element has a stable wire identity. The same model object can appear in multiple visual elements (e.g., a bus split for clarity); each gets its own UUID. The legacy in-memory id (`bus_1`, `acline_1_2_1`) is preserved as a runtime handle via `DiagramElement.wireId`.
- **`ref`** — the natural PSS/E composite key for the model object this element depicts. Never carries electrical params.
- **`attach`** — fractional position along the target bus's drawn length, in `[0, 1]`. Lines store `from`/`to` attach; devices store one `attach` + `side`.
- **Persist intent, recompute geometry** — the file stores `position`, `geometry`, `controlPoints`, `attach`, `mirrored`. Derived fields (`bounds`, `fromPoint`, `toPoint`, `connectedBusPosition`) are recomputed on load against current style.

## Canonical JSON & content hash

Serialization uses [RFC 8785 (JSON Canonicalization Scheme)](https://www.rfc-editor.org/rfc/rfc8785): sorted keys, deterministic number formatting, no whitespace. Two serializations of the same document produce byte-identical output, which is what makes `contentHash` reproducible across implementations (TS today, future Python/Rust readers) and what gives clean git diffs.

## Versioning & migrations

`version: "1.0"` is the schema version of THIS document, distinct from the document `type` family. MINOR bumps add fields without breaking older readers; MAJOR bumps require migration.

v1.0 ships with the migration registry skeleton and zero registered migrations. Future versions register them via `registerMigration({ from, to, apply })`.

## Extensions

`extensions["reverse.dns.key"]` is the escape hatch. Use it to carry data not in the schema. Unknown extension keys survive round-trips so tools that don't recognize them don't lose data.

## What's NOT in this format

- Electrical parameters (`r`, `x`, `b`, `baskv`, `pmax`, `mbase`, …)
- Operating-point state (`vm`, `va`, `pg`, `qg`, `tap` value, `step` value, `stat`, switch positions)
- Solver outputs / contingency definitions / time series
- SVG / PNG export (use the existing `exportAsPNG()` ref method for those)
