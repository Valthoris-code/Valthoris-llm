import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { useT } from '../../i18n/useI18n';

export const LEGAL_PDF = '/legal/Valthoris-Livro-Juridico-Oficial.pdf';

export interface LegalSection {
  heading: string;
  body: string[];
}

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  updated?: string;
  sections: LegalSection[];
  /** Anchor inside the official legal book, used by the PDF deep links. */
  pdfAnchor?: string;
}

/**
 * Shared shell for every legal page: consistent header, PDF actions, printable
 * sections and a link back to the legal index.
 */
export default function LegalDocument({
  icon,
  title,
  subtitle,
  updated = '2026',
  sections,
  pdfAnchor,
}: Props) {
  const t = useT();
  const pdfHref = pdfAnchor ? `${LEGAL_PDF}#${pdfAnchor}` : LEGAL_PDF;

  return (
    <div className="page legal-page">
      <PageHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        badge={<span className="badge-beta">{t('common.beta')}</span>}
        actions={
          <div className="legal-actions">
            <a className="btn-primary legal-btn" href={pdfHref} target="_blank" rel="noreferrer">
              📖 {t('legal.openPdf')}
            </a>
            <a
              className="btn-secondary legal-btn"
              href={LEGAL_PDF}
              download="Valthoris-Livro-Juridico-Oficial.pdf"
            >
              ⬇️ {t('legal.downloadPdf')}
            </a>
            <Link className="btn-secondary legal-btn" to="/legal">
              ⚖️ {t('legal.framework')}
            </Link>
          </div>
        }
      />

      <p className="legal-updated">Last updated: {updated}</p>

      <article className="legal-body">
        {sections.map(section => (
          <section key={section.heading} className="card legal-section">
            <h2 className="legal-heading">{section.heading}</h2>
            {section.body.map((paragraph, index) => (
              <p key={index} className="legal-paragraph">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>

      <p className="legal-footnote">
        Questions about this document? Contact{' '}
        <a href="mailto:contact@valthoris.com">contact@valthoris.com</a> or our Data Protection
        Officer via the <Link to="/legal/dpo">{t('legal.dpo')}</Link> page.
      </p>
    </div>
  );
}
