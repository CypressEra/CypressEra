import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDialog, DIALOG_IDS } from '../components/common/Dialog';
import { LoginModal } from '../components/common/Modal/variants/login/LoginModal';
import { PowerFlowApp } from '../sdk';
import { safeDecodeJwtPayload, isTokenExpired } from './jwt';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  willExpireSoon,
} from './tokenStore';
import { configureRefresh, refreshTokens, subscribeAuthBroadcast } from './refresh';
import {
  loadAuthConfig,
  isNoAuthMode,
  renewNoAuthSession,
  NOAUTH_SESSION_EVENT,
  type NoAuthSession,
} from './authConfig';

type AuthUser = {
  id: string;
  email: string;
  role?: string;
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
};

type RequireAuthOptions = {
  reason?: string;
};

type SetAccessTokenExtras = {
  refreshToken?: string | null;
  expiresIn?: number | null;
};

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAccessToken: (token: string | null, user?: AuthUser | null, extras?: SetAccessTokenExtras) => void;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  requireAuth: (options?: RequireAuthOptions) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROACTIVE_REFRESH_THRESHOLD_MS = 120_000;
const PROACTIVE_REFRESH_INTERVAL_MS = 60_000;

function inferUserFromToken(token: string): AuthUser | null {
  const payload = safeDecodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  const id = (payload.uid as string | undefined) || (payload.sub as string | undefined);
  const email = payload.email as string | undefined;
  const role = payload.role as string | undefined;
  if (typeof id !== 'string' || typeof email !== 'string') return null;
  return { id, email, role: typeof role === 'string' ? role : undefined };
}

export function AuthProvider({
  children,
  apiBaseURL,
}: {
  children: React.ReactNode;
  apiBaseURL: string;
}) {
  const { openDialog, closeDialog, isDialogOpen } = useDialog();

  // One-time setup of the refresh service (gives it the api base URL).
  useEffect(() => {
    configureRefresh({ apiBaseURL });
  }, [apiBaseURL]);

  // Discover the server's auth configuration. In no-auth mode, silently
  // obtain a synthetic-user session so the app opens with no login UI. If
  // the config endpoint is unreachable (older api-server), the module keeps
  // its legacy fallback and the normal login flow runs unchanged.
  useEffect(() => {
    let cancelled = false;
    void loadAuthConfig(apiBaseURL).then((cfg) => {
      if (cancelled || cfg.mode !== 'none') return;
      void renewNoAuthSession();
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseURL]);

  // Adopt tokens minted by renewNoAuthSession (boot, or a 401 retry deep in
  // the fetch layer): tokenStore is already updated, sync React state.
  useEffect(() => {
    const handler = (e: Event) => {
      const session = (e as CustomEvent<NoAuthSession>).detail;
      if (!session?.access) return;
      setState({
        accessToken: session.access,
        user: session.user?.id ? session.user : inferUserFromToken(session.access),
      });
    };
    window.addEventListener(NOAUTH_SESSION_EVENT, handler);
    return () => window.removeEventListener(NOAUTH_SESSION_EVENT, handler);
  }, []);

  const [state, setState] = useState<AuthState>(() => {
    const stored = getAccessToken();
    if (!stored) return { accessToken: null, user: null };
    if (isTokenExpired(stored)) {
      // If we have a refresh token, leave the access token in place; the boot
      // effect below will refresh it. Otherwise this is a stale legacy session.
      if (!getRefreshToken()) {
        clearTokens();
        return { accessToken: null, user: null };
      }
    }
    return { accessToken: stored, user: inferUserFromToken(stored) };
  });

  const isAuthenticated = !!state.accessToken;

  const setAccessToken = useCallback(
    (token: string | null, user?: AuthUser | null, extras?: SetAccessTokenExtras) => {
      setState({
        accessToken: token,
        user: token ? (user || inferUserFromToken(token)) : null,
      });
      if (token) {
        setTokens({
          access: token,
          refresh: extras?.refreshToken ?? undefined,
          expiresIn: extras?.expiresIn ?? undefined,
        });
      } else {
        clearTokens();
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    // No-auth mode has no account to log out of: treat it as a session
    // reset — clear local state and immediately mint a fresh session.
    if (isNoAuthMode()) {
      setAccessToken(null);
      PowerFlowApp.clearSession();
      PowerFlowApp.clearCache();
      void renewNoAuthSession();
      return;
    }

    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await fetch(`${apiBaseURL.replace(/\/+$/, '')}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        // Best-effort: server logout is fire-and-forget; local cleanup always runs.
      }
    }
    setAccessToken(null);
    PowerFlowApp.clearSession();
    PowerFlowApp.clearCache();
  }, [apiBaseURL, setAccessToken]);

  const logoutAllDevices = useCallback(async () => {
    // No refresh tokens exist in no-auth mode (and /auth/logout-all is not
    // mounted): same session-reset semantics as logout.
    if (isNoAuthMode()) {
      await logout();
      return;
    }

    const access = getAccessToken();
    if (access) {
      try {
        await fetch(`${apiBaseURL.replace(/\/+$/, '')}/api/v1/auth/logout-all`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access}`,
          },
        });
      } catch {
        // Best-effort.
      }
    }
    setAccessToken(null);
    PowerFlowApp.clearSession();
    PowerFlowApp.clearCache();
  }, [apiBaseURL, setAccessToken, logout]);

  // Keep SDK config in sync with auth state.
  useEffect(() => {
    PowerFlowApp.updateConfig({
      accessToken: state.accessToken || undefined,
    });
  }, [state.accessToken]);

  // Adopt token changes broadcast by sibling tabs and by the refresh service
  // itself (which broadcasts after every successful rotation).
  useEffect(() => {
    return subscribeAuthBroadcast((msg) => {
      if (msg.type === 'tokens_updated') {
        // tokenStore already updated by the broadcaster; we just sync React state.
        setState({
          accessToken: msg.access,
          user: inferUserFromToken(msg.access),
        });
      } else if (msg.type === 'auth_required') {
        setState({ accessToken: null, user: null });
      }
    });
  }, []);

  // Proactive refresh: on mount + tab visibility + a 60s interval, refresh if
  // the access token expires within 120s. Skipped when no refresh token exists
  // (legacy sessions ride out their access TTL).
  useEffect(() => {
    let cancelled = false;

    const maybeRefresh = () => {
      if (cancelled) return;
      if (!getRefreshToken()) return;
      if (!willExpireSoon(PROACTIVE_REFRESH_THRESHOLD_MS)) return;
      void refreshTokens();
    };

    maybeRefresh();
    const interval = window.setInterval(maybeRefresh, PROACTIVE_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // When requests hit 401 and the refresh chain has also failed, the helper
  // dispatches xflow:auth:required and we open the LoginModal.
  const stateUserEmailRef = useRef(state.user?.email);
  stateUserEmailRef.current = state.user?.email;
  useEffect(() => {
    const handler = () => {
      // Never surface the login modal in no-auth mode — recover silently.
      if (isNoAuthMode()) {
        void renewNoAuthSession();
        return;
      }
      if (isDialogOpen(DIALOG_IDS.LOGIN)) return;
      openDialog(DIALOG_IDS.LOGIN, LoginModal, {
        apiBaseURL,
        defaultEmail: stateUserEmailRef.current,
        onSuccess: (result: any) => {
          setAccessToken(result.accessToken, result.user, {
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn,
          });
        },
      });
    };

    window.addEventListener('xflow:auth:required', handler);
    return () => window.removeEventListener('xflow:auth:required', handler);
  }, [apiBaseURL, openDialog, isDialogOpen, setAccessToken]);

  const requireAuth = useCallback(async (_options?: RequireAuthOptions) => {
    if (state.accessToken) return true;

    // No-auth mode: a "login" is just fetching a synthetic session.
    if (isNoAuthMode()) {
      const session = await renewNoAuthSession();
      return !!session;
    }

    return await new Promise<boolean>((resolve) => {
      if (!isDialogOpen(DIALOG_IDS.LOGIN)) {
        openDialog(DIALOG_IDS.LOGIN, LoginModal, {
          apiBaseURL,
          defaultEmail: state.user?.email,
          onSuccess: (result: any) => {
            setAccessToken(result.accessToken, result.user, {
              refreshToken: result.refreshToken,
              expiresIn: result.expiresIn,
            });
            resolve(true);
          },
        });
      }

      const startedAt = Date.now();
      const interval = setInterval(() => {
        const hasToken = !!getAccessToken();
        const open = isDialogOpen(DIALOG_IDS.LOGIN);
        if (hasToken) {
          clearInterval(interval);
          const token = getAccessToken();
          if (token) setAccessToken(token);
          resolve(true);
          return;
        }
        if (!open) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        if (Date.now() - startedAt > 10 * 60 * 1000) {
          clearInterval(interval);
          closeDialog(DIALOG_IDS.LOGIN);
          resolve(false);
        }
      }, 250);
    });
  }, [apiBaseURL, closeDialog, isDialogOpen, openDialog, setAccessToken, state.accessToken, state.user?.email]);

  const value = useMemo<AuthContextValue>(() => ({
    accessToken: state.accessToken,
    user: state.user,
    isAuthenticated,
    setAccessToken,
    logout,
    logoutAllDevices,
    requireAuth,
  }), [state.accessToken, state.user, isAuthenticated, setAccessToken, logout, logoutAllDevices, requireAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
