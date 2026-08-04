import React from 'react';
import PageHeader from '../components/ui/PageHeader';
import ComingSoonCard from '../components/ui/ComingSoonCard';
import { useT } from '../i18n/useI18n';

const MODULES = [
  { icon: '🔰', title: 'AutoShield', description: 'Autonomous protection that blocks malicious calls, links and transfers in real time.' },
  { icon: '📱', title: 'Android Protection', description: 'Native Android app with background scanning and Safe Location integration.' },
  { icon: '⚡', title: 'Realtime Detection', description: 'Streaming detection pipeline for live threat scoring across the network.' },
  { icon: '🏢', title: 'Enterprise Dashboard', description: 'Multi-tenant console with team roles, SSO and organisation-wide reporting.' },
  { icon: '🧩', title: 'Browser Extension', description: 'Inline warnings on suspicious pages, checkouts and downloads.' },
  { icon: '🛒', title: 'Marketplace API', description: 'Public API and partner marketplace for threat intelligence feeds.' },
];

export default function ComingSoon() {
  const t = useT();
  return (
    <div className="page">
      <PageHeader
        icon="🚀"
        title={t('nav.comingSoon')}
        subtitle="Modules already designed and scheduled for the VALTHORIS roadmap."
        badge={<span className="badge-coming-soon">{t('common.comingSoon')}</span>}
      />
      <div className="module-grid">
        {MODULES.map(module => (
          <ComingSoonCard key={module.title} {...module} />
        ))}
      </div>
    </div>
  );
}
