/**
 * /admin/administrators — the administrator register.
 *
 * Read-only in Phase 1. The two ROOT accounts are shown as protected: no
 * administrative mechanism exists to rename, demote, suspend or delete them,
 * and the database refuses those operations even for the service role.
 */

import React, { useEffect, useState } from 'react';
import { fetchAdministrators } from '../adminApi';
import type { AdministratorRow } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-PT');
}

export default function Administrators() {
  const [rows, setRows] = useState<AdministratorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdministrators()
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
      <h1 className="vadmin-page-title">Administradores</h1>
      <p className="vadmin-page-sub">
        Contas com acesso à Administração Valthoris, as funções que detêm e o estado de MFA.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {!rows && !error && <p className="vadmin-page-sub">A carregar…</p>}

      {rows && (
        <div className="vadmin-card vadmin-table-wrap">
          <table className="vadmin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Função</th>
                <th>Estado</th>
                <th>MFA</th>
                <th>Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    {row.display_name}{' '}
                    {row.is_root && (
                      <span className="vadmin-badge root" title="Conta ROOT permanente e protegida">
                        ROOT protegido
                      </span>
                    )}
                  </td>
                  <td>{row.email}</td>
                  <td>{row.roles.join(', ') || '—'}</td>
                  <td>
                    <span className={'vadmin-badge ' + (row.status === 'ACTIVE' ? 'ok' : 'warn')}>
                      {row.status}
                    </span>{' '}
                    {!row.account_linked && (
                      <span className="vadmin-badge warn" title="Ainda não iniciou sessão">
                        sem sessão
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={'vadmin-badge ' + (row.mfa_required ? 'ok' : 'warn')}>
                      {row.mfa_required ? 'obrigatório' : 'opcional'}
                    </span>
                  </td>
                  <td>{formatDate(row.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="vadmin-note" style={{ marginTop: '1rem' }}>
        Os dois administradores ROOT são permanentes. A base de dados recusa qualquer alteração
        de e-mail, despromoção, suspensão ou eliminação, bem como a criação de um terceiro ROOT.
        A gestão de administradores com funções limitadas (SECURITY, DATA, SUPPORT, BILLING,
        AUDITOR) já está modelada em governance.roles e será operável nas fases seguintes.
      </p>
    </>
  );
}
