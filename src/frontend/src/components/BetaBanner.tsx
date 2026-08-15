import React from 'react';
import { useT } from '../i18n/useI18n';

/**
 * Beta notice.
 *
 * The information itself is mandatory (the platform is a private beta, some
 * features are still under construction) and the version stays visible, but
 * the bar is now a single compact line: on a phone the previous layout ate a
 * large slice of the space above the fold.
 */
export default function BetaBanner() {
  const t = useT();

  return (
    <div className="beta-banner">
      <span aria-hidden="true">⚠</span>
      <span className="beta-banner-text">
        <strong>{t('beta.title')}</strong> — {t('beta.notice')}
      </span>
      <span className="beta-banner-version">v0.1-beta</span>
    </div>
  );
}
