import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Settings() {
  const { isAuthenticated } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'darker'>('dark');
  const [lang, setLang] = useState('en');
  const [notifications, setNotifications] = useState({ email: true, push: false, threats: true });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>⚙️ Settings</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Configure your VALTHORIS experience.</p>

      {saved && <div className="alert-success mt-2" style={{ maxWidth: 600 }}>✅ Settings saved!</div>}

      {/* Appearance */}
      <div className="card mt-2" style={{ maxWidth: 600 }}>
        <h3 style={{ marginTop: 0 }}>🎨 Appearance</h3>
        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Theme</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['dark', 'darker'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  background: theme === t ? 'rgba(0,212,255,0.12)' : 'none',
                  border: `1px solid ${theme === t ? 'var(--accent-cyan)' : 'var(--border)'}`,
                  color: theme === t ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  borderRadius: 6, padding: '0.35rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                {t === 'dark' ? '🌙 Dark' : '⚫ Darker'}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Language</label>
          <select value={lang} onChange={e => setLang(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="en">🇬🇧 English</option>
            <option value="pt">🇵🇹 Português</option>
            <option value="es">🇪🇸 Español</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="de">🇩🇪 Deutsch</option>
          </select>
        </div>
      </div>

      {/* Notifications */}
      <div className="card mt-2" style={{ maxWidth: 600 }}>
        <h3 style={{ marginTop: 0 }}>🔔 Notifications</h3>
        {[
          { key: 'email' as const,  label: 'Email Notifications',        desc: 'Receive alerts via email' },
          { key: 'push' as const,   label: 'Push Notifications',          desc: 'Browser push notifications' },
          { key: 'threats' as const, label: 'Threat Alerts',             desc: 'Instant alerts for critical threats' },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <button
              onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: notifications[item.key] ? 'var(--accent-cyan)' : 'var(--border)',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: notifications[item.key] ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        ))}
      </div>

      {/* Security */}
      <div className="card mt-2" style={{ maxWidth: 600 }}>
        <h3 style={{ marginTop: 0 }}>🔐 Security</h3>
        {isAuthenticated ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Authentication: <span style={{ color: 'var(--accent-green)' }}>✅ Internet Identity</span>
            <br />
            <span style={{ fontSize: '0.78rem' }}>TODO: 2FA, session management, API keys</span>
          </p>
        ) : (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Sign in to manage security settings.
          </p>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', maxWidth: 600 }}>
        <button className="btn-primary" onClick={handleSave} style={{ padding: '0.5rem 2rem' }}>
          💾 Save Settings
        </button>
      </div>
    </div>
  );
}
