import React from 'react';
import LegalDocument from './LegalDocument';

export default function SecurityPolicy() {
  return (
    <LegalDocument
      icon="🛡"
      title="Security Policy"
      subtitle="The controls VALTHORIS applies to protect the platform and its users."
      pdfAnchor="security"
      sections={[
        {
          heading: 'Authentication',
          body: [
            'Internet Identity provides passwordless, phishing-resistant authentication. Sessions are scoped per device and can be revoked from your profile.',
          ],
        },
        {
          heading: 'Data protection',
          body: [
            'All traffic is served over TLS. Sensitive user input is validated client-side and re-validated by the canisters before it is persisted.',
          ],
        },
        {
          heading: 'Monitoring',
          body: [
            'Security-relevant events are audit-logged. Anomalies feed the fraud detection pipeline described in the Data Processing page.',
          ],
        },
        {
          heading: 'Incident response',
          body: [
            'Confirmed personal data breaches are notified to the competent supervisory authority within 72 hours, and to affected users without undue delay where the risk is high.',
          ],
        },
        {
          heading: 'Reporting',
          body: ['Vulnerabilities should be reported through the Responsible Disclosure process.'],
        },
      ]}
    />
  );
}
