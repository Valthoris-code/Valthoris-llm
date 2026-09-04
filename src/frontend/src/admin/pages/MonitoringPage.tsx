/**
 * /admin/monitoring — Monitorização Global.
 *
 * One recent-activity feed built on what the administration already records:
 * `governance.audit_logs` and `governance.error_logs`. No new collection point
 * is introduced, and nothing is polled from outside this project.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { fetchMonitoring } from '../adminApi';
import type { MonitoringFeed } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { EmptyState, Stat, formatDate } from './commandCenterUi';

const STATE_BADGE: Record<string, string> = {
  SUCCESS: 'ok',
  DENIED: 'warn',
  FAILURE: 'danger',
  INFO: '',
  WARNING: 'warn',
  ERROR: 'danger',
  CRITICAL: 'danger',
};

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchMonitoring()
      .then(result => {
        if (cancelled) return;
        setData(result);
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
  }, []);

  useEffect(() => load(), [load]);

  return (
    <>
      <h1 className="vadmin-page-title">Monitorização Global</h1>
      <p className="vadmin-page-sub">
        Feed dos eventos recentes da administração: auditoria e registo técnico de erros.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && !data && <EmptyState>A ler os eventos recentes…</EmptyState>}

      {data && (
        <>
          <div className="vadmin-grid" style={{ marginBottom: '1.2rem' }}>
            <Stat
              label="Eventos auditados (24 h)"
              value={data.counters.audit24h}
              hint="governance.audit_logs"
            />
            <Stat
              label="Acessos negados (24 h)"
              value={data.counters.denied24h}
              hint="Pedidos bloqueados pelo backend"
            />
            <Stat
              label="Erros técnicos (24 h)"
              value={data.counters.errors24h}
              hint="governance.error_logs"
            />
          </div>

          <p style={{ marginBottom: '1rem' }}>
            <button
              className="vadmin-btn-ghost"
              type="button"
              disabled={loading}
              onClick={() => load()}
            >
              {loading ? 'A atualizar…' : 'Atualizar'}
            </button>
          </p>

          {data.events.length === 0 ? (
            <EmptyState>Ainda não há eventos registados.</EmptyState>
          ) : (
            <div className="vadmin-card vadmin-table-wrap">
              <table className="vadmin-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Origem</th>
                    <th>Evento</th>
                    <th>Quem</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event, index) => (
                    <tr key={`${event.kind}-${event.occurred_at}-${index}`}>
                      <td>{formatDate(event.occurred_at)}</td>
                      <td>{event.kind === 'AUDIT' ? 'Auditoria' : 'Erro'}</td>
                      <td>
                        {event.title ?? '—'}
                        {event.detail && <div className="vadmin-stat-hint">{event.detail}</div>}
                      </td>
                      <td>{event.actor ?? '—'}</td>
                      <td>
                        {event.state ? (
                          <span className={'vadmin-badge ' + (STATE_BADGE[event.state] ?? '')}>
                            {event.state}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="vadmin-stat-hint" style={{ marginTop: '0.8rem' }}>
            Gerado em {formatDate(data.generatedAt)}.
          </p>
        </>
      )}
    </>
  );
}
