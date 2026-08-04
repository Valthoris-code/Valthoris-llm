import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Toggle from '../components/ui/Toggle';
import LanguageSelector from '../components/LanguageSelector';
import EmptyState from '../components/ui/EmptyState';
import { useI18n } from '../i18n/useI18n';

const COUNTRIES = [
  'Portugal',
  'Brazil',
  'Spain',
  'France',
  'Germany',
  'Italy',
  'United Kingdom',
  'United States',
  'Other',
];

const STORAGE_KEY = 'valthoris.profile.prefs.v1';

interface ProfilePrefs {
  country: string;
  publicProfile: boolean;
  twoFactor: boolean;
}

const DEFAULTS: ProfilePrefs = { country: '', publicProfile: false, twoFactor: false };

/**
 * Account preferences and security surfaces shown on the profile page.
 * Sessions, trusted devices and API keys are placeholders until the identity
 * canister exposes the matching endpoints.
 */
export default function ProfilePreferences({ principal }: { principal: string | null }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<ProfilePrefs>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ProfilePrefs>) });
    } catch {
      // ignore malformed storage
    }
  }, []);

  const update = <K extends keyof ProfilePrefs>(key: K, value: ProfilePrefs[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence failures
    }
    // TODO(backend): store account preferences in the identity canister.
  };

  return (
    <>
      <section className="card mt-2 settings-card">
        <h2 className="section-title">🌍 Region & language</h2>
        <label className="field">
          <span className="field-label">Country</span>
          <select value={prefs.country} onChange={e => update('country', e.target.value)}>
            <option value="">Select…</option>
            {COUNTRIES.map(country => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">{t('common.language')}</span>
          <LanguageSelector />
        </div>
        <div className="settings-actions">
          <Link className="btn-secondary settings-btn" to="/settings#appearance">
            🎨 Theme settings
          </Link>
        </div>
      </section>

      <section className="card mt-2 settings-card">
        <h2 className="section-title">🔐 Security</h2>
        <p className="text-muted settings-note">
          Signed in with Internet Identity{principal ? ' as ' : ''}
          {principal && <code>{principal.slice(0, 12)}…</code>}
        </p>
        <Toggle
          label="Public profile"
          description="Show your display name on community reports."
          checked={prefs.publicProfile}
          onChange={value => update('publicProfile', value)}
        />
        <Toggle
          label="Two-factor confirmation"
          description="Require an extra confirmation for sensitive actions."
          checked={prefs.twoFactor}
          onChange={value => update('twoFactor', value)}
        />
      </section>

      <section className="card mt-2 settings-card">
        <h2 className="section-title">💻 Sessions & trusted devices</h2>
        <ul className="safe-list">
          <li className="safe-list-item">
            <div className="safe-list-head">
              <span aria-hidden="true" className="safe-avatar">
                🖥
              </span>
              <div className="safe-list-text">
                <strong>This device</strong>
                <span className="text-muted safe-list-sub">Current session · Internet Identity</span>
              </div>
              <span className="badge badge-green">active</span>
            </div>
          </li>
        </ul>
        <p className="text-muted settings-note mt-2">
          {/* TODO(backend): list and revoke sessions and trusted devices via the identity canister. */}
          Remote session listing and revocation arrive with the identity canister update.
        </p>
      </section>

      <section className="card mt-2 settings-card">
        <h2 className="section-title">🔑 API keys</h2>
        <EmptyState
          icon="🔑"
          title="No API keys yet"
          body="Programmatic access will be available once the VALTHORIS public API ships."
          action={
            <button type="button" className="btn-secondary settings-btn" disabled>
              {t('common.comingSoon')}
            </button>
          }
        />
        {/* TODO(backend): issue, rotate and revoke API keys. */}
      </section>
    </>
  );
}
