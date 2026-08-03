/**
 * Diagram element ID minting.
 *
 * UUIDv7 chosen for time-ordering, sortability, debuggability, and no
 * coordination needed across distributed workers (e.g. future cloud solver,
 * multi-user edit).
 *
 * Implemented inline rather than via the `uuidv7` package because that
 * package ships only ESM, which the project's Jest+CRA config can't parse
 * without ejecting. The algorithm here matches draft-ietf-uuidrev-rfc4122bis
 * §5.7 (UUIDv7).
 *
 * Spec: openspec/changes/add-diagram-save-format/specs/diagram-save-format/spec.md
 * (Requirement: Stable diagram element identity)
 */

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mint a fresh diagram-scoped element ID (UUIDv7). */
export function mintElementId(): string {
  const ts = Date.now();                                           // 48-bit ms timestamp
  const tsHex = ts.toString(16).padStart(12, '0');                 // 12 hex chars

  const rnd = new Uint8Array(10);
  getRandom(rnd);

  // Bytes 0-1 → rand_a (16 bits); top 4 bits set to version 7 (0b0111).
  rnd[0] = (rnd[0] & 0x0f) | 0x70;
  // Bytes 2-3 → rand_b high; top 2 bits set to variant (0b10).
  rnd[2] = (rnd[2] & 0x3f) | 0x80;

  const hex = Array.from(rnd, b => b.toString(16).padStart(2, '0')).join('');

  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 20)}`;
}

/** True if the given string is a valid UUIDv7. */
export function isElementId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}

function getRandom(out: Uint8Array): void {
  const c = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(out);
    return;
  }
  // Last-resort fallback (test envs without Web Crypto). Not cryptographically
  // strong, but sufficient for collision avoidance in the test harness.
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
}
