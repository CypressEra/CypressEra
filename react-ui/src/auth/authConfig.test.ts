import { loadAuthConfig, getAuthConfig, isNoAuthMode, renewNoAuthSession } from './authConfig';
import { attemptWithRefresh } from './fetchWithRefresh';
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from './tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const NONE_CONFIG = {
  mode: 'none',
  google_enabled: false,
  email_verification_enabled: false,
};

describe('authConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    // Reset module state back to password mode so other tests see the legacy
    // fallback (module keeps last successful load).
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { mode: 'password', google_enabled: true, email_verification_enabled: true }),
    ) as unknown as typeof fetch;
    await loadAuthConfig('http://api.test');
  });

  it('falls back to legacy full-login behavior when the endpoint 404s', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, { error: 'not found' })) as unknown as typeof fetch;
    const cfg = await loadAuthConfig('http://api.test');
    expect(cfg.mode).toBe('password');
    expect(cfg.googleEnabled).toBe(true);
    expect(cfg.emailVerificationEnabled).toBe(true);
    expect(isNoAuthMode()).toBe(false);
  });

  it('falls back to legacy behavior on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const cfg = await loadAuthConfig('http://api.test');
    expect(cfg.mode).toBe('password');
    expect(isNoAuthMode()).toBe(false);
  });

  it('adopts none mode from the server and renews sessions', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/api/v1/auth/config')) {
        return Promise.resolve(jsonResponse(200, NONE_CONFIG));
      }
      if (String(url).endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          jsonResponse(200, {
            access_token: 'synthetic-token',
            token_type: 'Bearer',
            expires_in: 2592000,
            user: { id: '00000000-0000-0000-0000-000000000001', email: 'local@cypressera.local', role: 'admin' },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    }) as unknown as typeof fetch;

    const cfg = await loadAuthConfig('http://api.test');
    expect(cfg.mode).toBe('none');
    expect(cfg.googleEnabled).toBe(false);
    expect(isNoAuthMode()).toBe(true);

    const session = await renewNoAuthSession();
    expect(session?.access).toBe('synthetic-token');
    expect(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe('synthetic-token');
    // Sessions never carry refresh tokens.
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('attemptWithRefresh renews the session and retries on 401 in none mode, without auth-required', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/api/v1/auth/config')) {
        return Promise.resolve(jsonResponse(200, NONE_CONFIG));
      }
      if (String(url).endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          jsonResponse(200, { access_token: 'renewed-token', expires_in: 2592000, user: { id: 'u', email: 'e' } }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    }) as unknown as typeof fetch;
    await loadAuthConfig('http://api.test');

    const authRequired = jest.fn();
    window.addEventListener('xflow:auth:required', authRequired);

    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'stale-token');
    const send = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));

    const res = await attemptWithRefresh(send);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('renewed-token');
    expect(authRequired).not.toHaveBeenCalled();

    window.removeEventListener('xflow:auth:required', authRequired);
  });
});
