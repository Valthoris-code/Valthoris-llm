import React, { useState } from 'react';
import Modal from './ui/Modal';
import Toggle from './ui/Toggle';
import { useConsent } from '../consent/ConsentContext';
import { COOKIE_CATEGORIES, REQUIRED_CATEGORIES, defaultPreferences } from '../consent/consentModel';
import type { CookieCategory, CookiePreferences } from '../consent/consentModel';
import { useI18n } from '../i18n/useI18n';

const CATEGORY_KEYS: Record<CookieCategory, { label: string; desc: string }> = {
  essential: { label: 'cookies.essential', desc: 'cookies.essential.desc' },
  analytics: { label: 'cookies.analytics', desc: 'cookies.analytics.desc' },
  performance: { label: 'cookies.performance', desc: 'cookies.performance.desc' },
  marketing: { label: 'cookies.marketing', desc: 'cookies.marketing.desc' },
  security: { label: 'cookies.security', desc: 'cookies.security.desc' },
  fraud: { label: 'cookies.fraud', desc: 'cookies.fraud.desc' },
};

/**
 * First-open compliance gate: privacy consent, terms acceptance, age
 * confirmation and cookie preferences. Blocking by design — the modal cannot be
 * dismissed until a lawful basis is recorded.
 */
export default function ConsentGate() {
  const { needsConsent, acceptAll, acceptEssentialOnly, savePreferences } = useConsent();
  const { t, locale } = useI18n();

  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(() => defaultPreferences(false));
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [cookies, setCookies] = useState(false);
  const [age, setAge] = useState(false);
  const [error, setError] = useState('');

  if (!needsConsent) return null;

  const allChecked = terms && privacy && cookies && age;

  const handleSave = () => {
    if (!allChecked) {
      setError(t('consent.required'));
      return;
    }
    savePreferences({
      preferences,
      acceptedTerms: terms,
      acceptedPrivacy: privacy,
      acceptedCookies: cookies,
      confirmedAge: age,
      locale,
    });
  };

  const checkboxes: Array<{ id: string; label: string; checked: boolean; set: (v: boolean) => void; href?: string }> = [
    { id: 'consent-terms', label: t('consent.terms'), checked: terms, set: setTerms, href: '/legal/terms' },
    { id: 'consent-privacy', label: t('consent.privacy'), checked: privacy, set: setPrivacy, href: '/legal/privacy' },
    { id: 'consent-cookies', label: t('consent.cookies'), checked: cookies, set: setCookies, href: '/legal/cookies' },
    { id: 'consent-age', label: t('consent.age'), checked: age, set: setAge },
  ];

  return (
    <Modal
      open
      dismissible={false}
      title={t('consent.title')}
      width={620}
      footer={
        <div className="consent-actions">
          <button type="button" className="btn-primary" onClick={() => acceptAll(locale)}>
            {t('consent.acceptAll')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => acceptEssentialOnly(locale)}>
            {t('consent.onlyEssential')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setPreferences(defaultPreferences(false));
              acceptEssentialOnly(locale);
            }}
          >
            {t('consent.rejectOptional')}
          </button>
          {showPreferences ? (
            <button type="button" className="btn-primary" onClick={handleSave}>
              {t('consent.savePreferences')}
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setShowPreferences(true)}>
              {t('consent.managePreferences')}
            </button>
          )}
        </div>
      }
    >
      <p className="consent-intro">{t('consent.intro')}</p>

      <div className="consent-checks">
        {checkboxes.map(item => (
          <label key={item.id} htmlFor={item.id} className="consent-check">
            <input
              id={item.id}
              type="checkbox"
              checked={item.checked}
              onChange={e => {
                item.set(e.target.checked);
                setError('');
              }}
            />
            <span>
              {item.label}
              {item.href && (
                <>
                  {' '}
                  <a href={item.href}>↗</a>
                </>
              )}
            </span>
          </label>
        ))}
      </div>

      {error && <div className="alert-error mt-2">{error}</div>}

      {showPreferences && (
        <div className="mt-3">
          <h3 className="consent-subtitle">{t('consent.managePreferences')}</h3>
          {COOKIE_CATEGORIES.map(category => {
            const required = REQUIRED_CATEGORIES.includes(category);
            return (
              <Toggle
                key={category}
                label={t(CATEGORY_KEYS[category].label)}
                description={t(CATEGORY_KEYS[category].desc)}
                checked={required ? true : preferences[category]}
                disabled={required}
                onChange={value => setPreferences(prev => ({ ...prev, [category]: value }))}
              />
            );
          })}
        </div>
      )}
    </Modal>
  );
}
