import { configureRefresh, refreshTokens } from './refresh';
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from './tokenStore';

describe('refreshTokens single-flight', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    configureRefresh({ apiBaseURL: 'http://api.test' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns null when no refresh token is stored', async () => {
    const result = await refreshTokens();
    expect(result).toBeNull();
  });

  it('coalesces concurrent callers into a single network call', async () => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'rt-old');

    let resolveFetch: (v: any) => void = () => {};
    const fetchMock = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    // Fire 5 concurrent refreshes. doRefresh briefly awaits a peer-broadcast
    // window before issuing fetch, so wait a tick past that before resolving.
    const promises = Array.from({ length: 5 }, () => refreshTokens());
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 900,
      }),
    });

    const results = await Promise.all(promises);
    // All five callers receive the same result.
    for (const r of results) {
      expect(r).toEqual({ access: 'new-access', refresh: 'new-refresh', expiresIn: 900 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe('new-access');
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('new-refresh');
  });

  it('returns null and clears tokens when /auth/refresh 401s', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'old-access');
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'rt-revoked');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    }) as unknown as typeof fetch;

    const result = await refreshTokens();
    expect(result).toBeNull();
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('returns null without clearing tokens when refresh 404s (toggle off)', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'old-access');
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'rt-1');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await refreshTokens();
    expect(result).toBeNull();
    // Tokens stay so the original code path (LoginModal etc.) can decide.
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe('old-access');
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('rt-1');
  });
});
