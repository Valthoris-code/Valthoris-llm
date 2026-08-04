import React from 'react';
import LegalDocument from './LegalDocument';

export default function ResponsibleDisclosure() {
  return (
    <LegalDocument
      icon="🧪"
      title="Responsible Disclosure"
      subtitle="How to report a vulnerability in VALTHORIS safely and legally."
      pdfAnchor="disclosure"
      sections={[
        {
          heading: 'Reporting channel',
          body: [
            'Send vulnerability reports to contact@valthoris.com with the subject "Security Incident". Include reproduction steps, affected endpoints and any proof-of-concept material.',
          ],
        },
        {
          heading: 'Our commitment',
          body: [
            'We acknowledge reports within 72 hours, provide a triage outcome within 10 working days, and keep you informed until remediation is deployed.',
            'We will not pursue legal action against researchers who follow this policy in good faith.',
          ],
        },
        {
          heading: 'Scope',
          body: [
            'In scope: the VALTHORIS web application, its canisters and its public APIs.',
            'Out of scope: denial of service, social engineering of staff, physical attacks, and findings that only affect unsupported browsers.',
          ],
        },
        {
          heading: 'Researcher obligations',
          body: [
            'Do not access, modify or exfiltrate data belonging to other users. Use only test accounts, and stop as soon as a vulnerability is confirmed.',
          ],
        },
      ]}
    />
  );
}
