import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Toggle from '../components/ui/Toggle';
import LanguageSelector from '../components/LanguageSelector';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n/useI18n';

type ThemeId = 'dark' | 'darker' | 'contrast';

interface Preferences {
  theme: ThemeId;
  reduceMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyThreats: boolean;
  notifyCommunity: boolean;
  telemetry: boolean;
  publicProfile: boolean;
  locationEnabled: boolean;
  locationPrecise: boolean;
}

const DEFAULTS: Preferences = {
  theme: 'dark',
  reduceMotion: false,
  largeText: false,
  highContrast: false,
  notifyEmail: true,
  notifyPush: false,
  notifyThreats: true,
  notifyCommunity: false,
  telemetry: false,
  publicProfile: false,
  locationEnabled: false,
  locationPrecise: true,
};

const STORAGE_KEY = 'valthoris.settings.v1';

function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const SECTIONS = [
  { id: 'appearance', icon: '🎨', label: 'Appearance' },
  { id: 'accessibility', icon: '♿', label: 'Accessibility' },
  { id: 'notifications', icon: '🔔', label: 'Notifications' },
  { id: 'security', icon: '🔐', label: 'Security' },
  { id: 'privacy', icon: '🕵', label: 'Privacy' },
  { id: 'location', icon: '📍', label: 'Location' },
  { id: 'cookies', icon: '🍪', label: 'Cookies' },
  { id: 'legal', icon: '⚖️', label: 'Legal' },
] as const;

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const { t, autoTranslate, setAutoTranslate } = useI18n();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.largeText = String(prefs.largeText);
    root.dataset.reduceMotion = String(prefs.reduceMotion);
    root.dataset.highContrast = String(prefs.highContrast || prefs.theme === 'contrast');
  }, [prefs.theme, prefs.largeText, prefs.reduceMotion, prefs.highContrast]);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — preferences apply to this session only
    }
    // TODO(backend): persist user preferences in the identity canister profile.
  };

  return (
    <div className="page">
      <PageHeader
        icon="⚙️"
        title={t('nav.settings')}
        subtitle="Configure your VALTHORIS experience."
        badge={<span className="badge-beta">{t('common.beta')}</span>}
      />

      <nav className="settings-nav" aria-label={t('nav.settings')}>
        {SECTIONS.map(section => (
          <a key={section.id} href={`#${section.id}`} className="settings-nav-link">
            <span aria-hidden="true">{section.icon}</span> {section.label}
          </a>
        ))}
      </nav>

      <section id="appearance" className="card mt-2 settings-card">
        <h2 className="section-title">🎨 Appearance</h2>
        <div className="field">
          <span className="field-label">Theme</span>
          <div className="settings-chips">
            {(['dark', 'darker', 'contrast'] as ThemeId[]).map(theme => (
              <button
                key={theme}
                type="button"
                aria-pressed={prefs.theme === theme}
                className={`settings-chip${prefs.theme === theme ? ' settings-chip-active' : ''}`}
                onClick={() => update('theme', theme)}
              >
                {theme === 'dark' ? '🌙 Dark' : theme === 'darker' ? '⚫ Darker' : '🔆 High contrast'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('common.language')}</span>
          <LanguageSelector />
        </div>
        <Toggle
          label="Auto-translate community content"
          description="Translate community reports, AI conversations and threat descriptions into your language."
          checked={autoTranslate}
          onChange={setAutoTranslate}
        />
      </section>

      <section id="accessibility" className="card mt-2 settings-card">
        <h2 className="section-title">♿ Accessibility</h2>
        <Toggle
          label="Reduce motion"
          description="Minimise animations and transitions across the interface."
          checked={prefs.reduceMotion}
          onChange={value => update('reduceMotion', value)}
        />
        <Toggle
          label="Larger text"
          description="Increase the base font size for improved readability."
          checked={prefs.largeText}
          onChange={value => update('largeText', value)}
        />
        <Toggle
          label="Higher contrast"
          description="Strengthen borders and text contrast."
          checked={prefs.highContrast}
          onChange={value => update('highContrast', value)}
        />
      </section>

      <section id="notifications" className="card mt-2 settings-card">
        <h2 className="section-title">🔔 {t('nav.notifications')}</h2>
        <Toggle label="Email notifications" description="Receive alerts by email." checked={prefs.notifyEmail} onChange={v => update('notifyEmail', v)} />
        <Toggle label="Push notifications" description="Browser push notifications." checked={prefs.notifyPush} onChange={v => update('notifyPush', v)} />
        <Toggle label="Threat alerts" description="Instant alerts for critical threats." checked={prefs.notifyThreats} onChange={v => update('notifyThreats', v)} />
        <Toggle label="Community activity" description="Updates on reports you follow." checked={prefs.notifyCommunity} onChange={v => update('notifyCommunity', v)} />
      </section>

      <section id="security" className="card mt-2 settings-card">
        <h2 className="section-title">🔐 Security</h2>
        {isAuthenticated ? (
          <>
            <p className="text-muted settings-note">
              Authentication: <span style={{ color: 'var(--accent-green)' }}>Internet Identity</span>
            </p>
            <div className="settings-actions">
              <Link className="btn-secondary settings-btn" to="/profile">
                Manage sessions & devices
              </Link>
              <Link className="btn-secondary settings-btn" to="/legal/security">
                {t('legal.security')}
              </Link>
            </div>
            {/* TODO(backend): 2FA enrolment, session revocation and API key management. */}
          </>
        ) : (
          <p className="text-muted settings-note">Sign in to manage security settings.</p>
        )}
      </section>

      <section id="privacy" className="card mt-2 settings-card">
        <h2 className="section-title">🕵 Privacy</h2>
        <Toggle label="Share anonymous telemetry" description="Helps us diagnose errors. No personal identifiers." checked={prefs.telemetry} onChange={v => update('telemetry', v)} />
        <Toggle label="Public profile" description="Show your display name on community reports." checked={prefs.publicProfile} onChange={v => update('publicProfile', v)} />
        <div className="settings-actions">
          <Link className="btn-secondary settings-btn" to="/legal/gdpr">
            {t('legal.gdpr')}
          </Link>
          <Link className="btn-secondary settings-btn" to="/legal/privacy">
            {t('legal.privacy')}
          </Link>
        </div>
      </section>

      <section id="location" className="card mt-2 settings-card">
        <h2 className="section-title">📍 {t('nav.safeLocation')}</h2>
        <Toggle label="Enable location features" description="Required by Safe Location, geofences and SOS." checked={prefs.locationEnabled} onChange={v => update('locationEnabled', v)} />
        <Toggle label="Precise location" description="Use GNSS accuracy when available." checked={prefs.locationPrecise} onChange={v => update('locationPrecise', v)} />
        <div className="settings-actions">
          <Link className="btn-secondary settings-btn" to="/safe-location">
            Open Safe Location
          </Link>
        </div>
      </section>

      <section id="cookies" className="card mt-2 settings-card">
        <h2 className="section-title">🍪 {t('legal.cookies')}</h2>
        <p className="text-muted settings-note">
          Review or withdraw your consent for each optional cookie category at any time.
        </p>
        <div className="settings-actions">
          <Link className="btn-primary settings-btn" to="/legal/cookie-preferences">
            {t('consent.managePreferences')}
          </Link>
          <Link className="btn-secondary settings-btn" to="/legal/cookies">
            {t('legal.cookies')}
          </Link>
        </div>
      </section>

      <section id="legal" className="card mt-2 settings-card">
        <h2 className="section-title">⚖️ {t('legal.framework')}</h2>
        <div className="settings-actions">
          <Link className="btn-secondary settings-btn" to="/legal">{t('legal.framework')}</Link>
          <Link className="btn-secondary settings-btn" to="/legal/terms">{t('legal.terms')}</Link>
          <Link className="btn-secondary settings-btn" to="/legal/dpo">{t('legal.dpo')}</Link>
          <Link className="btn-secondary settings-btn" to="/legal/copyright">{t('legal.copyright')}</Link>
        </div>
      </section>

      <div className="mt-3">
        <button type="button" className="btn-primary" onClick={() => toast('Settings saved on this device.', 'success')}>
          💾 {t('common.save')}
        </button>
      </div>
    </div>
  );
}
