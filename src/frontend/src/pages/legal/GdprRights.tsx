import React from 'react';
import LegalDocument from './LegalDocument';

export default function GdprRights() {
  return (
    <LegalDocument
      icon="🇪🇺"
      title="GDPR Rights"
      subtitle="Your rights under the General Data Protection Regulation and how to exercise them."
      pdfAnchor="gdpr"
      sections={[
        {
          heading: 'Right of access (Art. 15)',
          body: ['Obtain confirmation of whether we process your personal data and receive a copy of it.'],
        },
        {
          heading: 'Right to rectification (Art. 16)',
          body: ['Correct inaccurate personal data, including profile fields and community report metadata.'],
        },
        {
          heading: 'Right to erasure (Art. 17)',
          body: [
            'Request deletion of your data. On-chain records may be redacted rather than physically removed where immutability applies; the limits are described in the Data Processing page.',
          ],
        },
        {
          heading: 'Right to restriction (Art. 18)',
          body: ['Ask us to pause processing while a dispute over accuracy or lawfulness is resolved.'],
        },
        {
          heading: 'Right to portability (Art. 20)',
          body: ['Receive your data in a structured, commonly used and machine-readable format.'],
        },
        {
          heading: 'Right to object (Art. 21)',
          body: ['Object to processing based on legitimate interest, including profiling for fraud detection.'],
        },
        {
          heading: 'How to exercise your rights',
          body: [
            'Send a request to contact@valthoris.com or use the Contact DPO page. We answer within one month, extendable by two further months for complex requests.',
            'You may also lodge a complaint with your national supervisory authority (in Portugal, the CNPD).',
          ],
        },
      ]}
    />
  );
}
