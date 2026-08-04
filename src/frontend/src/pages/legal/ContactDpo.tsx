import React from 'react';
import LegalDocument from './LegalDocument';

export default function ContactDpo() {
  return (
    <LegalDocument
      icon="👤"
      title="Contact DPO"
      subtitle="Reach the VALTHORIS Data Protection Officer."
      pdfAnchor="dpo"
      sections={[
        {
          heading: 'When to contact the DPO',
          body: [
            'Contact the Data Protection Officer for any question about how your personal data is processed, to exercise your GDPR rights, or to raise a privacy concern.',
          ],
        },
        {
          heading: 'How to contact',
          body: [
            'Email: contact@valthoris.com — subject "DPO".',
            'Please include enough detail to identify your account (for example your Internet Identity principal) without sending unnecessary personal data.',
          ],
        },
        {
          heading: 'Response times',
          body: [
            'Requests are answered within one month. Complex requests may be extended by two further months, in which case you are informed of the reason.',
          ],
        },
        {
          heading: 'Supervisory authority',
          body: [
            'You may lodge a complaint with your national data protection authority at any time.',
          ],
        },
      ]}
    />
  );
}
