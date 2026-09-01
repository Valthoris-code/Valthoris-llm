/**
 * /admin/roles — the RBAC model, read from the database.
 *
 * The permissions listed here are the ones stored in
 * `governance.role_permissions`; the frontend never keeps its own copy. ROOT is
 * shown as implicit-all because `governance.has_permission()` short-circuits
 * for it instead of relying on an enumeration that could drift.
 */

import React, { useEffect, useState } from 'react';
import { fetchRoles } from '../adminApi';
import type { RoleRow } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';

export default function RolesPage() {
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRoles()
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch(() => {
        if (!cancelled) setError(ADMIN_GENERIC_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1 className="vadmin-page-title">Funções &amp; Permissões</h1>
      <p className="vadmin-page-sub">
        Modelo RBAC da Administração. As permissões vivem na base de dados, nunca no frontend.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {!rows && !error && <p className="vadmin-page-sub">A carregar…</p>}

      {rows && (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {rows.map(role => (
            <div className="vadmin-card" key={role.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <strong>{role.name}</strong>
                <span className={'vadmin-badge' + (role.is_root ? ' root' : '')}>{role.key}</span>
                <span className="vadmin-badge">{role.admin_count} admin(s)</span>
              </div>
              <p className="vadmin-stat-hint" style={{ marginTop: '0.35rem' }}>
                {role.description}
              </p>
              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {role.is_root ? (
                  <span className="vadmin-badge root">acesso total (implícito)</span>
                ) : (
                  role.permissions.map(permission => (
                    <span className="vadmin-badge" key={permission}>{permission}</span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
