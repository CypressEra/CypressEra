export type JwtPayload = {
  uid?: string;
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
};

export function safeDecodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

const CLOCK_SKEW_MS = 60_000;

export function isTokenExpired(token: string): boolean {
  return willExpireWithin(token, CLOCK_SKEW_MS);
}

// True if the JWT's exp is within `thresholdMs` of "now". A missing exp is
// treated as "not expiring" so callers fall through to the reactive 401 path.
export function willExpireWithin(token: string, thresholdMs: number): boolean {
  const payload = safeDecodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload.exp;
  if (typeof exp !== 'number') return false;
  return exp * 1000 <= Date.now() + thresholdMs;
}
