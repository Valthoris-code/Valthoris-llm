/**
 * /admin/intel-sources — the state of every external intelligence source.
 *
 * The assistant answers a user with a single generic sentence when a source
 * fails, which is deliberate; this page is where the real cause lives. Each row
 * shows what the source is, whether it is configured, and — after a test — the
 * exact outcome of a real lookup: HTTP 401 (credential rejected), 403 (blocked),
 * 404 (endpoint retired), 429 (quota) or a timeout.
 *
 * Nothing here is inferred by the browser: every state comes from a lookup the
 * backend actually performed, and secrets are only ever named, never shown.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { fetchIntelSources } from '../adminApi';
import type { IntelSourceRow } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';

const STATUS_LABEL: Record<IntelSourceRow['status'], { icon: string; text: string; badge: string }> = {
  operational:    { icon: '✅', text: 'Operacional',     badge: 'ok' },
  degraded:       { icon: '⚠️', text: 'Degradado',       badge: 'warn' },
  not_configured: { icon: '➖', text: 'Não configurada', badge: '' },
  disabled:       { icon: '⊘',  text: 'Desativada',      badge: '' },
};

function sourceId(row: IntelSourceRow): string {
  return `${row.provider}|${row.endpoint}`;
}

export default function IntelSourcesPage() {
  const [rows, setRows] = useState<IntelSourceRow[]>([]);
  const [probedAt, setProbedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback((probe?: string) => {
    setLoading(true);
    return fetchIntelSources(probe)
      .then(data => {
        setError(null);
        if (probe && probe !== 'all') {
          // A single test replaces only its own row; the rest of the table
          // keeps the state it was read with.
          const updated = data.sources[0];
          if (updated) {
            setRows(current =>
              current.map(row => (sourceId(row) === sourceId(updated) ? updated : row)),
            );
          }
        } else {
          setRows(data.sources);
          setProbedAt(data.probedAt);
        }
      })
      .catch(() => setError(ADMIN_GENERIC_ERROR))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = (probe: string) => {
    setTesting(probe);
    void load(probe).finally(() => setTesting(null));
  };

  const operational = rows.filter(r => r.status === 'operational').length;
  const degraded = rows.filter(r => r.status === 'degraded').length;

  return (
    <>
      <h1 className="vadmin-page-title">Fontes de Intel</h1>
      <p className="vadmin-page-sub">
        Estado real de cada fonte externa consultada pelo Assistente IA. Um teste envia
        um pedido verdadeiro ao fornecedor e mostra exatamente o que respondeu.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}

      <div
        className="vadmin-card"
        style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}
      >
        <button
          className="vadmin-btn"
          type="button"
          disabled={loading}
          onClick={() => runTest('all')}
        >
          {testing === 'all' ? 'A testar…' : 'Testar todas agora'}
        </button>
        <button
          className="vadmin-btn-ghost"
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          Recarregar estado
        </button>
        <span style={{ color: 'var(--vadmin-muted)', fontSize: '0.8rem' }}>
          {rows.length} fontes · {operational} operacionais · {degraded} degradadas
          {probedAt
            ? ` · testadas em ${new Date(probedAt).toLocaleString('pt-PT')}`
            : ' · estado por configuração (sem teste ainda)'}
        </span>
      </div>

      <div className="vadmin-card vadmin-table-wrap">
        <table className="vadmin-table">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Consulta</th>
              <th>Estado</th>
              <th>Último resultado</th>
              <th>Segredos</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const id = sourceId(row);
              const label = STATUS_LABEL[row.status];
              return (
                <tr key={id}>
                  <td>{row.provider}</td>
                  <td className="vadmin-stat-hint">{row.endpoint}</td>
                  <td>
                    <span className={'vadmin-badge ' + label.badge}>
                      {label.icon} {label.text}
                    </span>
                  </td>
                  <td>
                    <div className="vadmin-stat-hint">
                      {new Date(row.checkedAt).toLocaleString('pt-PT')}
                      {row.probed
                        ? ` · pedido real${typeof row.durationMs === 'number' ? ` (${row.durationMs} ms)` : ''}`
                        : ' · sem teste'}
                    </div>
                    {row.error && (
                      <div style={{ color: 'var(--vadmin-muted)' }}>
                        {row.httpStatus ? `HTTP ${row.httpStatus} · ` : ''}
                        {row.error}
                      </div>
                    )}
                  </td>
                  <td className="vadmin-secret">
                    {row.secrets.length > 0 ? row.secrets.join(', ') : '— (sem credencial)'}
                  </td>
                  <td>
                    <button
                      className="vadmin-btn-ghost"
                      type="button"
                      disabled={loading || row.status === 'disabled'}
                      onClick={() => runTest(id)}
                    >
                      {testing === id ? 'A testar…' : 'Testar agora'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--vadmin-muted)' }}>
                  Nenhuma fonte devolvida pelo backend.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
