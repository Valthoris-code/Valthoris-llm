/**
 * /admin/statistics — Estatísticas.
 *
 * Real row counts of the tables this Supabase project actually has. Nothing
 * here is estimated, sampled or imported from anywhere else: a table that does
 * not exist on this database is reported as "sem dados" instead of as a zero.
 */

import React, { useEffect, useState } from 'react';
import { fetchStatistics } from '../adminApi';
import type { CommandCenterStats } from '../adminApi';
import { ADMIN_GENERIC_ERROR } from '../adminClient';
import { Count, EmptyState, Stat, formatDate } from './commandCenterUi';

/** Human names for the tables that are counted. */
const TABLE_LABELS: Record<string, string> = {
  'public.fraud_reports': 'Denúncias',
  'public.blacklist_entries': 'Entradas na blacklist',
  'public.entity_reputation': 'Entidades com reputação',
  'public.entity_reputation_history': 'Alterações de reputação',
  'public.fraud_events': 'Eventos de fraude',
  'public.fraud_decisions': 'Decisões de fraude',
  'public.fraud_workflow_runs': 'Execuções de workflow',
  'public.profiles': 'Perfis',
  'public.notifications': 'Notificações',
  'public.waiting_list': 'Lista de espera',
  'public.safe_rooms': 'Safe rooms',
  'public.safe_room_messages': 'Mensagens em safe rooms',
  'public.cached_news': 'Notícias em cache',
  'governance.admins': 'Administradores',
  'governance.roles': 'Perfis de acesso',
  'governance.audit_logs': 'Registos de auditoria',
  'governance.error_logs': 'Erros registados',
};

export default function StatisticsPage() {
  const [stats, setStats] = useState<CommandCenterStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchStatistics()
      .then(data => {
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
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

  return (
    <>
      <h1 className="vadmin-page-title">Estatísticas</h1>
      <p className="vadmin-page-sub">
        Contagens reais das tabelas deste projeto Supabase. Nenhum valor é estimado
        e nenhum vem de sistemas externos.
      </p>

      {error && <div className="vadmin-alert" role="alert">{error}</div>}
      {loading && !stats && <EmptyState>A ler as contagens…</EmptyState>}

      {stats && (
        <>
          <div className="vadmin-grid">
            <Stat
              label="Denúncias"
              value={<Count value={stats.reports.total} />}
              hint={`${stats.reports.last7d} nos últimos 7 dias · ${stats.reports.confirmed} confirmadas`}
            />
            <Stat
              label="Blacklist ativa"
              value={<Count value={stats.blacklist.active} />}
              hint={`${stats.blacklist.total} entradas no total`}
            />
            <Stat
              label="Entidades avaliadas"
              value={<Count value={stats.reputation.total} />}
              hint={`${stats.reputation.flagged} suspeitas ou perigosas`}
            />
            <Stat
              label="Contas da plataforma"
              value={<Count value={stats.users.total} />}
              hint={`${stats.users.new7d} nos últimos 7 dias`}
            />
          </div>

          <h2 className="vadmin-section-title" style={{ marginTop: '1.8rem' }}>
            Contagem por tabela
          </h2>
          <div className="vadmin-card vadmin-table-wrap">
            <table className="vadmin-table">
              <thead>
                <tr>
                  <th>Tabela</th>
                  <th>Nome técnico</th>
                  <th style={{ textAlign: 'right' }}>Registos</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.tables).map(([name, count]) => (
                  <tr key={name}>
                    <td>{TABLE_LABELS[name] ?? name}</td>
                    <td className="vadmin-secret">{name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Count value={count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="vadmin-stat-hint" style={{ marginTop: '0.8rem' }}>
            Gerado em {formatDate(stats.generatedAt)}.
          </p>
        </>
      )}
    </>
  );
}
