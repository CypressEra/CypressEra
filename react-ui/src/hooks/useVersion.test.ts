import { renderHook, waitFor, act } from '@testing-library/react';
import { useVersion } from './useVersion';

describe('useVersion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns version and build from a successful /api/version fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.2.3', build: 'production' }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useVersion());

    await waitFor(() => expect(result.current.version).toBe('1.2.3'));
    expect(result.current.build).toBe('production');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the window regains focus', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.0.0', build: 'development' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '2.0.0', build: 'production' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useVersion());
    await waitFor(() => expect(result.current.version).toBe('1.0.0'));
    expect(result.current.build).toBe('development');

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.version).toBe('2.0.0'));
    expect(result.current.build).toBe('production');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to 0.0.0 / development when the fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const { result } = renderHook(() => useVersion());

    // Give the rejected promise a tick to settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.version).toBe('0.0.0');
    expect(result.current.build).toBe('development');
  });

  it('returns the defaults synchronously before the initial fetch resolves', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;

    const { result } = renderHook(() => useVersion());

    expect(result.current.version).toBe('0.0.0');
    expect(result.current.build).toBe('development');
  });
});
