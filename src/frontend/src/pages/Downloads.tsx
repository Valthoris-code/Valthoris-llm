import React from 'react';

const DOWNLOADS: Array<{
  category: string;
  items: Array<{ name: string; icon: string; version: string; status: string; desc: string; href?: string }>;
}> = [
  {
    category: 'Mobile Apps',
    items: [
      { name: 'VALTHORIS Android',       icon: '🤖', version: 'Coming Soon', status: 'coming_soon', desc: 'Full Android protection app with real-time shield.' },
    ],
  },
  {
    category: 'Browser Extensions',
    items: [
      { name: 'Chrome Extension',         icon: '🧩', version: 'Coming Soon', status: 'coming_soon', desc: 'Automatic phishing and threat detection in your browser.' },
      { name: 'Firefox Extension',        icon: '🦊', version: 'Coming Soon', status: 'coming_soon', desc: 'Firefox-native protection extension.' },
    ],
  },
  {
    category: 'Desktop Tools',
    items: [
      { name: 'VALTHORIS CLI',            icon: '💻', version: 'Coming Soon', status: 'coming_soon', desc: 'Command-line tool for batch scanning and automation.' },
    ],
  },
  {
    category: 'Documentation',
    items: [
      { name: 'API Documentation',        icon: '📄', version: 'v1.0',        status: 'available',  desc: 'Full REST and Candid API reference for developers.', href: '#' },
      { name: 'Legal Framework (PDF)',     icon: '⚖️', version: 'v1.0',        status: 'available',  desc: 'Official VALTHORIS legal document.',                 href: '/legal/Valthoris-Livro-Juridico-Oficial.pdf' },
    ],
  },
];

export default function Downloads() {
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>⬇️ Downloads</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Download VALTHORIS apps, extensions, and tools.</p>

      {DOWNLOADS.map(cat => (
        <div key={cat.category} style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
            {cat.category}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {cat.items.map(item => (
              <div key={item.name} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.8rem' }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.version}</div>
                  </div>
                  {item.status === 'coming_soon' ? (
                    <span className="badge-coming-soon">Soon</span>
                  ) : (
                    <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>Available</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.desc}</p>
                {item.status === 'available' && item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary"
                    style={{ textAlign: 'center', display: 'block', padding: '0.4rem', fontSize: '0.83rem', borderRadius: 6, textDecoration: 'none' }}
                  >
                    ⬇️ Download
                  </a>
                ) : (
                  <button disabled style={{ background: 'var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '0.4rem', fontSize: '0.83rem', cursor: 'not-allowed' }}>
                    Coming Soon
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
