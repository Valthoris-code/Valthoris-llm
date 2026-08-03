import React, { useState } from 'react';

const COUNTRIES = ['Portugal', 'Brazil', 'Spain', 'France', 'Germany', 'United Kingdom', 'United States', 'Other'];
const LANGUAGES = ['English', 'Português', 'Español', 'Français', 'Deutsch'];
const REASONS = ['Personal security', 'Business security', 'Research', 'Developer', 'Investor', 'Other'];

export default function WaitingList() {
  const [form, setForm] = useState({
    name: '', email: '', country: '', language: '', reason: '', consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) return;
    setLoading(true);
    // TODO: Connect to waiting list backend service
    await new Promise(r => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h2>You're on the list!</h2>
          <p className="text-muted">Thank you for joining the VALTHORIS waiting list. We'll notify you when Beta access is available.</p>
          <a href="/assistant" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none', padding: '0.5rem 1.5rem', borderRadius: 8 }}>
            Return to App
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛡</div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: 'var(--accent-cyan)' }}>VALTHORIS</h1>
          <p className="text-muted" style={{ margin: '0.4rem 0 0' }}>Join the Beta Private waiting list</p>
        </div>

        <div className="card glass">
          <form onSubmit={handleSubmit}>
            {[
              { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Your name' },
              { label: 'Email Address', key: 'email', type: 'email', placeholder: 'your@email.com' },
            ].map(field => (
              <div key={field.key} className="mb-2">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  required
                />
              </div>
            ))}

            {[
              { label: 'Country', key: 'country', options: COUNTRIES },
              { label: 'Preferred Language', key: 'language', options: LANGUAGES },
              { label: 'Reason for joining', key: 'reason', options: REASONS },
            ].map(sel => (
              <div key={sel.key} className="mb-2">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{sel.label}</label>
                <select value={(form as any)[sel.key]} onChange={e => setForm(f => ({ ...f, [sel.key]: e.target.value }))} required>
                  <option value="">Select…</option>
                  {sel.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            <div className="mb-2" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                id="consent"
                checked={form.consent}
                onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))}
                style={{ width: 'auto', marginTop: 3, flexShrink: 0 }}
                required
              />
              <label htmlFor="consent" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                I agree to the <a href="/legal" style={{ color: 'var(--accent-cyan)' }}>Privacy Policy and Terms</a> and consent to receive communications from VALTHORIS.
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '0.6rem' }}
              disabled={loading || !form.consent}
            >
              {loading ? '⏳ Submitting…' : '🛡 Join Waiting List'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
