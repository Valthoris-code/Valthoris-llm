import React from 'react';
import LegalDocument from './LegalDocument';

export default function Copyright() {
  return (
    <LegalDocument
      icon="©"
      title="Copyright"
      subtitle="Ownership of the VALTHORIS brand, software and documentation."
      pdfAnchor="copyright"
      sections={[
        {
          heading: 'Ownership',
          body: [
            `© ${new Date().getFullYear()} VALTHORIS. The VALTHORIS name, logo, interface design and documentation are protected works.`,
          ],
        },
        {
          heading: 'Permitted use',
          body: [
            'You may reference VALTHORIS in reviews, research and reporting. Reproducing the interface or documentation for commercial purposes requires written permission.',
          ],
        },
        {
          heading: 'Third-party components',
          body: [
            'The platform builds on open source software, including React, the DFINITY agent libraries and OpenStreetMap data. Their respective licences and attributions apply.',
          ],
        },
        {
          heading: 'Infringement notices',
          body: ['Send copyright notices to contact@valthoris.com with a description of the alleged infringement.'],
        },
      ]}
    />
  );
}
