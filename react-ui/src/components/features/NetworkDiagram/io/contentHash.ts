/**
 * Content hashing for cypressera.diagram documents.
 *
 * Hash = sha256(canonical_json(doc with `contentHash` field removed)).
 * Computed at save time; verified at load time with a non-fatal warning on mismatch.
 *
 * Uses the Web Crypto API (window.crypto.subtle in browsers, globalThis.crypto in
 * Node 16+). The async signature is necessary because SubtleCrypto.digest is async.
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirement: Optional content hash)
 */

import { canonicalizeBytes } from './canonical';
import type { CypressEraDiagram } from './document';

const HASH_PREFIX = 'sha256:';

/**
 * Compute the canonical content hash of a diagram document.
 * The document's own `contentHash` field is excluded from the hashed input.
 */
export async function computeContentHash(doc: CypressEraDiagram): Promise<string> {
  const { contentHash: _ignored, ...rest } = doc;
  const bytes = canonicalizeBytes(rest);
  // Copy into a fresh ArrayBuffer to satisfy the stricter BufferSource typing
  // some TS lib variants apply (Uint8Array<ArrayBufferLike> vs ArrayBuffer).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const digest = await getCrypto().digest('SHA-256', ab);
  return HASH_PREFIX + toHex(new Uint8Array(digest));
}

/** True if `value` looks like a `"sha256:<hex>"` string. */
export function isContentHash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

/**
 * Verify that a document's stored `contentHash` matches its canonical hash.
 * Returns { match: true } when no hash is stored (nothing to verify).
 */
export async function verifyContentHash(
  doc: CypressEraDiagram
): Promise<{ match: true } | { match: false; expected: string; actual: string }> {
  const stored = doc.contentHash;
  if (!stored) return { match: true };
  const computed = await computeContentHash(doc);
  if (computed === stored) return { match: true };
  return { match: false, expected: stored, actual: computed };
}

function getCrypto(): SubtleCrypto {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error('contentHash: Web Crypto API is not available in this environment');
  }
  return c.subtle;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
