import {
  ACCESS_EXPIRES_AT_STORAGE_KEY,
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getStoredTokens,
  isAccessExpired,
  setTokens,
  willExpireSoon,
} from './tokenStore';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.sig`;
}

describe('tokenStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setTokens writes access, refresh, and expires_at', () => {
    const token = makeJwt({ uid: 'u1' });
    setTokens({ access: token, refresh: 'rt-1', expiresIn: 900 });
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(token);
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('rt-1');
    const expiresAt = Number(localStorage.getItem(ACCESS_EXPIRES_AT_STORAGE_KEY));
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 900 * 1000 + 50);
  });

  it('setTokens leaves refresh alone when not provided', () => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'pre-existing-rt');
    setTokens({ access: 'access-2' });
    expect(getRefreshToken()).toBe('pre-existing-rt');
    expect(getAccessToken()).toBe('access-2');
  });

  it('clearTokens removes all three keys', () => {
    setTokens({ access: 'a', refresh: 'r', expiresIn: 900 });
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem(ACCESS_EXPIRES_AT_STORAGE_KEY)).toBeNull();
  });

  it('getStoredTokens returns null with no access token', () => {
    expect(getStoredTokens()).toBeNull();
  });

  it('willExpireSoon prefers persisted expires_at over JWT exp', () => {
    // JWT exp is far in the future, but persisted expires_at is imminent.
    const tokenFarExp = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    setTokens({ access: tokenFarExp, expiresIn: 1 }); // 1 sec
    expect(willExpireSoon(60_000)).toBe(true);
  });

  it('willExpireSoon falls back to JWT exp when no persisted expires_at', () => {
    const tokenFarExp = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokenFarExp);
    // No expires_at written.
    expect(willExpireSoon(60_000)).toBe(false);
  });

  it('willExpireSoon returns true when no access token at all', () => {
    expect(willExpireSoon(60_000)).toBe(true);
  });

  it('isAccessExpired honors the 60s skew buffer via JWT exp', () => {
    const justAhead = makeJwt({ exp: Math.floor(Date.now() / 1000) + 30 });
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, justAhead);
    expect(isAccessExpired()).toBe(true);

    const farAhead = makeJwt({ exp: Math.floor(Date.now() / 1000) + 600 });
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, farAhead);
    expect(isAccessExpired()).toBe(false);
  });
});
