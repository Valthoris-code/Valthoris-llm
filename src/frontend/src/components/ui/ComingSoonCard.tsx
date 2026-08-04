import React from 'react';
import { useT } from '../../i18n/useI18n';

interface Props {
  icon: string;
  title: string;
  description: string;
}

/** Disabled card advertising a module that is not shipped yet. */
export default function ComingSoonCard({ icon, title, description }: Props) {
  const t = useT();
  return (
    <div className="card coming-soon-card" aria-disabled="true">
      <div className="coming-soon-head">
        <span aria-hidden="true" className="coming-soon-icon">
          {icon}
        </span>
        <span className="badge-coming-soon">{t('common.comingSoon')}</span>
      </div>
      <h3 className="coming-soon-title">{title}</h3>
      <p className="coming-soon-desc">{description}</p>
      <button type="button" className="btn-secondary coming-soon-btn" disabled>
        {t('common.comingSoon')}
      </button>
    </div>
  );
}
