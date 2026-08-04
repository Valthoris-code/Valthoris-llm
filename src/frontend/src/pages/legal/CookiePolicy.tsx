import React from 'react';
import { Link } from 'react-router-dom';
import LegalDocument from './LegalDocument';

export default function CookiePolicy() {
  return (
    <>
      <LegalDocument
        icon="🍪"
        title="Cookie Policy"
        subtitle="Which cookies and local storage keys VALTHORIS uses, and why."
        pdfAnchor="cookies"
        sections={[
          {
            heading: '1. What we store',
            body: [
              'VALTHORIS stores a small number of keys in your browser: your consent record, your language preference, and the session material required by Internet Identity.',
            ],
          },
          {
            heading: '2. Categories',
            body: [
              'Essential — authentication, routing and core security. Always active because the platform cannot function without them.',
              'Analytics — aggregated usage statistics used to prioritise product work.',
              'Performance — latency and error telemetry.',
              'Marketing — campaign attribution and product announcements.',
              'Security — threat detection signals and session integrity checks.',
              'Fraud Detection — signals used to identify abusive or fraudulent activity.',
            ],
          },
          {
            heading: '3. Managing your choices',
            body: [
              'You can review or change every optional category at any time from the cookie preferences page. Withdrawing consent is as easy as granting it.',
            ],
          },
          {
            heading: '4. Third parties',
            body: [
              'The beta does not embed third-party advertising trackers. Any future processor will be listed here before activation.',
            ],
          },
        ]}
      />
      <div className="page legal-cta">
        <Link className="btn-primary legal-btn" to="/legal/cookie-preferences">
          ⚙️ Manage cookie preferences
        </Link>
      </div>
    </>
  );
}
