import React from 'react';

const FAQS = [
  { q: 'What is VALTHORIS?', a: 'VALTHORIS is a decentralised AI-powered cybersecurity platform built on the Internet Computer. It helps you identify threats, verify suspicious contacts, and stay protected online.' },
  { q: 'How do I sign in?', a: 'VALTHORIS uses Internet Identity for authentication — a secure, privacy-preserving identity system by DFINITY. Click "Sign In" in the top right to authenticate.' },
  { q: 'Is my data private?', a: 'Yes. All logic runs on Internet Computer canisters. There are no centralised servers. Your data is protected by cryptographic principles.' },
  { q: 'What is Beta Private?', a: 'VALTHORIS is currently in Beta Private mode. Core features are functional but some modules are still under development. Only invited users have full access.' },
  { q: 'How do I report a scam?', a: 'Go to Community Reports and click "Submit Report". Fill in the report type, target value, and a description. Your report will be reviewed by the community.' },
  { q: 'What is the AI Assistant?', a: 'The AI Assistant is a ChatGPT-like interface for cybersecurity queries. It will be connected to the VALTHORIS AI engine to provide threat analysis, guidance, and intelligence.' },
];

export default function Help() {
  const [open, setOpen] = React.useState<number | null>(null);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>❓ Help & Support</h1>
        <span className="badge-beta">BETA</span>
      </div>
      <p className="text-muted">Find answers to common questions and learn how to use VALTHORIS.</p>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1.5rem' }}>
        {[
          { icon: '📖', label: 'Documentation',  href: '#' },
          { icon: '💬', label: 'Discord',         href: 'https://discord.com' },
          { icon: '📧', label: 'Email Support',   href: 'mailto:support@valthoris.com' },
          { icon: '⬡', label: 'GitHub',          href: 'https://github.com' },
        ].map(l => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '1.25rem',
              background: 'rgba(10,37,64,0.8)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              textDecoration: 'none',
              color: 'var(--text-muted)',
              transition: 'border-color 0.15s, color 0.15s',
              fontSize: '0.88rem',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-cyan)'; e.currentTarget.style.color = 'var(--accent-cyan)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: '1.8rem' }}>{l.icon}</span>
            {l.label}
          </a>
        ))}
      </div>

      {/* FAQ */}
      <h2 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.1rem' }}>Frequently Asked Questions</h2>
      <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {FAQS.map((faq, i) => (
          <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === i ? null : i)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <strong style={{ fontSize: '0.92rem' }}>{faq.q}</strong>
              <span style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>{open === i ? '▲' : '▼'}</span>
            </div>
            {open === i && (
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {faq.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
