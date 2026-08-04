import React from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/useI18n';

const LEGAL_LINKS = [
  { to: '/legal/privacy', key: 'legal.privacy' },
  { to: '/legal/terms', key: 'legal.terms' },
  { to: '/legal/cookies', key: 'legal.cookies' },
  { to: '/legal', key: 'legal.framework' },
  { to: '/legal/responsible-disclosure', key: 'legal.disclosure' },
  { to: '/legal/security', key: 'legal.security' },
  { to: '/legal/gdpr', key: 'legal.gdpr' },
  { to: '/contact', key: 'nav.contact' },
];

const SOCIAL = [
  { label: 'GitHub', href: 'https://github.com/Valthoris-code', icon: '⬡' },
  { label: 'Discord', href: 'https://discord.com', icon: '💬' },
  { label: 'LinkedIn', href: 'https://linkedin.com', icon: '🔗' },
  { label: 'X', href: 'https://x.com', icon: '✕' },
  { label: 'Telegram', href: 'https://telegram.org', icon: '✈' },
  { label: 'YouTube', href: 'https://youtube.com', icon: '▶' },
  { label: 'Email', href: 'mailto:contact@valthoris.com', icon: '✉' },
];

export default function AppFooter() {
  const t = useT();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <nav className="app-footer-links" aria-label="Legal">
          {LEGAL_LINKS.map(link => (
            <Link key={link.to + link.key} to={link.to} className="app-footer-link">
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="app-footer-social">
          {SOCIAL.map(item => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              title={item.label}
              aria-label={item.label}
              className="app-footer-icon"
            >
              <span aria-hidden="true">{item.icon}</span>
            </a>
          ))}
        </div>

        <div className="app-footer-meta">
          <span>
            Powered by{' '}
            <a href="https://internetcomputer.org" target="_blank" rel="noreferrer">
              Internet Computer
            </a>
          </span>
          <a href="mailto:contact@valthoris.com">contact@valthoris.com</a>
          <span>© {new Date().getFullYear()} VALTHORIS</span>
        </div>
      </div>
    </footer>
  );
}
