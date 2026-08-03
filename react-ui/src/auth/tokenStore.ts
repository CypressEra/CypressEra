import { isTokenExpired, willExpireWithin } from './jwt';

export const ACCESS_TOKEN_STORAGE_KEY = 'xflow_access_token';
export const REFRESH_TOKEN_STORAGE_KEY = 'xflow_refresh_token';
export const ACCESS_EXPIRES_AT_STORAGE_KEY = 'xflow_access_expires_at';

export type StoredTokens = {
  access: string;
  refresh: string | null;
  // Wall-clock ms epoch when the access token expires (best-effort: derived
  // from expiresIn at issue time, not the JWT exp claim).
  accessExpiresAt: number | null;
};

function readNumber(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function getStoredTokens(): StoredTokens | null {
  const access = getAccessToken();
  if (!access) return null;
  return {
    access,
    refresh: getRefreshToken(),
    accessExpiresAt: readNumber(ACCESS_EXPIRES_AT_STORAGE_KEY),
  };
}

export type SetTokensInput = {
  access: string;
  refresh?: string | null;
  expiresIn?: number | null; // seconds, as returned by /auth/login or /auth/refresh
};

export function setTokens(input: SetTokensInput): void {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, input.access);
  if (input.refresh) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, input.refresh);
  }
  if (typeof input.expiresIn === 'number' && input.expiresIn > 0) {
    localStorage.setItem(
      ACCESS_EXPIRES_AT_STORAGE_KEY,
      String(Date.now() + input.expiresIn * 1000),
    );
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(ACCESS_EXPIRES_AT_STORAGE_KEY);
}

// willExpireSoon prefers the persisted expires_at (wall-clock) when available,
// falling back to decoding the JWT exp claim. Returns true if access is missing.
export function willExpireSoon(thresholdMs: number): boolean {
  const access = getAccessToken();
  if (!access) return true;
  const persisted = readNumber(ACCESS_EXPIRES_AT_STORAGE_KEY);
  if (persisted !== null) {
    return persisted <= Date.now() + thresholdMs;
  }
  return willExpireWithin(access, thresholdMs);
}

export function isAccessExpired(): boolean {
  const access = getAccessToken();
  if (!access) return true;
  return isTokenExpired(access);
}
