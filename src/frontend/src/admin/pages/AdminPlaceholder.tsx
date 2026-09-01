/**
 * Placeholder for the administrative sections whose backend belongs to a later
 * phase of the build order.
 *
 * It states plainly what the section will hold and which phase delivers it,
 * instead of rendering an empty table that looks like a bug or, worse, invented
 * numbers. The navigation entry, the route and the permission already exist, so
 * each phase only has to replace this component.
 */

import React from 'react';
import type { AdminNavItem } from '../adminNav';

export default function AdminPlaceholder({ item }: { item: AdminNavItem }) {
  return (
    <>
      <h1 className="vadmin-page-title">
        <span aria-hidden="true">{item.icon}</span> {item.label}
      </h1>
      <p className="vadmin-page-sub">{item.summary}</p>

      <div className="vadmin-card">
        <span className="vadmin-badge warn">Fase {item.phase}</span>
        <p style={{ marginTop: '0.7rem', color: 'var(--vadmin-muted)', fontSize: '0.85rem' }}>
          Esta área faz parte da arquitetura da Administração e já tem rota, permissão
          (<code>{item.permission}</code>) e navegação. Os dados serão ligados na fase {item.phase}
          {' '}da ordem de construção, para que cada fase seja entregue testada e a aplicação
          continue funcional.
        </p>
      </div>
    </>
  );
}
