import React from 'react';

const LINKS = [
  { label: 'Privacy Policy',    to: '/legal#privacy' },
  { label: 'Terms & Conditions', to: '/legal#terms' },
  { label: 'Cookies',           to: '/legal#cookies' },
  { label: 'Legal Framework',   to: '/legal' },
];

const SOCIAL = [
  { label: 'GitHub',   href: 'https://github.com', icon: '⬡' },
  { label: 'Discord',  href: 'https://discord.com', icon: '💬' },
  { label: 'LinkedIn', href: 'https://linkedin.com', icon: '🔗' },
  { label: 'X',        href: 'https://x.com', icon: '✕' },
  { label: 'YouTube',  href: 'https://youtube.com', icon: '▶' },
  { label: 'Email',    href: 'mailto:contact@valthoris.com', icon: '✉' },
];

export default function AppFooter() {
  return (
    <footer style={{
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border)',
      padding: '1.25rem 2rem',
      fontSize: '0.8rem',
      color: 'var(--text-muted)',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Legal links */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {LINKS.map(l => (
            <a key={l.label} href={l.to} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
               onMouseOver={e => (e.currentTarget.style.color = 'var(--accent-cyan)')}
               onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              {l.label}
            </a>
          ))}
        </div>

        {/* Social links */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {SOCIAL.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
               title={s.label}
               style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
               onMouseOver={e => (e.currentTarget.style.color = 'var(--accent-cyan)')}
               onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              {s.icon}
            </a>
          ))}
        </div>

        {/* ICP powered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>Powered by</span>
          <a href="https://internetcomputer.org" target="_blank" rel="noreferrer"
             style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}>
            Internet Computer
          </a>
          <span>© {new Date().getFullYear()} VALTHORIS</span>
        </div>
      </div>
    </footer>
  );
}
