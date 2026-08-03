/**
 * Duplicate tool-call detection: normalize (name + arguments) so same params
 * in different order/whitespace compare equal.
 *
 * For getNetwork: calls with no args or only sessionId are treated as the same.
 */
function canonicalArgsString(argsStr: string): string {
  const normalized = argsStr == null || String(argsStr).trim() === '' ? '{}' : String(argsStr).trim();
  try {
    const parsed = JSON.parse(normalized);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return normalized;
    const sorted = Object.keys(parsed)
      .sort()
      .reduce((acc: Record<string, unknown>, k) => {
        acc[k] = parsed[k];
        return acc;
      }, {});
    return JSON.stringify(sorted);
  } catch {
    return normalized;
  }
}

export function normalizedCallKey(name: string, argsStr: string): string {
  const canonical = canonicalArgsString(argsStr ?? '');
  const key = `${name}\u0000${canonical}`;
  try {
    const o = JSON.parse(canonical);
    if (o && typeof o === 'object' && !Array.isArray(o) && name === 'getNetwork') {
      const keys = Object.keys(o);
      if (keys.length === 0 || (keys.length === 1 && keys[0] === 'sessionId')) {
        return 'getNetwork\u0000{}';
      }
    }
  } catch {
    // use key as-is
  }
  return key;
}

/** Message returned to the model when a tool was already called with the same parameters. */
export const DUPLICATE_CALL_MESSAGE =
  'This function was already called with the same parameters in the last turn. Do not call it again. Use the previous result or respond to the user.';
