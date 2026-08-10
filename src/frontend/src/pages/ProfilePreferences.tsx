import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Toggle from '../components/ui/Toggle';
import LanguageSelector from '../components/LanguageSelector';
import EmptyState from '../components/ui/EmptyState';
import { useI18n } from '../i18n/useI18n';
import type { ProfileDetailsData } from '../services/profileService';

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

/**
 * Account preferences and security surfaces shown on the profile page.
 *
 * Preferences are persisted in the `backend` canister together with the rest
 * of the extended profile (see services/profileService.ts) — the parent page
 * owns the state and supplies `onChange`, which performs the authenticated
 * write. Sessions, trusted devices and API keys remain placeholders until the
 * identity canister exposes the matching endpoints.
 */
export default function ProfilePreferences({
  principal,
  prefs,
  onChange,
}: {
  principal: string | null;
  prefs: ProfileDetailsData;
  onChange: (next: ProfileDetailsData) => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof ProfileDetailsData>(key: K, value: ProfileDetailsData[K]) => {
    const next = { ...prefs, [key]: value };
    setBusy(true);
    setError('');
    void onChange(next)
      .catch(e => setError(`Não foi possível guardar a preferência: ${String(e)}`))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <section className="card mt-2 settings-card">
        <h2 className="section-title">🌍 Region & language</h2>
        {error && <div className="alert-error mt-2">{error}</div>}
        <label className="field">
          <span className="field-label">Country</span>
          <select
            value={prefs.country ?? ''}
            disabled={busy}
            onChange={e => update('country', e.target.value || undefined)}
          >
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
          disabled={busy}
        />
        <Toggle
          label="Two-factor confirmation"
          description="Require an extra confirmation for sensitive actions."
          checked={prefs.twoFactor}
          onChange={value => update('twoFactor', value)}
          disabled={busy}
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
