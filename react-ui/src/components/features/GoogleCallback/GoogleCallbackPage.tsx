import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GoogleCallbackPage.module.css';

interface GoogleCallbackPageProps {
  apiBaseURL: string;
  onSuccess: (result: { accessToken: string; user: { id: string; email: string; role?: string } }) => void;
}

const ACCESS_TOKEN_STORAGE_KEY = 'xflow_access_token';

// Popup ↔ opener channels. window.opener is severed by COOP after the cross-origin
// round-trip to Google on COOP-protected deployments, so the popup reports its
// result over same-origin channels that survive COOP (BroadcastChannel + a
// localStorage "storage" event), and is detected via a fresh flag the opener set.
const OAUTH_CHANNEL = 'xflow-google-oauth';
const OAUTH_RESULT_KEY = 'xflow_google_oauth_result';
const OAUTH_POPUP_FLAG_KEY = 'xflow_google_oauth_popup';
const OAUTH_POPUP_FLAG_TTL_MS = 5 * 60 * 1000;

/** Send the OAuth result to the opener over every channel that might be alive. */
function broadcastOAuthResult(payload: Record<string, unknown>): void {
  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel(OAUTH_CHANNEL);
      ch.postMessage(payload);
      ch.close();
    }
  } catch { /* ignore */ }
  try {
    // Timestamp guarantees the value changes so the opener's storage event fires.
    localStorage.setItem(OAUTH_RESULT_KEY, JSON.stringify({ ...payload, t: Date.now() }));
  } catch { /* ignore */ }
  try {
    if (window.opener) window.opener.postMessage(payload, '*');
  } catch { /* ignore */ }
}

export const GoogleCallbackPage: React.FC<GoogleCallbackPageProps> = ({ apiBaseURL, onSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  // Detect popup mode without relying solely on window.opener (which COOP can
  // sever): also honor a fresh flag the opener set right before opening the popup.
  // Consume the flag so a stale one can't misroute a later mobile redirect.
  const [isPopup] = useState(() => {
    if (window.opener) return true;
    try {
      const raw = localStorage.getItem(OAUTH_POPUP_FLAG_KEY);
      localStorage.removeItem(OAUTH_POPUP_FLAG_KEY);
      const ts = raw ? Number(raw) : NaN;
      return Number.isFinite(ts) && Date.now() - ts < OAUTH_POPUP_FLAG_TTL_MS;
    } catch {
      return false;
    }
  });
  const { t } = useTranslation();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const errorParam = urlParams.get('error');

      if (errorParam) {
        setError(errorParam);
        if (isPopup) {
          broadcastOAuthResult({ type: 'google-oauth-error', error: errorParam });
          setTimeout(() => { try { window.close(); } catch { /* opener will close it */ } }, 2000);
        }
        return;
      }

      if (!code) {
        setError('No authorization code received');
        if (isPopup) {
          broadcastOAuthResult({ type: 'google-oauth-error', error: 'No authorization code' });
          setTimeout(() => { try { window.close(); } catch { /* opener will close it */ } }, 2000);
        }
        return;
      }

      try {
        const frontendURL = window.location.origin;
        const res = await fetch(`${apiBaseURL}/api/v1/auth/google/callback?redirect_uri=${encodeURIComponent(frontendURL)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || data?.error || 'Google login failed');
        }

        if (isPopup) {
          // Popup flow: notify opener over COOP-safe channels, then close. The
          // opener also closes us via its retained popup reference as a backstop.
          broadcastOAuthResult({
            type: 'google-oauth-success',
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            user: data.user,
          });
          // A script-opened window can close itself even after COOP severs the
          // opener; if the browser still blocks it, the success message below tells
          // the user they can close it (they're already signed in in the main tab).
          setSignedIn(true);
          setTimeout(() => { try { window.close(); } catch { /* user can close it */ } }, 100);
        } else {
          // Redirect flow (mobile/tablet): persist tokens and return to app.
          localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('xflow_refresh_token', data.refresh_token);
          }
          if (typeof data.expires_in === 'number' && data.expires_in > 0) {
            localStorage.setItem(
              'xflow_access_expires_at',
              String(Date.now() + data.expires_in * 1000),
            );
          }
          window.location.replace(frontendURL);
        }
      } catch (e: any) {
        setError(e?.message || 'Google login failed');
        if (isPopup) {
          broadcastOAuthResult({ type: 'google-oauth-error', error: e?.message });
          setTimeout(() => { try { window.close(); } catch { /* opener will close it */ } }, 2000);
        }
      }
    };

    handleCallback();
  }, [apiBaseURL, isPopup]);

  return (
    <div className={styles.container}>
      {error ? (
        <>
          <h2 className={styles.title}>
            {t('googleCallback.error', { defaultValue: 'Login Failed' })}
          </h2>
          <p className={styles.errorText}>
            {error}
          </p>
          {isPopup ? (
            <p className={styles.hintText}>
              {t('googleCallback.closing', { defaultValue: 'This window will close automatically...' })}
            </p>
          ) : (
            <button className={styles.backButton} onClick={() => window.location.replace(window.location.origin)}>
              {t('googleCallback.backToApp', { defaultValue: 'Return to app' })}
            </button>
          )}
        </>
      ) : signedIn ? (
        <>
          <h2 className={styles.signingInText}>
            {t('googleCallback.signedIn', { defaultValue: "You're signed in." })}
          </h2>
          <p className={styles.hintText}>
            {t('googleCallback.closing', { defaultValue: 'This window will close automatically...' })}
          </p>
        </>
      ) : (
        <h2 className={styles.signingInText}>
          {t('googleCallback.signingIn', { defaultValue: 'Signing in with Google...' })}
        </h2>
      )}
    </div>
  );
};
