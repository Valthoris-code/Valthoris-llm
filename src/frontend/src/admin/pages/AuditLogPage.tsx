/**
 * /admin/audit — the audit trail.
 *
 * WHO / WHEN / WHAT / TARGET / PERMISSION / RESULT / EVIDENCE, paginated,
 * searchable and filterable. The table is append-only in the database: it has
 * no UPDATE or DELETE policy, so it cannot be rewritten from the application.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { fetchAuditLogs } from '../adminApi';
import type { AuditLogRow } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';

const PAGE_SIZE = 25;

const RESULT_BADGE: Record<string, string> = {
  SUCCESS: 'ok',
  DENIED: 'warn',
  FAILURE: 'danger',
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchAuditLogs({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search || undefined,
      result: result || undefined,
    })
      .then(data => {
        if (cancelled) return;
        setRows(data.items);
        setTotal(data.total);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(ADMIN_GENERIC_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, search, result]);

  useEffect(() => load(), [load]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <>
      <h1 className="vadmin-page-title">Registo de Auditoria</h1>
      <p className="vadmin-page-sub">
        Quem, quando, o quê, com que permissão e com que resultado. Registo imutável.
      </p>

      <form
        className="vadmin-card"
        style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        onSubmit={event => {
          event.preventDefault();
          setPage(0);
          setSearch(pendingSearch.trim());
        }}
      >
        <input
          className="vadmin-input"
          style={{ flex: '1 1 220px' }}
          placeholder="Pesquisar por ação, administrador ou alvo"
          value={pendingSearch}
          maxLength={120}
          onChange={e => setPendingSearch(e.target.value)}
          aria-label="Pesquisar no registo de auditoria"
        />
        <select
          className="vadmin-select"
          style={{ flex: '0 0 160px' }}
          value={result}
          aria-label="Filtrar por resultado"
          onChange={e => {
            setPage(0);
            setResult(e.target.value);
          }}
        >
          <option value="">Todos os resultados</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DENIED">DENIED</option>
          <option value="FAILURE">FAILURE</option>
        </select>
        <button className="vadmin-btn" type="submit">Filtrar</button>
      </form>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}

      <div className="vadmin-card vadmin-table-wrap">
        <table className="vadmin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Administrador</th>
              <th>Ação</th>
              <th>Alvo</th>
              <th>Permissão</th>
              <th>Resultado</th>
              <th>Request ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{new Date(row.occurred_at).toLocaleString('pt-PT')}</td>
                <td>{row.actor_email ?? '—'}</td>
                <td>{row.action}</td>
                <td>
                  {row.target_type ?? '—'}
                  {row.target_id ? ` · ${row.target_id}` : ''}
                </td>
                <td>{row.permission ?? '—'}</td>
                <td>
                  <span className={'vadmin-badge ' + (RESULT_BADGE[row.result] ?? '')}>
                    {row.result}
                  </span>
                  {row.reason && <div className="vadmin-stat-hint">{row.reason}</div>}
                </td>
                <td className="vadmin-secret">{row.request_id ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--vadmin-muted)' }}>
                  Sem registos para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginTop: '0.9rem',
          color: 'var(--vadmin-muted)',
          fontSize: '0.8rem',
        }}
      >
        <button
          className="vadmin-btn-ghost"
          type="button"
          disabled={page === 0 || loading}
          onClick={() => setPage(p => Math.max(0, p - 1))}
        >
          Anterior
        </button>
        <span>
          Página {page + 1} de {lastPage + 1} · {total} registos
        </span>
        <button
          className="vadmin-btn-ghost"
          type="button"
          disabled={page >= lastPage || loading}
          onClick={() => setPage(p => p + 1)}
        >
          Seguinte
        </button>
      </div>
    </>
  );
}
