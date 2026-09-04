import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SecurityBadge — the fixed "Segurança by design" seal.
 *
 * It is its own fixed layer, rendered once for the whole application: it sits
 * in the bottom-right corner of the viewport, stays there while the page
 * scrolls and belongs to no page in particular. It changes nothing else in the
 * layout — it is out of the document flow and never receives a pointer event,
 * so it cannot cover a control the user is trying to press.
 *
 * The Administration & Governance Center is deliberately excluded: that area is
 * self-contained, has its own shell and its own stylesheet, and nothing from
 * the public application is rendered inside it.
 */
export default function SecurityBadge() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;

  return (
    <div className="security-badge" role="note" aria-label="Segurança by design">
      <span className="security-badge-icon" aria-hidden="true">🛡️</span>
      <span className="security-badge-text">Segurança by design</span>
    </div>
  );
}
