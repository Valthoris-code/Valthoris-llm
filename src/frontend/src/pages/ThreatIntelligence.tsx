import React from 'react';

export default function ThreatIntelligence() {
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>🛡 Threat Intelligence</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Aggregated threat feeds, indicators of compromise, and intelligence reports.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {[
          { icon: '🌡', label: 'Threat Level',    value: '—',        color: 'var(--accent-amber)', desc: 'Global threat index' },
          { icon: '📍', label: 'Active IOCs',      value: '—',        color: 'var(--accent-cyan)',  desc: 'Indicators of Compromise' },
          { icon: '⚠',  label: 'New Today',        value: '—',        color: 'var(--accent-red)',   desc: 'Threats added today' },
          { icon: '✅', label: 'Resolved',          value: '—',        color: 'var(--accent-green)', desc: 'Threats resolved this week' },
        ].map(s => (
          <div key={s.label} className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.8rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3">
        <h3 style={{ marginTop: 0 }}>Recent Threat Indicators</h3>
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
          <p className="text-muted">Threat feed loading…</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            TODO: Connect to <code>threat_intelligence</code> canister feed
          </p>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            display: 'flex',
            gap: '1rem',
            padding: '0.75rem 0',
            borderBottom: '1px solid var(--border)',
            opacity: 0.35,
            alignItems: 'center',
          }}>
            <span className="badge badge-red" style={{ fontSize: '0.7rem', flexShrink: 0 }}>HIGH</span>
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, width: '35%', marginBottom: 6 }} />
              <div style={{ height: 9, background: 'var(--border)', borderRadius: 4, width: '55%' }} />
            </div>
            <div style={{ height: 9, background: 'var(--border)', borderRadius: 4, width: 80 }} />
          </div>
        ))}
      </div>

      <div className="card mt-2" style={{ background: 'rgba(0,212,255,0.04)', border: '1px dashed var(--border)' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          ℹ️ <strong style={{ color: 'var(--accent-cyan)' }}>TODO:</strong> Connect to threat_intelligence canister methods: <code>getThreats()</code>, <code>getIOCs()</code>, <code>getThreatStats()</code>
        </p>
      </div>
    </div>
  );
}
