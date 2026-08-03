import React from 'react';
import { useTranslation } from 'react-i18next';

export const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || 'success';

  const isSuccess = status === 'success';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top, #e0f2fe 0, #f9fafb 45%, #e5e7eb 100%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          borderRadius: 16,
          padding: '24px 24px 20px',
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow:
            '0 18px 45px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: '#0f172a',
          }}
        >
          {t('verifyEmail.title', { defaultValue: 'Email verified' })}
        </h1>
        <p
          style={{
            marginTop: 12,
            marginBottom: 20,
            fontSize: 14,
            lineHeight: 1.6,
            color: '#4b5563',
          }}
        >
          {isSuccess
            ? t('verifyEmail.successMessage', {
                defaultValue:
                  'Your email has been verified. You can now return to the app and sign in.',
              })
            : t('errors.unknown', {
                defaultValue:
                  'The verification link is invalid or has expired. Please request a new one.',
              })}
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = '/';
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 18px',
            borderRadius: 999,
            border: 'none',
            background:
              'linear-gradient(135deg, #0f766e, #14b8a6)',
            color: '#f9fafb',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow:
              '0 10px 25px rgba(15, 118, 110, 0.25)',
          }}
        >
          {t('verifyEmail.backToApp', { defaultValue: 'Back to app' })}
        </button>
      </div>
    </div>
  );
};

