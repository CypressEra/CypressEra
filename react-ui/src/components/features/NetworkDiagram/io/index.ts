/**
 * cypressera.diagram I/O — save and load the network diagram plot.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 *
 * Public surface:
 *   - serialize(state, options?)  → CypressEraDiagram
 *   - deserialize(input)          → { state, warnings } | errors
 *   - mintElementId()             → stable UUIDv7 element id
 *   - DOCUMENT_TYPE, CURRENT_SCHEMA_VERSION
 */

export * from './document';
export * from './ids';
export * from './canonical';
export * from './contentHash';
export * from './validator';
export * from './migrations';
export * from './serialize';
export * from './deserialize';
