/**
 * Canonical JSON serialization for cypressera.diagram documents.
 *
 * Implements RFC 8785 (JSON Canonicalization Scheme — JCS):
 *   - Object keys lexicographically sorted at every level
 *   - Numbers formatted per JCS rules (delegated to ES2019 Number.prototype.toString,
 *     which the JCS spec uses as its reference algorithm)
 *   - No insignificant whitespace
 *   - UTF-8 output, no BOM
 *
 * Two serializations of the same in-memory value MUST produce byte-identical output.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirement: Canonical JSON serialization)
 *
 * Reference: https://www.rfc-editor.org/rfc/rfc8785
 */

/** Serialize a JSON-compatible value to canonical JSON per RFC 8785. */
export function canonicalize(value: unknown): string {
  return stringify(value);
}

/** Convenience: canonical JSON encoded as UTF-8 bytes. */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) {
    // JCS forbids undefined. Treat it as a programmer error rather than silently dropping.
    throw new Error('canonicalize: undefined is not a valid JSON value');
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return numberToString(value);
    case 'string':
      return stringToJson(value);
    case 'object':
      if (Array.isArray(value)) return arrayToJson(value);
      return objectToJson(value as Record<string, unknown>);
    case 'bigint':
      throw new Error('canonicalize: bigint is not representable in canonical JSON');
    default:
      throw new Error(`canonicalize: unsupported value type ${typeof value}`);
  }
}

function arrayToJson(arr: unknown[]): string {
  const parts = arr.map(stringify);
  return `[${parts.join(',')}]`;
}

function objectToJson(obj: Record<string, unknown>): string {
  // JCS sorts members by the UTF-16 code-unit values of their keys.
  // JS's default string comparison does exactly this.
  const keys = Object.keys(obj)
    .filter(k => obj[k] !== undefined) // JCS: drop undefined-valued members
    .sort();
  const parts = keys.map(k => `${stringToJson(k)}:${stringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Number serialization per RFC 8785 §3.2.2.3:
 *   - NaN and ±Infinity are forbidden
 *   - Integers in the safe range render as integers
 *   - Otherwise, ECMAScript 2019 Number.prototype.toString output is canonical
 */
function numberToString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`canonicalize: non-finite number ${n} is not representable`);
  }
  if (Object.is(n, -0)) return '0';
  return n.toString();
}

/**
 * String serialization per RFC 8785 §3.2.2.2:
 *   - Use the ES2019 JSON.stringify rules but normalize escapes
 *   - JSON.stringify already produces the canonical form for strings,
 *     including the required \uXXXX escapes for control chars and the
 *     short escapes for \b \f \n \r \t \\ \" \/
 */
function stringToJson(s: string): string {
  return JSON.stringify(s);
}
