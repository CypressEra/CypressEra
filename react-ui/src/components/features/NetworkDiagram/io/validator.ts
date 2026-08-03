/**
 * JSON Schema 2020-12 validation for cypressera.diagram documents.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirement: JSON Schema validation)
 */

import Ajv2020, { ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import schema from './schema.json';

export interface ValidationError {
  path: string;          // JSON Pointer to the offending field
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  // Avoid coercing in/out values — wire format is precise.
  coerceTypes: false,
});
addFormats(ajv);

const compiled = ajv.compile(schema);

/** Validate a parsed JSON document against the v1.0 cypressera.diagram schema. */
export function validate(doc: unknown): ValidationResult {
  const ok = compiled(doc);
  if (ok) return { ok: true };
  const errors = (compiled.errors ?? []).map(toValidationError);
  return { ok: false, errors };
}

function toValidationError(err: ErrorObject): ValidationError {
  return {
    path: err.instancePath || '/',
    message: err.message ?? 'validation failed',
    keyword: err.keyword,
    params: err.params,
  };
}

/** Throw on validation failure. Used by serialize() — a save-side validation
 *  failure is a programmer bug, not a user error. */
export function assertValid(doc: unknown): void {
  const result = validate(doc);
  if (result.ok) return;
  const summary = result.errors
    .map(e => `  ${e.path}: ${e.message}`)
    .join('\n');
  throw new Error(`cypressera.diagram validation failed:\n${summary}`);
}

export { schema };
