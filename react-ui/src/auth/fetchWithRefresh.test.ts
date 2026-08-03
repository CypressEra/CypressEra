import { attemptWithRefresh } from './fetchWithRefresh';
import { configureRefresh } from './refresh';
import {
  ACCESS_EXPIRES_AT_STORAGE_KEY,
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
} from './tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('attemptWithRefresh', () => {
  beforeEach(() => {
    localStorage.clear();
    configureRefresh({ apiBaseURL: 'http://api.test' });
  });

  it('passes through a 200 response without invoking refresh', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'good-access');
    localStorage.setItem(
      ACCESS_EXPIRES_AT_STORAGE_KEY,
      String(Date.now() + 10 * 60 * 1000), // 10 min in the future
    );
    const send = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const res = await attemptWithRefresh(send);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('good-access');
  });

  it('refreshes and retries on a 401', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'expired-access');
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'rt-1');
    localStorage.setItem(
      ACCESS_EXPIRES_AT_STORAGE_KEY,
      String(Date.now() + 10 * 60 * 1000), // not expiring soon, so no pre-refresh
    );

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: 'new-access',
        refresh_token: 'rt-2',
        expires_in: 900,
      }),
    ) as unknown as typeof fetch;

    const send = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));

    const res = await attemptWithRefresh(send);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, 'expired-access');
    expect(send).toHaveBeenNthCalledWith(2, 'new-access');
  });

  it('proactively refreshes when willExpireSoon is true', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'expiring-access');
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'rt-1');
    localStorage.setItem(
      ACCESS_EXPIRES_AT_STORAGE_KEY,
      String(Date.now() + 1000), // 1 sec — well within the 60s threshold
    );

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: 'new-access',
        refresh_token: 'rt-2',
        expires_in: 900,
      }),
    ) as unknown as typeof fetch;

    const send = jest.fn().mockResolvedValue(jsonResponse(200, { data: 'ok' }));
    const res = await attemptWithRefresh(send);
    expect(res.status).toBe(200);
    // The first send used the refreshed token, not the about-to-expire one.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('new-access');
  });

  it('does not retry when there is no refresh token and dispatches auth:required', async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, 'access-only');
    // No refresh token in storage.

    const dispatched: string[] = [];
    const handler = (e: Event) => dispatched.push(e.type);
    window.addEventListener('xflow:auth:required', handler);

    const send = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    const res = await attemptWithRefresh(send);

    window.removeEventListener('xflow:auth:required', handler);

    expect(res.status).toBe(401);
    expect(send).toHaveBeenCalledTimes(1);
    expect(dispatched).toContain('xflow:auth:required');
  });
});
