import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import { getAuthConfig } from '../../../../../auth/authConfig';
import styles from './LoginModal.module.css';

// Popup ↔ opener channels for Google OAuth. window.opener is severed by COOP after
// the cross-origin round-trip to Google on COOP-protected deployments, so the popup
// reports its result over these same-origin channels (which survive COOP) and is
// detected via OAUTH_POPUP_FLAG_KEY. Must match GoogleCallbackPage.
const OAUTH_CHANNEL = 'xflow-google-oauth';
const OAUTH_RESULT_KEY = 'xflow_google_oauth_result';
const OAUTH_POPUP_FLAG_KEY = 'xflow_google_oauth_popup';

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseURL: string;
  defaultEmail?: string;
  onSuccess: (result: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    user: { id: string; email: string; role?: string };
  }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  apiBaseURL,
  defaultEmail,
  onSuccess,
}) => {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState(defaultEmail || '');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslation();

  const isRegisterMode = mode === 'register';
  const isVerifyMode = mode === 'verify';
  const isForgotMode = mode === 'forgot';
  const isResetMode = mode === 'reset';

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setInfo(null);
    setMode('login');
    setLoading(false);
    setPassword('');
    setPasscode('');
    setEmail(defaultEmail || '');
    setTimeout(() => emailInputRef.current?.focus(), 50);
  }, [isOpen, defaultEmail]);

  useEffect(() => {
    if (isVerifyMode || isResetMode) {
      setTimeout(() => passcodeInputRef.current?.focus(), 50);
    }
  }, [isVerifyMode, isResetMode]);

  const canSubmit = useMemo(() => {
    if (isVerifyMode) {
      return passcode.length === 6 && !loading;
    }
    if (isForgotMode) {
      return email.trim().length > 0 && !loading;
    }
    if (isResetMode) {
      return email.trim().length > 0 && passcode.length === 6 && newPassword.length >= 8 && !loading;
    }
    const minPasswordLength = isRegisterMode ? 8 : 1;
    return email.trim().length > 0 && password.length >= minPasswordLength && !loading;
  }, [email, password, passcode, newPassword, loading, isRegisterMode, isVerifyMode, isForgotMode, isResetMode]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isVerifyMode) {
        // Verify passcode
        const res = await fetch(`${apiBaseURL}/api/v1/auth/verify-passcode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            passcode,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        // Verification succeeded - now attempt to login automatically
        const loginRes = await fetch(`${apiBaseURL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        });

        const loginData = await loginRes.json().catch(() => null);
        if (!loginRes.ok) {
          // If auto-login fails, switch to login mode and show message
          setMode('login');
          setPasscode('');
          setInfo(
            t('loginModal.verifySuccess', {
              defaultValue: 'Email verified successfully! Please sign in.',
            })
          );
          return;
        }

        if (!loginData?.access_token) {
          setMode('login');
          setPasscode('');
          setInfo(
            t('loginModal.verifySuccess', {
              defaultValue: 'Email verified successfully! Please sign in.',
            })
          );
          return;
        }

        onSuccess({
          accessToken: loginData.access_token,
          refreshToken: loginData.refresh_token,
          expiresIn: loginData.expires_in,
          user: loginData.user || { id: '', email: email.trim() },
        });
        onClose();
        return;
      }

      if (isForgotMode) {
        // Request password reset
        const res = await fetch(`${apiBaseURL}/api/v1/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        setMode('reset');
        setInfo(null);
        return;
      }

      if (isResetMode) {
        // Reset password with passcode
        const res = await fetch(`${apiBaseURL}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            passcode,
            newPassword,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        setMode('login');
        setPasscode('');
        setNewPassword('');
        setInfo(
          t('loginModal.passwordResetSuccess', {
            defaultValue: 'Password reset successfully! Please sign in with your new password.',
          })
        );
        return;
      }

      if (isRegisterMode) {
        const res = await fetch(`${apiBaseURL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        if (getAuthConfig().emailVerificationEnabled) {
          setMode('verify');
          setInfo(null);
          return;
        }
        // Email verification is off (no Mailgun): the account is immediately
        // usable — fall through and sign in with the just-entered credentials.
      }

      const res = await fetch(`${apiBaseURL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error;
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        if (code === 'email_not_verified') {
          setMode('verify');
          setInfo(null);
          return;
        }
        throw new Error(msg);
      }

      if (!data?.access_token) {
        throw new Error('Login response missing access token');
      }

      onSuccess({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        user: data.user || { id: '', email: email.trim() },
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(value);
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBaseURL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setInfo(
        t('loginModal.codeResent', {
          defaultValue: 'A new verification code has been sent.',
        })
      );
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Handle Google OAuth login
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    setInfo(null);

    try {
      const frontendURL = window.location.origin;
      const res = await fetch(`${apiBaseURL}/api/v1/auth/google/url?redirect_uri=${encodeURIComponent(frontendURL)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to get Google OAuth URL');
      }

      // Mobile/tablet browsers block popups and don't reliably support window.opener,
      // so use a full-page redirect flow instead.
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

      if (isMobile) {
        window.location.href = data.auth_url;
        return;
      }

      // Desktop: open a popup window
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      // Mark popup mode for the callback page and clear any stale result. The
      // callback reports back over BroadcastChannel/localStorage (not window.opener,
      // which COOP can sever after the Google round-trip) and detects the popup via
      // this flag.
      try {
        localStorage.setItem(OAUTH_POPUP_FLAG_KEY, String(Date.now()));
        localStorage.removeItem(OAUTH_RESULT_KEY);
      } catch { /* ignore */ }

      const popup = window.open(
        data.auth_url,
        'GoogleSignIn',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      );

      if (!popup) {
        // Popup blocked — fall back to redirect flow
        try { localStorage.removeItem(OAUTH_POPUP_FLAG_KEY); } catch { /* ignore */ }
        window.location.href = data.auth_url;
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const channel = 'BroadcastChannel' in window ? new BroadcastChannel(OAUTH_CHANNEL) : null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        window.removeEventListener('message', handleMessage);
        window.removeEventListener('storage', handleStorage);
        try { channel?.close(); } catch { /* ignore */ }
        // Only clear the result here. The popup OWNS the popup-mode flag (it
        // consumes it on read, with a TTL). Clearing it here would race the popup
        // and, if cleanup ran early, drop the popup into the redirect branch.
        try { localStorage.removeItem(OAUTH_RESULT_KEY); } catch { /* ignore */ }
      };

      const closePopup = () => {
        // Best-effort close from the opener. Don't read popup.closed first — under
        // COOP that read is blocked and logs a warning; calling close() on an
        // already-closed window is a harmless no-op.
        try { popup.close(); } catch { /* popup closes itself as the primary path */ }
      };

      // Handle a result delivered over any channel: postMessage (when the opener
      // survives, e.g. localhost) or BroadcastChannel/storage (which survive COOP).
      const handlePayload = (payload: any) => {
        if (!payload || settled) return;
        if (payload.type === 'google-oauth-success') {
          settled = true;
          cleanup();
          closePopup();
          setGoogleLoading(false);
          onSuccess({
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            expiresIn: payload.expiresIn,
            user: payload.user,
          });
          onClose();
        } else if (payload.type === 'google-oauth-error') {
          settled = true;
          cleanup();
          closePopup();
          setGoogleLoading(false);
          setError(payload.error || 'Google login failed');
        }
      };

      const handleMessage = (event: MessageEvent) => handlePayload(event.data);
      const handleStorage = (event: StorageEvent) => {
        if (event.key === OAUTH_RESULT_KEY && event.newValue) {
          try { handlePayload(JSON.parse(event.newValue)); } catch { /* ignore */ }
        }
      };

      window.addEventListener('message', handleMessage);
      window.addEventListener('storage', handleStorage);
      if (channel) channel.onmessage = (event) => handlePayload(event.data);

      // Do NOT poll popup.closed. Once the popup navigates to Google, COOP makes
      // popup.closed read `true` (logging "Cross-Origin-Opener-Policy policy would
      // block the window.closed call"), which would falsely trip cleanup before the
      // real result arrives — exactly what left the popup stuck on the redirect
      // branch. Rely on the result channels, with a safety timeout that only
      // releases the busy state if nothing ever comes back.
      timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          setGoogleLoading(false);
        }
      }, 3 * 60 * 1000);

    } catch (e: any) {
      setError(e?.message || 'Google login failed');
      setGoogleLoading(false);
    }
  };

  const renderForm = () => {
    if (isVerifyMode) {
      return (
        <>
          <div className={styles.passcodeSection}>
            <div className={styles.passcodeHint}>
              {t('loginModal.passcodeHint', {
                defaultValue: 'Enter the 6-digit verification code sent to',
              })}
              <br />
              <strong>{email}</strong>
            </div>

            <div className={styles.passcodeContainer}>
              <input
                ref={passcodeInputRef}
                className={styles.passcodeInput}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={passcode}
                onChange={handlePasscodeChange}
                disabled={loading}
              />
              <div className={styles.passcodeBoxes}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`${styles.passcodeBox} ${passcode.length === i ? styles.passcodeBoxActive : ''}`}
                  >
                    {passcode[i] || ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error ? <div className={styles.errorMessage}>{error}</div> : null}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="medium"
              fullWidth
              className={styles.submitButton}
              onClick={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
            >
              {t('loginModal.verify', { defaultValue: 'Verify' })}
            </Button>
          </div>

          <div className={styles.switchRow}>
            <span className={styles.switchText}>
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                  setPasscode('');
                }}
              >
                {t('loginModal.backToSignIn', { defaultValue: 'Back to sign in' })}
              </button>
            </span>
          </div>
        </>
      );
    }

    if (isForgotMode) {
      return (
        <>
          <div className={styles.field}>
            <label className={styles.label}>
              {t('loginModal.emailLabel', { defaultValue: 'Email' })}
            </label>
            <input
              ref={emailInputRef}
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder={t('loginModal.emailPlaceholder', {
                defaultValue: 'admin@example.com',
              })}
            />
          </div>

          {error ? <div className={styles.errorMessage}>{error}</div> : null}
          {info ? <div className={styles.infoMessage}>{info}</div> : null}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="medium"
              fullWidth
              className={styles.submitButton}
              onClick={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
            >
              {t('loginModal.sendResetCode', { defaultValue: 'Send reset code' })}
            </Button>
          </div>

          <div className={styles.switchRow}>
            <span className={styles.switchText}>
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
              >
                {t('loginModal.backToSignIn', { defaultValue: 'Back to sign in' })}
              </button>
            </span>
          </div>
        </>
      );
    }

    if (isResetMode) {
      return (
        <>
          <div className={styles.passcodeSection}>
            <div className={styles.passcodeHint}>
              {t('loginModal.resetPasscodeHint', {
                defaultValue: 'Enter the 6-digit code sent to',
              })}
              <br />
              <strong>{email}</strong>
            </div>

            <div className={styles.passcodeContainer}>
              <input
                ref={passcodeInputRef}
                className={styles.passcodeInput}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={passcode}
                onChange={handlePasscodeChange}
                disabled={loading}
              />
              <div className={styles.passcodeBoxes}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`${styles.passcodeBox} ${passcode.length === i ? styles.passcodeBoxActive : ''}`}
                  >
                    {passcode[i] || ''}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.resendRow}>
              <span className={styles.resendText}>
                {t('loginModal.noCode', { defaultValue: "Didn't receive the code?" })}{' '}
                <button
                  type="button"
                  className={styles.resendLink}
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0 || loading}
                >
                  {resendCooldown > 0
                    ? t('loginModal.resendCooldown', {
                        defaultValue: `Resend in ${resendCooldown}s`,
                        seconds: resendCooldown,
                      })
                    : t('loginModal.resendCode', { defaultValue: 'Resend' })}
                </button>
              </span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              {t('loginModal.newPasswordLabel', { defaultValue: 'New Password' })}
            </label>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              placeholder={t('loginModal.newPasswordPlaceholder', {
                defaultValue: 'At least 8 characters',
              })}
            />
          </div>

          {error ? <div className={styles.errorMessage}>{error}</div> : null}
          {info ? <div className={styles.infoMessage}>{info}</div> : null}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="medium"
              fullWidth
              className={styles.submitButton}
              onClick={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
            >
              {t('loginModal.resetPassword', { defaultValue: 'Reset password' })}
            </Button>
          </div>

          <div className={styles.switchRow}>
            <span className={styles.switchText}>
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                  setPasscode('');
                  setNewPassword('');
                }}
              >
                {t('loginModal.backToSignIn', { defaultValue: 'Back to sign in' })}
              </button>
            </span>
          </div>
        </>
      );
    }

    return (
      <>
        <div className={styles.field}>
          <label className={styles.label}>
            {t('loginModal.emailLabel', { defaultValue: 'Email' })}
          </label>
          <input
            ref={emailInputRef}
            className={styles.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder={t('loginModal.emailPlaceholder', {
              defaultValue: 'admin@example.com',
            })}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            {t('loginModal.passwordLabel', { defaultValue: 'Password' })}
          </label>
          <div className={styles.passwordInputWrapper}>
            <input
              className={styles.passwordInput}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder={t('loginModal.passwordPlaceholder', {
                defaultValue: 'Your password',
              })}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {!isRegisterMode && (
            <div className={styles.forgotRow}>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setInfo(null);
                  setPassword('');
                }}
              >
                {t('loginModal.forgotPassword', { defaultValue: 'Forgot password?' })}
              </button>
            </div>
          )}
        </div>

        {error ? <div className={styles.errorMessage}>{error}</div> : null}

        {info ? <div className={styles.infoMessage}>{info}</div> : null}

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="medium"
            fullWidth
            className={styles.submitButton}
            onClick={handleSubmit}
            loading={loading}
            disabled={!canSubmit}
          >
            {isRegisterMode
              ? t('loginModal.register', { defaultValue: 'Create account' })
              : t('loginModal.signIn', { defaultValue: 'Sign in' })}
          </Button>
        </div>

        {!isRegisterMode && getAuthConfig().googleEnabled && (
          <>
            <div className={styles.divider}>
              <span className={styles.dividerText}>
                {t('loginModal.or', { defaultValue: 'or' })}
              </span>
            </div>

            <button className={styles.googleButton} type="button" onClick={handleGoogleLogin} disabled={googleLoading}>
              {googleLoading ? (
                <span className={styles.googleButtonText}>
                  {t('loginModal.googleSigningIn', { defaultValue: 'Signing in...' })}
                </span>
              ) : (
                <>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className={styles.googleButtonText}>
                    {t('loginModal.googleSignIn', { defaultValue: 'Sign in with Google' })}
                  </span>
                </>
              )}
            </button>
          </>
        )}

        <div className={styles.switchRow}>
          {isRegisterMode ? (
            <span className={styles.switchText}>
              {t('loginModal.haveAccount', { defaultValue: 'Already have an account?' })}{' '}
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
              >
                {t('loginModal.backToSignIn', { defaultValue: 'Back to sign in' })}
              </button>
            </span>
          ) : (
            <span className={styles.switchText}>
              {t('loginModal.noAccount', { defaultValue: "Don't have an account?" })}{' '}
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfo(null);
                }}
              >
                {t('loginModal.createAccount', { defaultValue: 'Create one' })}
              </button>
            </span>
          )}
        </div>
      </>
    );
  };

  const getModalTitle = () => {
    if (isRegisterMode) {
      return t('loginModal.registerTitle', { defaultValue: 'Create account' });
    }
    if (isForgotMode) {
      return t('loginModal.forgotTitle', { defaultValue: 'Reset password' });
    }
    if (isResetMode) {
      return t('loginModal.resetTitle', { defaultValue: 'Reset password' });
    }
    if (isVerifyMode) {
      return t('loginModal.verifyTitle', { defaultValue: 'Verify email' });
    }
    return t('loginModal.title', { defaultValue: 'Sign in' });
  };

  const getHeading = () => {
    if (isRegisterMode) {
      return t('loginModal.registerHeading', { defaultValue: 'Create your account' });
    }
    if (isForgotMode) {
      return t('loginModal.forgotHeading', { defaultValue: 'Forgot your password?' });
    }
    if (isResetMode) {
      return t('loginModal.resetHeading', { defaultValue: 'Set a new password' });
    }
    if (isVerifyMode) {
      return t('loginModal.verifyHeading', { defaultValue: 'Verify your email' });
    }
    return t('loginModal.heading', { defaultValue: 'Welcome to CypressEra' });
  };

  const getSubheading = () => {
    if (isRegisterMode) {
      return t('loginModal.registerSubheading', {
        defaultValue: 'Join us to start analyzing power flow.',
      });
    }
    if (isForgotMode) {
      return t('loginModal.forgotSubheading', {
        defaultValue: "No worries, we'll send you a reset code.",
      });
    }
    if (isResetMode) {
      return t('loginModal.resetSubheading', {
        defaultValue: 'Enter the code and your new password.',
      });
    }
    if (isVerifyMode) {
      return t('loginModal.verifySubheading', {
        defaultValue: 'Enter the code sent to your email.',
      });
    }
    return t('loginModal.subheading', {
      defaultValue: 'The leading AI-enabled power system analysis platform.',
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={getModalTitle()}
      width={460}
      modal={true}
      draggable={true}
      onEnterKey={handleSubmit}
    >
      <div className={styles.container}>
        <div className={styles.hero}>
          <div className={styles.heading}>
            {getHeading()}
          </div>
          <div className={styles.subheading}>
            {getSubheading()}
          </div>
        </div>

        <div className={styles.form}>
          {renderForm()}
        </div>
      </div>
    </BaseModal>
  );
};

