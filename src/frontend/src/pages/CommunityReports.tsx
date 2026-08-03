import React, { useState } from 'react';
import { useActors } from '../hooks/useActors';

export default function CommunityReports() {
  const actors = useActors();
  const [tab, setTab] = useState<'feed' | 'submit'>('feed');
  const [form, setForm] = useState({ type: 'phone', target: '', description: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Connect to community canister submitReport
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>🚨 Community Reports</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Collective threat reporting powered by the VALTHORIS community.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {(['feed', 'submit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'rgba(0,212,255,0.12)' : 'none',
              border: `1px solid ${tab === t ? 'var(--accent-cyan)' : 'var(--border)'}`,
              color: tab === t ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: 6, padding: '0.35rem 1rem', cursor: 'pointer', fontSize: '0.88rem',
            }}
          >
            {t === 'feed' ? '📋 Live Feed' : '➕ Submit Report'}
          </button>
        ))}
      </div>

      {tab === 'feed' && (
        <div>
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem', opacity: 0.7 }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📡</div>
            <p className="text-muted">Community reports feed — connecting to canister…</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              TODO: Connect to <code>community.getReports()</code> canister method
            </p>
          </div>

          {/* Placeholder cards */}
          {[1, 2, 3].map(i => (
            <div key={i} className="card mt-2" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', opacity: 0.4 }}>
              <span style={{ fontSize: '1.4rem' }}>🚨</span>
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, background: 'var(--border)', borderRadius: 4, width: '40%', marginBottom: 8 }} />
                <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, width: '70%', marginBottom: 6 }} />
                <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, width: '50%' }} />
              </div>
              <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>Pending</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'submit' && (
        <div className="card" style={{ maxWidth: 560 }}>
          {submitted ? (
            <div className="alert-success">
              ✅ Report submitted successfully. Thank you for contributing to community safety!
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 style={{ marginTop: 0 }}>Submit a Community Report</h3>
              <div className="mb-2">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Report Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="phone">📞 Phone Number</option>
                  <option value="email">✉️ Email Address</option>
                  <option value="url">🌐 URL / Website</option>
                  <option value="iban">🏦 IBAN / Bank Account</option>
                  <option value="crypto">₿ Crypto Wallet</option>
                  <option value="domain">🖥 Domain</option>
                </select>
              </div>
              <div className="mb-2">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target</label>
                <input
                  type="text"
                  placeholder="Enter the suspicious value…"
                  value={form.target}
                  onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                  required
                />
              </div>
              <div className="mb-2">
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the suspicious activity…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
              <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? '⏳ Submitting…' : '🚨 Submit Report'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
