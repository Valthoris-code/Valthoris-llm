import React from 'react';
import LegalDocument from './LegalDocument';

export default function DataProcessing() {
  return (
    <LegalDocument
      icon="🗄"
      title="Data Processing"
      subtitle="Purposes, categories, recipients and transfers of the data VALTHORIS processes."
      pdfAnchor="data-processing"
      sections={[
        {
          heading: 'Purposes of processing',
          body: [
            'Delivering the security modules you request (scanner, lookup, radar, threat intelligence).',
            'Detecting fraudulent and abusive activity across the network.',
            'Operating the Safe Location module for the duration you explicitly select.',
          ],
        },
        {
          heading: 'Decentralised infrastructure',
          body: [
            'Application logic runs on Internet Computer canisters replicated across independent node providers. Data written to a canister inherits the immutability and replication properties of the network.',
          ],
        },
        {
          heading: 'Sub-processors',
          body: [
            'The current sub-processor list is published in the official legal book. Any addition is announced before it becomes effective.',
          ],
        },
        {
          heading: 'International transfers',
          body: [
            'Node providers may operate outside the EEA. Transfers rely on Standard Contractual Clauses together with technical safeguards such as encryption in transit.',
          ],
        },
        {
          heading: 'Security measures',
          body: [
            'Cryptographic authentication, least-privilege canister interfaces, audit logging and continuous vulnerability review.',
          ],
        },
      ]}
    />
  );
}
