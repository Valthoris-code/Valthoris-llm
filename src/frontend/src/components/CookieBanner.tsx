import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsent } from '../consent/ConsentContext';
import { useI18n } from '../i18n/useI18n';

const DISMISS_KEY = 'valthoris.cookieBanner.dismissed.v1';

/**
 * Cookie banner shown on first open, right after the blocking privacy consent
 * modal has been completed. It gives quick access to the granular preferences
 * page without forcing the user back into a modal.
 */
export default function CookieBanner() {
  const { needsConsent, acceptAll } = useConsent();
  const { t, locale } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (needsConsent || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="cookie-banner glass" role="region" aria-label={t('legal.cookies')}>
      <p className="cookie-banner-text">🍪 {t('consent.banner')}</p>
      <div className="cookie-banner-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            acceptAll(locale);
            dismiss();
          }}
        >
          {t('consent.acceptAll')}
        </button>
        <Link className="btn-secondary cookie-banner-link" to="/legal/cookie-preferences" onClick={dismiss}>
          {t('consent.managePreferences')}
        </Link>
        <button type="button" className="cookie-banner-close" onClick={dismiss} aria-label={t('common.close')}>
          ✕
        </button>
      </div>
    </div>
  );
}
