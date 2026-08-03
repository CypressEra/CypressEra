import { setTokens } from './tokenStore';

// Server-reported authentication configuration (GET /api/v1/auth/config).
//
// The fallback is deliberately "everything enabled": when the endpoint is
// unreachable or 404s (an older api-server image), the UI must behave exactly
// as it did before auth modes existed — full login modal, Google button shown.
export type AuthMode = 'password' | 'none';

export type AuthConfig = {
  mode: AuthMode;
  googleEnabled: boolean;
  emailVerificationEnabled: boolean;
};

const LEGACY_FALLBACK: AuthConfig = {
  mode: 'password',
  googleEnabled: true,
  emailVerificationEnabled: true,
};

let current: AuthConfig = LEGACY_FALLBACK;
let apiBase = '';

export function getAuthConfig(): AuthConfig {
  return current;
}

export function isNoAuthMode(): boolean {
  return current.mode === 'none';
}

export async function loadAuthConfig(apiBaseURL: string): Promise<AuthConfig> {
  apiBase = apiBaseURL.replace(/\/+$/, '');
  try {
    const resp = await fetch(`${apiBase}/api/v1/auth/config`);
    if (!resp.ok) return current;
    const body = await resp.json();
    if (body && (body.mode === 'none' || body.mode === 'password')) {
      current = {
        mode: body.mode,
        googleEnabled: !!body.google_enabled,
        emailVerificationEnabled: !!body.email_verification_enabled,
      };
    }
  } catch {
    // Network error → keep the legacy fallback.
  }
  return current;
}

// ---------------------------------------------------------------------------
// No-auth sessions
// ---------------------------------------------------------------------------

export type NoAuthSession = {
  access: string;
  expiresIn: number;
  user: { id: string; email: string; role?: string };
};

// Fired on window after every successful renewal so AuthProvider can sync
// React state with the token that is already in the tokenStore.
export const NOAUTH_SESSION_EVENT = 'xflow:auth:session-renewed';

let inflight: Promise<NoAuthSession | null> | null = null;

// renewNoAuthSession fetches a synthetic-user token (POST /auth/session).
// Concurrent callers share one in-flight request. Unlike refresh tokens,
// sessions are free and non-rotating, so there is no cross-tab coordination —
// every tab may simply fetch its own.
export function renewNoAuthSession(): Promise<NoAuthSession | null> {
  if (inflight) return inflight;
  inflight = doRenew().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRenew(): Promise<NoAuthSession | null> {
  if (!apiBase) {
    console.warn('[auth/config] apiBaseURL not configured; cannot fetch session');
    return null;
  }
  let resp: Response;
  try {
    resp = await fetch(`${apiBase}/api/v1/auth/session`, { method: 'POST' });
  } catch (err) {
    console.warn('[auth/config] session fetch network error', err);
    return null;
  }
  if (!resp.ok) return null;

  let body: any;
  try {
    body = await resp.json();
  } catch {
    return null;
  }
  const access: string | undefined = body?.access_token;
  const expiresIn: number | undefined = body?.expires_in;
  if (!access || typeof expiresIn !== 'number') return null;

  const session: NoAuthSession = {
    access,
    expiresIn,
    user: {
      id: body?.user?.id ?? '',
      email: body?.user?.email ?? '',
      role: body?.user?.role,
    },
  };

  setTokens({ access, expiresIn });
  try {
    window.dispatchEvent(new CustomEvent(NOAUTH_SESSION_EVENT, { detail: session }));
  } catch {
    // ignore
  }
  return session;
}
