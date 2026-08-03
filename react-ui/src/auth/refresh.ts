import {
  clearTokens,
  getRefreshToken,
  setTokens,
  type SetTokensInput,
} from './tokenStore';

export type RefreshResult = {
  access: string;
  refresh: string;
  expiresIn: number;
};

type AuthBroadcast =
  | { type: 'refresh_start'; at: number }
  | { type: 'tokens_updated'; access: string; refresh: string; expiresIn: number }
  | { type: 'auth_required' };

const CHANNEL_NAME = 'xflow_auth';
const PEER_WAIT_MS = 50;
const LS_SIGNAL_KEY = 'xflow_auth_signal';

let apiBaseURL = '';
let inFlight: Promise<RefreshResult | null> | null = null;
let channel: BroadcastChannel | null = null;
let lsListenerInstalled = false;

// Listeners that want to react to cross-tab signals — used by AuthProvider to
// adopt tokens posted by a sibling tab.
type Listener = (msg: AuthBroadcast) => void;
const listeners = new Set<Listener>();

export function configureRefresh(opts: { apiBaseURL: string }) {
  apiBaseURL = opts.apiBaseURL.replace(/\/+$/, '');
  ensureChannel();
}

export function subscribeAuthBroadcast(listener: Listener): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensureChannel(): void {
  if (typeof window === 'undefined') return;
  if (channel === null && typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent<AuthBroadcast>) => dispatch(e.data);
    } catch {
      channel = null;
    }
  }
  if (channel === null && !lsListenerInstalled) {
    // Fallback: piggy-back on storage events. Other tabs see the event when
    // a sibling writes to LS_SIGNAL_KEY; we serialize the message as JSON.
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key !== LS_SIGNAL_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as AuthBroadcast;
        dispatch(msg);
      } catch {
        // ignore
      }
    });
    lsListenerInstalled = true;
  }
}

function dispatch(msg: AuthBroadcast) {
  listeners.forEach((l) => {
    try { l(msg); } catch { /* ignore listener errors */ }
  });
}

function broadcast(msg: AuthBroadcast): void {
  if (channel) {
    try { channel.postMessage(msg); } catch { /* ignore */ }
    return;
  }
  // Fallback: write+delete an LS key so other tabs get a storage event.
  try {
    localStorage.setItem(LS_SIGNAL_KEY, JSON.stringify({ ...msg, _ts: Date.now() }));
    // Remove shortly after so a tab that opens later doesn't replay it.
    setTimeout(() => {
      try { localStorage.removeItem(LS_SIGNAL_KEY); } catch { /* ignore */ }
    }, 100);
  } catch {
    // ignore
  }
}

// awaitPeerRefresh waits up to PEER_WAIT_MS for any sibling tab to broadcast
// fresh tokens. If one arrives, we adopt them and skip the network call.
function awaitPeerRefresh(): Promise<RefreshResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const off = subscribeAuthBroadcast((msg) => {
      if (settled) return;
      if (msg.type === 'tokens_updated') {
        settled = true;
        off();
        resolve({ access: msg.access, refresh: msg.refresh, expiresIn: msg.expiresIn });
      }
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      off();
      resolve(null);
    }, PEER_WAIT_MS);
  });
}

async function doRefresh(): Promise<RefreshResult | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  if (!apiBaseURL) {
    console.warn('[auth/refresh] apiBaseURL not configured; cannot refresh');
    return null;
  }

  broadcast({ type: 'refresh_start', at: Date.now() });
  const peer = await awaitPeerRefresh();
  if (peer) {
    setTokens(peer as SetTokensInput);
    return peer;
  }

  let resp: Response;
  try {
    resp = await fetch(`${apiBaseURL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch (err) {
    console.warn('[auth/refresh] network error', err);
    return null;
  }

  if (resp.status === 404) {
    // Backend has refresh disabled. Treat as legacy mode — fall through to the
    // existing login modal path on the next 401.
    return null;
  }
  if (!resp.ok) {
    // 401/410: refresh token invalid/revoked/expired. Clear and broadcast.
    clearTokens();
    broadcast({ type: 'auth_required' });
    return null;
  }

  let body: any;
  try {
    body = await resp.json();
  } catch {
    return null;
  }
  const access: string | undefined = body?.access_token;
  const newRefresh: string | undefined = body?.refresh_token;
  const expiresIn: number | undefined = body?.expires_in;
  if (!access || !newRefresh || typeof expiresIn !== 'number') {
    return null;
  }

  const result: RefreshResult = { access, refresh: newRefresh, expiresIn };
  setTokens(result);
  broadcast({ type: 'tokens_updated', ...result });
  return result;
}

// refreshTokens is the single entry point. Concurrent callers within a tab
// share one in-flight promise; cross-tab callers coordinate via broadcast.
export function refreshTokens(): Promise<RefreshResult | null> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
