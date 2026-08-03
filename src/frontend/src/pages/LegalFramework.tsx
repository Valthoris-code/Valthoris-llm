import React from 'react';

export default function LegalFramework() {
  const pdfUrl = '/legal/Valthoris-Livro-Juridico-Oficial.pdf';

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>⚖️ Legal Framework</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Official VALTHORIS legal documentation and policies.</p>

      <div className="card mt-2" style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2.5rem' }}>📄</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>VALTHORIS — Livro Jurídico Oficial</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Official legal framework, terms, privacy policy, and compliance documentation.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
            style={{ textDecoration: 'none', padding: '0.5rem 1.25rem', borderRadius: 8, fontSize: '0.9rem' }}
          >
            📖 Open PDF
          </a>
          <a
            href={pdfUrl}
            download="Valthoris-Livro-Juridico-Oficial.pdf"
            className="btn-secondary"
            style={{ textDecoration: 'none', padding: '0.5rem 1.25rem', borderRadius: 8, fontSize: '0.9rem' }}
          >
            ⬇️ Download PDF
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1.5rem', maxWidth: 700 }}>
        {[
          { id: 'privacy',  icon: '🔒', title: 'Privacy Policy',     desc: 'How we collect, use, and protect your data.' },
          { id: 'terms',    icon: '📋', title: 'Terms & Conditions',  desc: 'Rules and regulations for using VALTHORIS.' },
          { id: 'cookies',  icon: '🍪', title: 'Cookie Policy',       desc: 'Information about cookies and tracking.' },
          { id: 'icp',      icon: '🌐', title: 'Internet Computer',   desc: 'Our decentralised infrastructure and data policy.' },
        ].map(section => (
          <div
            key={section.id}
            id={section.id}
            className="card"
            style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{section.icon}</div>
            <h3 style={{ margin: '0 0 0.3rem', fontSize: '0.92rem' }}>{section.title}</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{section.desc}</p>
            <a href={`${pdfUrl}#${section.id}`} target="_blank" rel="noreferrer"
               style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', marginTop: '0.5rem', display: 'block', textDecoration: 'none' }}>
              View in PDF →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
