import React, { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Toggle from '../../components/ui/Toggle';
import { useToast } from '../../components/ui/Toast';
import { useConsent } from '../../consent/ConsentContext';
import {
  COOKIE_CATEGORIES,
  REQUIRED_CATEGORIES,
  defaultPreferences,
} from '../../consent/consentModel';
import type { CookieCategory, CookiePreferences } from '../../consent/consentModel';
import { useI18n } from '../../i18n/useI18n';

const CATEGORY_KEYS: Record<CookieCategory, { label: string; desc: string }> = {
  essential: { label: 'cookies.essential', desc: 'cookies.essential.desc' },
  analytics: { label: 'cookies.analytics', desc: 'cookies.analytics.desc' },
  performance: { label: 'cookies.performance', desc: 'cookies.performance.desc' },
  marketing: { label: 'cookies.marketing', desc: 'cookies.marketing.desc' },
  security: { label: 'cookies.security', desc: 'cookies.security.desc' },
  fraud: { label: 'cookies.fraud', desc: 'cookies.fraud.desc' },
};

/** Granular cookie preference centre — reachable at any time from the footer. */
export default function CookiePreferences() {
  const { consent, preferences, savePreferences, acceptAll, acceptEssentialOnly } = useConsent();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [draft, setDraft] = useState<CookiePreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const persist = (next: CookiePreferences) => {
    savePreferences({
      preferences: next,
      acceptedTerms: consent?.acceptedTerms ?? true,
      acceptedPrivacy: consent?.acceptedPrivacy ?? true,
      acceptedCookies: true,
      confirmedAge: consent?.confirmedAge ?? true,
      locale,
    });
    toast(t('consent.savePreferences'), 'success');
  };

  return (
    <div className="page">
      <PageHeader
        icon="🍪"
        title={t('consent.managePreferences')}
        subtitle={t('consent.banner')}
        badge={<span className="badge-beta">{t('common.beta')}</span>}
      />

      <div className="card mt-2 consent-panel">
        {COOKIE_CATEGORIES.map(category => {
          const required = REQUIRED_CATEGORIES.includes(category);
          return (
            <Toggle
              key={category}
              label={t(CATEGORY_KEYS[category].label)}
              description={t(CATEGORY_KEYS[category].desc)}
              checked={required ? true : draft[category]}
              disabled={required}
              onChange={value => setDraft(prev => ({ ...prev, [category]: value }))}
            />
          );
        })}

        <div className="consent-actions mt-3">
          <button type="button" className="btn-primary" onClick={() => persist(draft)}>
            {t('consent.savePreferences')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              acceptAll(locale);
              toast(t('consent.acceptAll'), 'success');
            }}
          >
            {t('consent.acceptAll')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setDraft(defaultPreferences(false));
              acceptEssentialOnly(locale);
              toast(t('consent.onlyEssential'), 'success');
            }}
          >
            {t('consent.onlyEssential')}
          </button>
        </div>
      </div>

      {consent && (
        <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
          Consent recorded on {new Date(consent.updatedAt).toLocaleString()} ({consent.locale}).
          {' '}
          {/* TODO(backend): synchronise this record with the compliance service. */}
          Stored locally on this device.
        </p>
      )}
    </div>
  );
}
