import { getAccessToken, getRefreshToken, willExpireSoon } from './tokenStore';
import { refreshTokens } from './refresh';
import { isNoAuthMode, renewNoAuthSession } from './authConfig';

const PROACTIVE_THRESHOLD_MS = 60_000;

// attemptWithRefresh wraps a single HTTP call so it transparently handles:
//   1. Proactive refresh: if the access token will expire within ~60s and we
//      have a refresh token, refresh before the call so the request goes
//      through with a fresh token (no 401 round-trip in the common case).
//   2. Reactive refresh: if the call returns 401, attempt one refresh and one
//      retry. The retry is depth-capped at one to avoid loops.
//   3. Fallthrough: if refresh fails (no refresh token, refresh 401'd),
//      dispatch xflow:auth:required so the LoginModal opens, and surface the
//      original response so the caller's existing error path runs.
//
// `send` receives the access token to use and must build the request with it.
// It is invoked at most twice.
export async function attemptWithRefresh(
  send: (accessToken: string | null) => Promise<Response>,
): Promise<Response> {
  if (getRefreshToken() && willExpireSoon(PROACTIVE_THRESHOLD_MS)) {
    await refreshTokens();
  }

  let token = getAccessToken();
  let response = await send(token);
  if (response.status !== 401) return response;

  // No-auth mode has no refresh tokens and must never surface the login
  // modal: renew the synthetic-user session and retry once instead.
  if (isNoAuthMode()) {
    const session = await renewNoAuthSession();
    if (session) return send(session.access);
    return response;
  }

  if (!getRefreshToken()) {
    dispatchAuthRequired();
    return response;
  }

  const refreshed = await refreshTokens();
  if (!refreshed) {
    dispatchAuthRequired();
    return response;
  }

  return send(refreshed.access);
}

function dispatchAuthRequired(): void {
  try {
    window.dispatchEvent(new CustomEvent('xflow:auth:required'));
  } catch {
    // ignore
  }
}
