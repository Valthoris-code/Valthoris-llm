import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { useT } from '../i18n/useI18n';

const PDF_URL = '/legal/Valthoris-Livro-Juridico-Oficial.pdf';

interface LegalLink {
  to: string;
  icon: string;
  titleKey: string;
  desc: string;
  anchor: string;
}

const LEGAL_LINKS: LegalLink[] = [
  { to: '/legal/privacy', icon: '🔒', titleKey: 'legal.privacy', anchor: 'privacy', desc: 'How we collect, use and protect your data.' },
  { to: '/legal/terms', icon: '📋', titleKey: 'legal.terms', anchor: 'terms', desc: 'Rules and regulations for using VALTHORIS.' },
  { to: '/legal/cookies', icon: '🍪', titleKey: 'legal.cookies', anchor: 'cookies', desc: 'Cookies, local storage and tracking.' },
  { to: '/legal/gdpr', icon: '🇪🇺', titleKey: 'legal.gdpr', anchor: 'gdpr', desc: 'Access, rectification, erasure and portability.' },
  { to: '/legal/data-processing', icon: '🗄', titleKey: 'legal.dataProcessing', anchor: 'data-processing', desc: 'Purposes, recipients and transfers.' },
  { to: '/legal/responsible-disclosure', icon: '🧪', titleKey: 'legal.disclosure', anchor: 'disclosure', desc: 'How to report a vulnerability safely.' },
  { to: '/legal/security', icon: '🛡', titleKey: 'legal.security', anchor: 'security', desc: 'Controls protecting the platform.' },
  { to: '/legal/dpo', icon: '👤', titleKey: 'legal.dpo', anchor: 'dpo', desc: 'Reach our Data Protection Officer.' },
  { to: '/legal/copyright', icon: '©', titleKey: 'legal.copyright', anchor: 'copyright', desc: 'Brand, software and documentation rights.' },
];

export default function LegalFramework() {
  const t = useT();

  return (
    <div className="page">
      <PageHeader
        icon="⚖️"
        title={t('legal.framework')}
        subtitle="Official VALTHORIS legal documentation and compliance policies."
        badge={<span className="badge-beta">{t('common.beta')}</span>}
      />

      <div className="card mt-2 legal-book">
        <div className="legal-book-head">
          <span aria-hidden="true" className="legal-book-icon">📄</span>
          <div>
            <h2 className="legal-book-title">VALTHORIS — Livro Jurídico Oficial</h2>
            <p className="legal-book-desc">
              Official legal framework, terms, privacy policy and compliance documentation.
            </p>
          </div>
        </div>

        <div className="legal-actions">
          <a href={PDF_URL} target="_blank" rel="noreferrer" className="btn-primary legal-btn">
            📖 {t('legal.openPdf')}
          </a>
          <a href={PDF_URL} download="Valthoris-Livro-Juridico-Oficial.pdf" className="btn-secondary legal-btn">
            ⬇️ {t('legal.downloadPdf')}
          </a>
          <Link to="/legal/cookie-preferences" className="btn-secondary legal-btn">
            ⚙️ {t('consent.managePreferences')}
          </Link>
        </div>
      </div>

      <div className="legal-grid">
        {LEGAL_LINKS.map(link => (
          <Link key={link.to} to={link.to} className="card legal-card">
            <div aria-hidden="true" className="legal-card-icon">{link.icon}</div>
            <h3 className="legal-card-title">{t(link.titleKey)}</h3>
            <p className="legal-card-desc">{link.desc}</p>
            <span className="legal-card-link">Read →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
