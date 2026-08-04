import React from 'react';
import LegalDocument from './LegalDocument';

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      icon="🔒"
      title="Privacy Policy"
      subtitle="How VALTHORIS collects, uses, stores and protects personal data."
      pdfAnchor="privacy"
      sections={[
        {
          heading: '1. Controller',
          body: [
            'VALTHORIS operates as the data controller for the personal data processed through this platform. Requests regarding this policy may be sent to contact@valthoris.com.',
          ],
        },
        {
          heading: '2. Data we process',
          body: [
            'Account data: your Internet Identity principal, display name and optional profile fields.',
            'Security data: scan inputs, lookup queries and community reports that you voluntarily submit.',
            'Technical data: device and browser characteristics required to keep sessions secure and to detect abuse.',
            'Location data: only processed when you explicitly enable the Safe Location module, and only for the duration you select.',
          ],
        },
        {
          heading: '3. Lawful basis',
          body: [
            'We rely on consent for optional cookies, analytics and location sharing; on contractual necessity for delivering the service you request; and on legitimate interest for fraud prevention and platform security.',
          ],
        },
        {
          heading: '4. Retention',
          body: [
            'Location shares expire automatically at the end of the selected duration. Security telemetry is retained only for as long as needed to investigate abuse.',
          ],
        },
        {
          heading: '5. Your rights',
          body: [
            'You may request access, rectification, erasure, restriction, portability and objection at any time. See the GDPR Rights page for the full description and how to exercise each right.',
          ],
        },
        {
          heading: '6. Decentralised processing',
          body: [
            'Core logic runs on Internet Computer canisters. Data written on-chain is replicated across independent node providers and is subject to the constraints described in the Data Processing page.',
          ],
        },
      ]}
    />
  );
}
