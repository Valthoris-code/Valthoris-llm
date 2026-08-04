import React from 'react';
import LegalDocument from './LegalDocument';

export default function Terms() {
  return (
    <LegalDocument
      icon="📋"
      title="Terms and Conditions"
      subtitle="The rules that govern your use of the VALTHORIS platform."
      pdfAnchor="terms"
      sections={[
        {
          heading: '1. Scope',
          body: [
            'These terms apply to every visitor and registered user of VALTHORIS, including the Beta Private programme. By using the platform you accept them in full.',
          ],
        },
        {
          heading: '2. Beta status',
          body: [
            'VALTHORIS is currently distributed as a private beta. Features may change, be disabled or be reset without prior notice, and results must not be treated as legal or forensic evidence.',
          ],
        },
        {
          heading: '3. Acceptable use',
          body: [
            'You may not use VALTHORIS to harass individuals, to publish unlawful accusations, to reverse engineer protective mechanisms, or to submit deliberately false community reports.',
            'Automated access, scraping and load testing require prior written authorisation.',
          ],
        },
        {
          heading: '4. Intelligence disclaimer',
          body: [
            'Threat scores, lookups and AI answers are probabilistic signals. They do not constitute a determination of guilt and must be independently verified before any action is taken.',
          ],
        },
        {
          heading: '5. Accounts',
          body: [
            'Authentication uses Internet Identity. You are responsible for safeguarding the devices and passkeys attached to your identity.',
          ],
        },
        {
          heading: '6. Liability',
          body: [
            'To the maximum extent permitted by applicable law, VALTHORIS is provided "as is" during the beta period, without warranty of availability, accuracy or fitness for a particular purpose.',
          ],
        },
        {
          heading: '7. Governing law',
          body: [
            'These terms are governed by Portuguese law and by the applicable regulations of the European Union.',
          ],
        },
      ]}
    />
  );
}
